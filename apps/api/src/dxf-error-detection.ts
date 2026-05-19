import path from "node:path";
import { backupDatabaseBeforeMigration, DatabaseSync } from "./db.js";
import type { BrainCoreService } from "./brain-core.js";
import { parseDxfSegments } from "./part-dna.js";

type DxfSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type DxfErrorSeverity = "info" | "warning" | "critical";

export type DxfErrorReportRecord = {
  id: number;
  workspaceId: string;
  dxfFileId: string;
  partDnaId: number | null;
  severity: DxfErrorSeverity;
  errorType: string;
  message: string;
  entityRef: string | null;
  payloadJson: string;
  createdAt: string;
};

export type DxfErrorCheckResult = {
  dxfFileId: string;
  partDnaId: number | null;
  reports: DxfErrorReportRecord[];
  summary: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
  recommendedFixes: string[];
};

export type DxfErrorWorkspaceSummary = {
  dxfFileId: string;
  partDnaId: number | null;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  latestAt: string;
};

type CheckDxfInput = {
  workspaceId: string;
  dxfFileId: string;
  rawDxf: string;
  partDnaId?: number | null;
  thickness?: number | null;
};

function round(value: number, precision = 0.01) {
  return Math.round(value / precision) * precision;
}

function segmentLength(seg: DxfSegment) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function area(width: number, height: number) {
  return Math.max(0, width) * Math.max(0, height);
}

function keyPoint(x: number, y: number) {
  return `${round(x, 0.01).toFixed(2)},${round(y, 0.01).toFixed(2)}`;
}

function splitContours(segments: DxfSegment[]) {
  if (!segments.length) return [] as DxfSegment[][];
  const endpointMap = new Map<string, number[]>();
  segments.forEach((seg, index) => {
    const keys = [keyPoint(seg.x1, seg.y1), keyPoint(seg.x2, seg.y2)];
    for (const key of keys) {
      if (!endpointMap.has(key)) endpointMap.set(key, []);
      endpointMap.get(key)!.push(index);
    }
  });
  const visited = new Array(segments.length).fill(false);
  const contours: DxfSegment[][] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (visited[i]) continue;
    const queue = [i];
    visited[i] = true;
    const component: DxfSegment[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      const seg = segments[current];
      component.push(seg);
      const keys = [keyPoint(seg.x1, seg.y1), keyPoint(seg.x2, seg.y2)];
      for (const key of keys) {
        for (const neighbor of endpointMap.get(key) ?? []) {
          if (visited[neighbor]) continue;
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }
    contours.push(component);
  }
  return contours;
}

function isClosedContour(segments: DxfSegment[]) {
  const degree = new Map<string, number>();
  for (const seg of segments) {
    for (const key of [keyPoint(seg.x1, seg.y1), keyPoint(seg.x2, seg.y2)]) {
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  }
  return Array.from(degree.values()).every((value) => value % 2 === 0);
}

function boundsOf(segments: DxfSegment[]) {
  if (!segments.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const seg of segments) {
    minX = Math.min(minX, seg.x1, seg.x2);
    minY = Math.min(minY, seg.y1, seg.y2);
    maxX = Math.max(maxX, seg.x1, seg.x2);
    maxY = Math.max(maxY, seg.y1, seg.y2);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function parseEntityTypes(rawDxf: string) {
  const supported = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "VERTEX", "SEQEND", "CIRCLE", "ARC"]);
  const lines = rawDxf.replace(/\r/g, "").split("\n");
  let section = "";
  let awaitingSectionName = false;
  const types: string[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === "0" && value === "SECTION") {
      awaitingSectionName = true;
      continue;
    }
    if (awaitingSectionName && code === "2") {
      section = value;
      awaitingSectionName = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") types.push(value);
  }
  const unsupported = Array.from(new Set(types.filter((type) => !supported.has(type))));
  return { types, unsupported };
}

function detectDuplicateLines(segments: DxfSegment[]) {
  const seen = new Map<string, number>();
  const duplicates: Array<{ key: string; count: number }> = [];
  for (const seg of segments) {
    const a = `${round(seg.x1, 0.01).toFixed(2)},${round(seg.y1, 0.01).toFixed(2)}`;
    const b = `${round(seg.x2, 0.01).toFixed(2)},${round(seg.y2, 0.01).toFixed(2)}`;
    const key = a < b ? `${a}>${b}` : `${b}>${a}`;
    const next = (seen.get(key) ?? 0) + 1;
    seen.set(key, next);
  }
  for (const [key, count] of seen.entries()) {
    if (count > 1) duplicates.push({ key, count });
  }
  return duplicates;
}

function detectOverlappingGeometry(segments: DxfSegment[]) {
  const overlaps: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      const aHorizontal = Math.abs(a.y1 - a.y2) < 0.01;
      const bHorizontal = Math.abs(b.y1 - b.y2) < 0.01;
      if (aHorizontal && bHorizontal && Math.abs(a.y1 - b.y1) < 0.01) {
        const [aMin, aMax] = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)];
        const [bMin, bMax] = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)];
        if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0.1) overlaps.push(`segments:${i + 1}-${j + 1}`);
      }
      const aVertical = Math.abs(a.x1 - a.x2) < 0.01;
      const bVertical = Math.abs(b.x1 - b.x2) < 0.01;
      if (aVertical && bVertical && Math.abs(a.x1 - b.x1) < 0.01) {
        const [aMin, aMax] = [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)];
        const [bMin, bMax] = [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];
        if (Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0.1) overlaps.push(`segments:${i + 1}-${j + 1}`);
      }
      if (overlaps.length >= 10) return overlaps;
    }
  }
  return overlaps;
}

