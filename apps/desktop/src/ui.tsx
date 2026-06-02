import React from "react";
import {
  QOUTER_X_RELEASE_URL,
  QOUTER_X_WINDOWS_DOWNLOAD_URL,
  QOUTER_X_MAC_ARM64_DOWNLOAD_URL,
  QOUTER_X_MAC_INTEL_DOWNLOAD_URL,
} from "./constants";

export function BrandWordmark({
  subtitle,
  compact = false,
  showIcon = true
}: {
  subtitle?: string;
  compact?: boolean;
  showIcon?: boolean;
}) {
  const coreLetters = ["Q", "O", "U", "T", "E", "R"];
  const fontSize = compact ? 24 : showIcon ? 44 : 34;
  const subtitleSize = compact ? 8 : showIcon ? 10 : 9;
  const logoSize = compact ? 72 : 88;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 12 : showIcon ? 16 : 0 }}>
      {showIcon ? (
        <img
          src={BRAND_LOGO_SRC}
          alt="Qouterx logo"
          style={{
            width: logoSize,
            height: logoSize,
            objectFit: "cover",
            borderRadius: compact ? 16 : 22,
            boxShadow: "0 12px 28px rgba(0,0,0,0.16)"
          }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", alignItems: compact ? "flex-start" : showIcon ? "center" : "flex-start", gap: 6, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: compact ? 10 : showIcon ? 14 : 10,
            color: "rgba(244, 247, 251, 0.92)",
            fontSize,
            fontWeight: 500,
            letterSpacing: compact ? "0.22em" : showIcon ? "0.28em" : "0.18em",
            lineHeight: 0.92,
            textTransform: "uppercase",
            fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
            textShadow: "0 1px 0 rgba(255,255,255,0.05)",
            flexWrap: "nowrap",
            whiteSpace: "nowrap"
          }}
        >
          {coreLetters.map((letter) => (
            <span key={letter} style={{ display: "inline-flex" }}>
              {letter}
            </span>
          ))}
          <span
            style={{
              display: "inline-flex",
              color: "#8ef0aa",
              textShadow: "0 0 8px rgba(101, 255, 163, 0.28), 0 0 18px rgba(28, 255, 213, 0.14)"
            }}
          >
            X
          </span>
        </div>
        <div
          style={{
            color: "rgba(169, 180, 197, 0.58)",
            fontSize: subtitleSize,
            letterSpacing: compact ? "0.28em" : showIcon ? "0.44em" : "0.34em",
            textTransform: "uppercase",
            paddingLeft: compact ? 2 : showIcon ? 8 : 4,
            whiteSpace: "nowrap"
          }}
        >
          {subtitle ?? "Industrial Workflow Platform"}
        </div>
      </div>
    </div>
  );
}

export const UI = {
  fontFamily: '"Inter", "Segoe UI", sans-serif',
  colors: {
    appBg: "#07111f",
    shellBg: "#10161f",
    pageBg: "#07111f",
    cardBg: "rgba(12, 20, 34, 0.72)",
    cardBgStrong: "rgba(12, 20, 34, 0.9)",
    border: "rgba(126, 141, 160, 0.09)",
    borderStrong: "rgba(92, 201, 138, 0.28)",
    text: "rgba(244, 247, 251, 0.94)",
    muted: "rgba(169, 180, 197, 0.74)",
    primary: "#32b36b",
    primaryHover: "#2a9a5b",
    secondary: "#2a2f38",
    secondaryHover: "#343a44",
    danger: "#b9414b",
    dangerHover: "#9d3640",
    info: "#4f8cff",
    warning: "#d9a441"
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 20
  },
  shadow: {
    card: "0 16px 36px rgba(0, 0, 0, 0.18)",
    subtle: "0 8px 20px rgba(0, 0, 0, 0.14)"
  },
  transition: "all 0.2s ease"
} as const;