function detectThinWebs(contours: DxfSegment[], thickness: number | null) {
  if (!thickness || thickness <= 0) return [] as string[];
  const contourBounds = contours.map((contour, index) => ({ index, bounds: boundsOf(contour) })).filter((entry) => entry.bounds);
  const warnings: string[] = [];
  for (let i = 0; i < contourBounds.length; i += 1) {
    for (let j = i + 1; j < contourBounds.length; j += 1) {
      const a = contourBounds[i].bounds!;
      const b = contourBounds[j].bounds!;
      const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
      const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
      const gap = Math.min(gapX || Number.POSITIVE_INFINITY, gapY || Number.POSITIVE_INFINITY);
      if (Number.isFinite(gap) && gap > 0 && gap < thickness * 1.5) {
        warnings.push(`contours:${contourBounds[i].index + 1}-${contourBounds[j].index + 1}`);
      }
      if (warnings.length >= 10) return warnings;
    }
  }
  return warnings;
}

function rowToReport(row: Record<string, unknown>): DxfErrorReportRecord {
  return {
    id: Number(row.id ?? 0),
    workspaceId: String(row.workspaceId ?? ""),
    dxfFileId: String(row.dxfFileId ?? ""),
    partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
    severity: row.severity === "warning" || row.severity === "critical" ? row.severity : "info",
    errorType: String(row.errorType ?? ""),
    message: String(row.message ?? ""),
    entityRef: row.entityRef ? String(row.entityRef) : null,
    payloadJson: String(row.payloadJson ?? "{}"),
    createdAt: String(row.createdAt ?? "")
  };
}