export function DesignSystemStyles() {
  return (
    <style>{`
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      html, body, #root {
        margin: 0;
        min-height: 100%;
        background: ${UI.colors.appBg};
        color: ${UI.colors.text};
        font-family: ${UI.fontFamily};
      }

      [data-qx-ui] {
        font-family: ${UI.fontFamily};
        color: ${UI.colors.text};
      }

      [data-qx-ui] button,
      [data-qx-ui] input,
      [data-qx-ui] select,
      [data-qx-ui] textarea {
        font: inherit;
        transition: ${UI.transition};
      }

      [data-qx-ui] input,
      [data-qx-ui] select,
      [data-qx-ui] textarea {
        min-height: 42px;
        border-radius: 12px;
        border: 1px solid ${UI.colors.border};
        background: rgba(11, 18, 32, 0.92);
        color: ${UI.colors.text};
        padding: 10px 12px;
        outline: none;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
      }

      [data-qx-ui] input::placeholder,
      [data-qx-ui] textarea::placeholder {
        color: rgba(169, 180, 197, 0.58);
      }

      [data-qx-ui] input:focus,
      [data-qx-ui] select:focus,
      [data-qx-ui] textarea:focus {
        border-color: rgba(92, 201, 138, 0.6);
        box-shadow: 0 0 0 3px rgba(50, 179, 107, 0.18);
      }

      [data-qx-ui] button {
        border-radius: 12px;
      }

      [data-qx-ui] .qx-card {
        background: ${UI.colors.cardBg};
        border: 1px solid transparent;
        border-radius: ${UI.radius.md}px;
        box-shadow: ${UI.shadow.card};
      }

      [data-qx-ui] .qx-empty-state {
        padding: 32px 20px;
        border-radius: ${UI.radius.md}px;
        border: 1px dashed ${UI.colors.border};
        background: rgba(255,255,255,0.02);
        color: ${UI.colors.muted};
        text-align: center;
      }

      [data-qx-ui] .qx-hover-lift:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 28px rgba(0,0,0,0.2);
      }

      [data-qx-ui] ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }

      [data-qx-ui] ::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.03);
      }

      [data-qx-ui] ::-webkit-scrollbar-thumb {
        background: rgba(120, 136, 158, 0.32);
        border-radius: 999px;
      }
    `}</style>
  );
}

export function PageContainer({
  children,
  style
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-page-container="true"
      style={{
        flex: 1,
        padding: 24,
        overflow: "auto",
        background: UI.colors.appBg,
        ...style
      }}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  style,
  compact = false,
  className
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`qx-card qx-hover-lift${className ? ` ${className}` : ""}`}
      style={{
        padding: compact ? 16 : 20,
        borderRadius: UI.radius.md,
        background: UI.colors.cardBg,
        border: "1px solid transparent",
        boxShadow: UI.shadow.card,
        ...style
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  style
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        ...style
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 4, fontSize: 12, color: UI.colors.muted, lineHeight: 1.5 }}>{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export function Button({
  children,
  variant = "secondary",
  style,
  ...props
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const palette =
    variant === "primary"
      ? {
          background: UI.colors.primary,
          border: "rgba(110, 231, 183, 0.32)",
          color: "#08110d"
        }
      : variant === "danger"
        ? {
            background: UI.colors.danger,
            border: "rgba(252, 165, 165, 0.32)",
            color: "#fff7f7"
          }
        : {
            background: UI.colors.secondary,
            border: UI.colors.border,
            color: UI.colors.text
          };
  return (
    <button
      {...props}
      style={{
        minHeight: 42,
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontWeight: 700,
        fontSize: 13,
        lineHeight: 1,
        boxShadow: UI.shadow.subtle,
        opacity: props.disabled ? 0.62 : 1,
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    style?: React.CSSProperties;
  }
) {
  return (
    <input
      {...props}
      style={{
        width: props.style?.width ?? "100%",
        minHeight: 42,
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${UI.colors.border}`,
        background: "rgba(11, 18, 32, 0.92)",
        color: UI.colors.text,
        ...props.style
      }}
    />
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
  style
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  style?: React.CSSProperties;
}) {
  const colors =
    tone === "success"
      ? { background: "rgba(34, 197, 94, 0.16)", border: "rgba(34, 197, 94, 0.26)", color: "#9ae6b4" }
      : tone === "warning"
        ? { background: "rgba(217, 164, 65, 0.18)", border: "rgba(217, 164, 65, 0.3)", color: "#f6d58a" }
        : tone === "danger"
          ? { background: "rgba(185, 65, 75, 0.18)", border: "rgba(248, 113, 113, 0.32)", color: "#fecaca" }
          : tone === "info"
            ? { background: "rgba(79, 140, 255, 0.16)", border: "rgba(79, 140, 255, 0.28)", color: "#bfdbfe" }
            : { background: "rgba(120, 136, 158, 0.14)", border: "rgba(120, 136, 158, 0.26)", color: "#d7dee8" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.02em",
        ...style
      }}
    >
      {children}
    </span>
  );
}

export function UpdateStatusCard(props: {
  currentVersion: string;
  updateStatus: DesktopUpdateStatusPayload | null;
  updateBusy: boolean;
  updateActionError: string | null;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const { currentVersion, updateStatus, updateBusy, updateActionError, onCheck, onInstall } = props;
  const state = updateStatus?.state ?? "idle";
  const latestVersion = updateStatus?.latestVersion ?? null;
  const canInstall = state === "update-downloaded";
  const progress = typeof updateStatus?.percent === "number" ? Math.max(0, Math.min(100, updateStatus.percent)) : null;
  const statusLabel =
    state === "checking-for-update"
      ? "Checking for update..."
      : state === "update-available"
        ? `Update available${latestVersion ? `: ${latestVersion}` : ""}`
        : state === "update-not-available"
          ? "App is up to date"
          : state === "download-progress"
            ? `Downloading update${progress !== null ? ` (${Math.round(progress)}%)` : ""}`
            : state === "update-downloaded"
              ? "Update ready to install"
              : state === "installing"
                ? "Restarting to install update..."
                : state === "dev-mode"
                  ? "Auto updates work in packaged builds"
                  : state === "error"
                    ? "Update check failed"
                    : "No update check run yet";
  const badgeTone =
    state === "error"
      ? "danger"
      : state === "update-downloaded"
        ? "success"
        : state === "update-available" || state === "download-progress" || state === "checking-for-update"
          ? "info"
          : "neutral";

  return (
    <Card compact style={{ marginBottom: 12, background: UI.colors.cardBgStrong }}>
      <SectionHeader title="App Updates" subtitle={`Current version: ${currentVersion || "Unknown"}`} />
      <div style={{ fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: UI.colors.muted }}>Status</span>
        <StatusBadge tone={badgeTone}>{statusLabel}</StatusBadge>
      </div>
      {updateStatus?.message ? <div style={{ fontSize: 11, opacity: 0.78, marginBottom: 8 }}>{updateStatus.message}</div> : null}
      {progress !== null && state === "download-progress" ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #32b36b, #7dd3a1)" }} />
          </div>
        </div>
      ) : null}
      {updateActionError ? <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 8 }}>{updateActionError}</div> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          onClick={onCheck}
          disabled={updateBusy || state === "checking-for-update"}
          variant="secondary"
        >
          Check for Updates
        </Button>
        <Button
          onClick={onInstall}
          disabled={!canInstall || updateBusy}
          variant="primary"
        >
          Restart and Install
        </Button>
      </div>
    </Card>
  );
}

export function DownloadPage() {
  const downloads = [
    {
      title: "Windows",
      subtitle: "Installer for Windows PCs.",
      href: QOUTER_X_WINDOWS_DOWNLOAD_URL,
      action: "Download Windows"
    },
    {
      title: "Mac Apple Silicon",
      subtitle: "For M1, M2, M3, and newer Macs.",
      href: QOUTER_X_MAC_ARM64_DOWNLOAD_URL,
      action: "Download Mac"
    },
    {
      title: "Mac Intel",
      subtitle: "For older Intel Macs.",
      href: QOUTER_X_MAC_INTEL_DOWNLOAD_URL,
      action: "Download Intel Mac"
    }
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#07111f", color: "#e5edf8", fontFamily: "Inter, system-ui, sans-serif" }}>
      <main style={{ width: "min(1040px, calc(100% - 32px))", margin: "0 auto", padding: "44px 0" }}>
        <section style={{ display: "grid", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/qouterx-logo-v2.png" alt="Qouter X" style={{ width: 54, height: 54, borderRadius: 12 }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05, letterSpacing: 0 }}>Qouter X Downloads</h1>
              <p style={{ margin: "8px 0 0", color: "#a9b7cc", fontSize: 15 }}>
                Install the latest Qouter X build manually.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14
            }}
          >
            {downloads.map((download) => (
              <article
                key={download.title}
                style={{
                  background: "#0d1a2b",
                  border: "1px solid rgba(148, 163, 184, 0.22)",
                  borderRadius: 8,
                  padding: 18,
                  display: "grid",
                  gap: 12,
                  minHeight: 178
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 21, letterSpacing: 0 }}>{download.title}</h2>
                  <p style={{ margin: "8px 0 0", color: "#a9b7cc", lineHeight: 1.45 }}>{download.subtitle}</p>
                </div>
                <a
                  href={download.href}
                  style={{
                    alignSelf: "end",
                    display: "inline-flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 46,
                    padding: "0 14px",
                    borderRadius: 6,
                    background: "#1f7a4d",
                    color: "#06130c",
                    textDecoration: "none",
                    fontWeight: 900
                  }}
                >
                  {download.action}
                </a>
              </article>
            ))}
          </div>

          <section
            style={{
              background: "#0d1a2b",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: 8,
              padding: 18,
              lineHeight: 1.55,
              color: "#c7d2e2"
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 20, letterSpacing: 0 }}>Mac install note</h2>
            <p style={{ margin: 0 }}>
              If an older Mac install cannot auto-update, quit Qouter X, open the downloaded DMG, and replace the app in Applications.
              Future fully automatic Mac updates need a paid Apple Developer ID signature.
            </p>
          </section>

          <a href={QOUTER_X_RELEASE_URL} style={{ color: "#93c5fd", fontWeight: 800 }}>
            View all release files
          </a>
        </section>
      </main>
    </div>
  );
}