export function openDxfErrorDetectionDatabase(rootDir: string) {
  const dbPath = path.join(rootDir, "qouterx-dxf-error-detection.sqlite");
  backupDatabaseBeforeMigration(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS dxf_error_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspaceId TEXT NOT NULL,
      dxfFileId TEXT NOT NULL,
      partDnaId INTEGER,
      severity TEXT NOT NULL,
      errorType TEXT NOT NULL,
      message TEXT NOT NULL,
      entityRef TEXT,
      payloadJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dxf_error_reports_file ON dxf_error_reports(workspaceId, dxfFileId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_dxf_error_reports_part ON dxf_error_reports(workspaceId, partDnaId, createdAt DESC);
  `);
  return db;
}

export class DxfErrorDetectionService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly brainCore: BrainCoreService
  ) {}

  checkDxf(input: CheckDxfInput): DxfErrorCheckResult {
    const dxfFileId = input.dxfFileId.trim();
    if (!dxfFileId) throw new Error("dxfFileId is required");
    const rawDxf = input.rawDxf;
    if (!rawDxf.trim()) throw new Error("rawDxf is required");
    const thickness = typeof input.thickness === "number" && Number.isFinite(input.thickness) ? input.thickness : null;
    const reports: DxfErrorReportRecord[] = [];
    const createdAt = new Date().toISOString();
    this.db.prepare(`DELETE FROM dxf_error_reports WHERE workspaceId = ? AND dxfFileId = ?`).run(input.workspaceId, dxfFileId);

    const pushReport = (
      severity: DxfErrorSeverity,
      errorType: string,
      message: string,
      entityRef: string | null = null,
      payload: Record<string, unknown> = {}
    ) => {
      const result = this.db.prepare(
        `INSERT INTO dxf_error_reports
         (workspaceId, dxfFileId, partDnaId, severity, errorType, message, entityRef, payloadJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.workspaceId,
        dxfFileId,
        input.partDnaId ?? null,
        severity,
        errorType,
        message,
        entityRef,
        JSON.stringify(payload),
        createdAt
      );
      reports.push({
        id: Number(result.lastInsertRowid ?? 0),
        workspaceId: input.workspaceId,
        dxfFileId,
        partDnaId: input.partDnaId ?? null,
        severity,
        errorType,
        message,
        entityRef,
        payloadJson: JSON.stringify(payload),
        createdAt
      });
    };

    const entityTypes = parseEntityTypes(rawDxf);
    if (entityTypes.unsupported.length) {
      pushReport(
        "warning",
        "unsupported_entities",
        `Unsupported DXF entities found: ${entityTypes.unsupported.join(", ")}.`,
        null,
        { unsupported: entityTypes.unsupported }
      );
    }

    const headerHints = rawDxf.toUpperCase();
    if (!headerHints.includes("$INSUNITS") && !headerHints.includes("$MEASUREMENT")) {
      pushReport(
        "warning",
        "missing_scale",
        "DXF does not declare clear units or measurement scale. Confirm the file is in millimetres before cutting."
      );
    }

    const segments = parseDxfSegments(rawDxf);
    if (!segments.length) {
      pushReport("critical", "no_supported_geometry", "No supported cut geometry was found in this DXF.");
      return this.buildResult(dxfFileId, input.partDnaId ?? null, reports);
    }

    const contours = splitContours(segments);
    contours.forEach((contour, index) => {
      if (!isClosedContour(contour)) {
        pushReport("critical", "open_contours", `Contour ${index + 1} has open ends and will not cut as a closed profile.`, `contour:${index + 1}`);
      }
    });

    const duplicates = detectDuplicateLines(segments);
    if (duplicates.length) {
      pushReport("warning", "duplicate_lines", `Found ${duplicates.length} duplicate line group(s).`, duplicates[0]?.key ?? null, { duplicates });
    }

    const overlaps = detectOverlappingGeometry(segments);
    if (overlaps.length) {
      pushReport("warning", "overlapping_geometry", `Found ${overlaps.length} overlapping geometry area(s).`, overlaps[0] ?? null, { overlaps });
    }

    const shortSegments = segments
      .map((segment, index) => ({ index, length: segmentLength(segment) }))
      .filter((entry) => entry.length > 0 && entry.length < Math.max(0.5, (thickness ?? 1) * 0.2));
    if (shortSegments.length) {
      pushReport(
        "warning",
        "very_short_segments",
        `Found ${shortSegments.length} very short segment(s) that may cause machine hesitation or dirty cuts.`,
        `segment:${shortSegments[0]?.index ?? 0}`,
        { shortSegments }
      );
    }

    const contourBounds = contours.map((contour, index) => ({ index, contour, bounds: boundsOf(contour) })).filter((entry) => entry.bounds);
    const sortedContours = contourBounds
      .slice()
      .sort((left, right) => area(right.bounds!.width, right.bounds!.height) - area(left.bounds!.width, left.bounds!.height));
    const holeContours = sortedContours.slice(1);
    const tinyHoles = holeContours.filter((entry) => Math.min(entry.bounds!.width, entry.bounds!.height) < 2);
    if (tinyHoles.length) {
      pushReport("warning", "tiny_holes", `Found ${tinyHoles.length} tiny hole(s) below 2mm.`, `contour:${tinyHoles[0]?.index + 1}`, { tinyHoles });
    }
    if (thickness && thickness > 0) {
      const tooSmallForThickness = holeContours.filter((entry) => Math.min(entry.bounds!.width, entry.bounds!.height) < thickness);
      if (tooSmallForThickness.length) {
        pushReport(
          "critical",
          "holes_smaller_than_thickness",
          `Found ${tooSmallForThickness.length} hole(s) smaller than the material thickness (${thickness}mm).`,
          `contour:${tooSmallForThickness[0]?.index + 1}`,
          { tooSmallForThickness, thickness }
        );
      }
    }

    const estimatedPierceCount = contours.reduce((sum, contour) => {
      const degree = new Map<string, number>();
      for (const seg of contour) {
        for (const key of [keyPoint(seg.x1, seg.y1), keyPoint(seg.x2, seg.y2)]) {
          degree.set(key, (degree.get(key) ?? 0) + 1);
        }
      }
      const openEnds = Array.from(degree.values()).filter((value) => value % 2 === 1).length;
      return sum + (openEnds === 0 ? 1 : Math.max(1, Math.ceil(openEnds / 2)));
    }, 0);
    if (estimatedPierceCount > 120) {
      pushReport(
        estimatedPierceCount > 220 ? "critical" : "warning",
        "excessive_pierce_count",
        `Estimated pierce count is high at ${estimatedPierceCount}.`,
        null,
        { estimatedPierceCount }
      );
    }

    const thinWebs = detectThinWebs(contours, thickness);
    if (thinWebs.length) {
      pushReport(
        "warning",
        "thin_webs_likely_to_burn",
        `Detected ${thinWebs.length} likely thin web area(s) that may burn away during cutting.`,
        thinWebs[0] ?? null,
        { thinWebs, thickness }
      );
    }

    if (!reports.length) {
      pushReport("info", "no_issues_detected", "No major DXF issues were detected from the current checks.");
    }

    const criticalCount = reports.filter((entry) => entry.severity === "critical").length;
    const warningCount = reports.filter((entry) => entry.severity === "warning").length;
    if (criticalCount || warningCount) {
      this.brainCore.recommendationService.createRecommendation({
        moduleName: "dxf_error_detection",
        recommendationType: criticalCount ? "critical_dxf_issue" : "dxf_cleanup_needed",
        title: criticalCount ? "Critical DXF issue detected" : "DXF cleanup recommended",
        message: criticalCount
          ? `${criticalCount} critical issue(s) were found in ${dxfFileId}.`
          : `${warningCount} warning(s) were found in ${dxfFileId}.`,
        confidence: criticalCount ? 0.92 : 0.81,
        impactScore: criticalCount ? 88 : 64,
        payload: {
          workspaceId: input.workspaceId,
          dxfFileId,
          partDnaId: input.partDnaId ?? null,
          criticalCount,
          warningCount
        }
      });
    }

    return this.buildResult(dxfFileId, input.partDnaId ?? null, reports);
  }

  listReports(workspaceId: string, dxfFileId: string) {
    const rows = this.db.prepare(
      `SELECT * FROM dxf_error_reports
       WHERE workspaceId = ? AND dxfFileId = ?
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, id ASC`
    ).all(workspaceId, dxfFileId) as Record<string, unknown>[];
    return this.buildResult(dxfFileId, rows[0]?.partDnaId ? Number(rows[0].partDnaId) : null, rows.map(rowToReport));
  }

  listRecentProblemFiles(workspaceId: string, limit = 20) {
    const rows = this.db.prepare(
      `SELECT
         dxfFileId,
         MAX(createdAt) AS latestAt,
         MAX(partDnaId) AS partDnaId,
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS criticalCount,
         SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warningCount,
         SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) AS infoCount
       FROM dxf_error_reports
       WHERE workspaceId = ?
       GROUP BY dxfFileId
       HAVING SUM(CASE WHEN severity IN ('critical', 'warning') THEN 1 ELSE 0 END) > 0
       ORDER BY latestAt DESC
       LIMIT ?`
    ).all(workspaceId, Math.max(1, Math.min(200, limit))) as Record<string, unknown>[];
    return rows.map((row) => ({
      dxfFileId: String(row.dxfFileId ?? ""),
      partDnaId: row.partDnaId === null || row.partDnaId === undefined ? null : Number(row.partDnaId),
      criticalCount: Number(row.criticalCount ?? 0),
      warningCount: Number(row.warningCount ?? 0),
      infoCount: Number(row.infoCount ?? 0),
      latestAt: String(row.latestAt ?? "")
    })) satisfies DxfErrorWorkspaceSummary[];
  }

  private buildResult(dxfFileId: string, partDnaId: number | null, reports: DxfErrorReportRecord[]): DxfErrorCheckResult {
    const criticalCount = reports.filter((entry) => entry.severity === "critical").length;
    const warningCount = reports.filter((entry) => entry.severity === "warning").length;
    const infoCount = reports.filter((entry) => entry.severity === "info").length;
    const recommendedFixes = Array.from(
      new Set(
        reports.flatMap((entry) => {
          switch (entry.errorType) {
            case "open_contours":
              return ["Close all contour endpoints before cutting."];
            case "duplicate_lines":
            case "overlapping_geometry":
              return ["Remove duplicate or overlapping geometry in CAD before nesting."];
            case "tiny_holes":
            case "holes_smaller_than_thickness":
              return ["Increase hole diameter or reduce material thickness for these features."];
            case "very_short_segments":
              return ["Simplify tiny line fragments and rebuild the contour cleanly."];
            case "unsupported_entities":
              return ["Explode unsupported entities to lines/arcs or resave as a simpler DXF."];
            case "missing_scale":
              return ["Confirm the file units and export in millimetres with declared DXF units."];
            case "excessive_pierce_count":
              return ["Reduce feature count or consider alternate process settings before cutting."];
            case "thin_webs_likely_to_burn":
              return ["Increase web thickness or adjust geometry spacing to avoid burn-through."];
            default:
              return [];
          }
        })
      )
    );
    return {
      dxfFileId,
      partDnaId,
      reports,
      summary: { criticalCount, warningCount, infoCount },
      recommendedFixes
    };
  }
}
