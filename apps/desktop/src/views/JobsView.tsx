import React from "react";
import { QRCodeCanvas } from "qrcode.react";
import { PageContainer } from "../ui";
import type {
  JobRecord,
  CustomerRecord,
  WorkerRecord,
  QuoteRecord,
  JobDxfPartPreview,
  JobDxfSourceFile,
} from "../types";
import { APP_URL, JOB_DXF_THICKNESS_OPTIONS } from "../constants";

export interface JobsViewProps {
  jobsPage: "create_job" | "job_process" | "job_dxf_reader";
  setJobsPage: (v: "create_job" | "job_process" | "job_dxf_reader") => void;
  jobs: JobRecord[];
  filteredJobs: JobRecord[];
  jobsOpen: JobRecord[];
  jobsInProgress: JobRecord[];
  jobsIncomplete: JobRecord[];
  jobsDone: JobRecord[];
  customers: CustomerRecord[];
  workers: WorkerRecord[];
  quotes: QuoteRecord[];
  machineOptions: string[];
  quoteMaterialOptions: string[];
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  selectedJob: JobRecord | null;
  jobTitle: string;
  setJobTitle: (v: string) => void;
  jobCustomer: string;
  setJobCustomer: (v: string) => void;
  jobAssignedTo: string;
  setJobAssignedTo: (v: string) => void;
  jobQuantity: string;
  setJobQuantity: (v: string) => void;
  selectedQuote: string;
  setSelectedQuote: (v: string) => void;
  jobPrice: string;
  setJobPrice: (v: string) => void;
  jobCost: string;
  setJobCost: (v: string) => void;
  jobFiles: FileList | null;
  setJobFiles: (files: FileList | null) => void;
  jobSearch: string;
  setJobSearch: (v: string) => void;
  jobDxfParts: JobDxfPartPreview[];
  jobDxfSaving: boolean;
  jobDxfSelectedPartIds: string[];
  jobDxfStatus: string;
  jobDxfLayers: string[];
  jobDxfSelectedLayers: string[];
  jobDxfCalculatedParts: Array<{ id: string; totalWeightKg: number; unitWeightKg: number; weightKg: number; quantity: number }>;
  jobDxfTotalWeightKg: number;
  jobDxfCalculatedPartById: Map<string, { id: string; totalWeightKg: number; unitWeightKg: number; weightKg: number; quantity: number }>;
  jobDxfDisplayFiles: JobDxfSourceFile[];
  manualPlateShape: "square" | "round";
  setManualPlateShape: (v: "square" | "round") => void;
  manualPlateName: string;
  setManualPlateName: (v: string) => void;
  manualPlateWidthMm: string;
  setManualPlateWidthMm: (v: string) => void;
  manualPlateHeightMm: string;
  setManualPlateHeightMm: (v: string) => void;
  manualPlateDiameterMm: string;
  setManualPlateDiameterMm: (v: string) => void;
  manualPlateQuantity: string;
  setManualPlateQuantity: (v: string) => void;
  perfPartName: string;
  setPerfPartName: (v: string) => void;
  perfPlateWidthMm: string;
  setPerfPlateWidthMm: (v: string) => void;
  perfPlateHeightMm: string;
  setPerfPlateHeightMm: (v: string) => void;
  perfQuantity: string;
  setPerfQuantity: (v: string) => void;
  perfHoleType: "round" | "square" | "hex" | "slot";
  setPerfHoleType: (v: "round" | "square" | "hex" | "slot") => void;
  perfPatternType: "square" | "staggered";
  setPerfPatternType: (v: "square" | "staggered") => void;
  perfSpacingMode: "pitch" | "web";
  setPerfSpacingMode: (v: "pitch" | "web") => void;
  perfPitchMm: string;
  setPerfPitchMm: (v: string) => void;
  perfWebMm: string;
  setPerfWebMm: (v: string) => void;
  perfHoleSizeMm: string;
  setPerfHoleSizeMm: (v: string) => void;
  perfSlotLengthMm: string;
  setPerfSlotLengthMm: (v: string) => void;
  perfSlotWidthMm: string;
  setPerfSlotWidthMm: (v: string) => void;
  perfBorderXMm: string;
  setPerfBorderXMm: (v: string) => void;
  perfBorderYMm: string;
  setPerfBorderYMm: (v: string) => void;
  perfPreviewZoom: string;
  setPerfPreviewZoom: (v: string) => void;
  perforationPreview: { segments: unknown[]; previewDataUrl?: string; error?: string };
  createJob: () => void;
  printJobCard: (id: string) => void;
  createAndPrintJobCardSet: (id: string) => Promise<void>;
  openJobCard: (id: string) => void;
  runQuantityCheck: (id: string, qty?: number | null) => void;
  markJobDone: (id: string) => void;
  loadJobDxfFiles: (files?: FileList) => Promise<void>;
  importJobDxfFromDesktopPicker: () => Promise<void>;
  clearJobDxfReader: () => void;
  deleteSelectedJobDxfParts: () => void;
  exportSelectedJobDxfAsCutDxf: () => void;
  addManualJobPlate: () => void;
  addManualPerforatedPlate: () => void;
  exportPerforationDxf: () => Promise<void>;
  saveJobDxfParts: () => Promise<void>;
  toggleJobDxfLayer: (layer: string) => void;
  toggleJobDxfPartSelected: (id: string) => void;
  toggleSelectAllJobDxfParts: () => void;
  updateJobDxfPartQuantity: (id: string, qty: number) => void;
  updateJobDxfPartMeta: (id: string, meta: Partial<JobDxfPartPreview>) => void;
  openJobFile: (jobId: string, fileName: string) => void;
  printJobFile: (jobId: string, fileName: string) => void;
}

export function JobsView(props: JobsViewProps) {
  const {
    jobsPage, setJobsPage,
    jobs, filteredJobs, jobsOpen, jobsInProgress, jobsIncomplete, jobsDone,
    customers, workers, quotes, machineOptions, quoteMaterialOptions,
    selectedJobId, setSelectedJobId, selectedJob,
    jobTitle, setJobTitle,
    jobCustomer, setJobCustomer,
    jobAssignedTo, setJobAssignedTo,
    jobQuantity, setJobQuantity,
    selectedQuote, setSelectedQuote,
    jobPrice, setJobPrice,
    jobCost, setJobCost,
    jobFiles, setJobFiles,
    jobSearch, setJobSearch,
    jobDxfParts, jobDxfSaving, jobDxfSelectedPartIds, jobDxfStatus,
    jobDxfLayers, jobDxfSelectedLayers,
    jobDxfCalculatedParts, jobDxfTotalWeightKg, jobDxfCalculatedPartById, jobDxfDisplayFiles,
    manualPlateShape, setManualPlateShape,
    manualPlateName, setManualPlateName,
    manualPlateWidthMm, setManualPlateWidthMm,
    manualPlateHeightMm, setManualPlateHeightMm,
    manualPlateDiameterMm, setManualPlateDiameterMm,
    manualPlateQuantity, setManualPlateQuantity,
    perfPartName, setPerfPartName,
    perfPlateWidthMm, setPerfPlateWidthMm,
    perfPlateHeightMm, setPerfPlateHeightMm,
    perfQuantity, setPerfQuantity,
    perfHoleType, setPerfHoleType,
    perfPatternType, setPerfPatternType,
    perfSpacingMode, setPerfSpacingMode,
    perfPitchMm, setPerfPitchMm,
    perfWebMm, setPerfWebMm,
    perfHoleSizeMm, setPerfHoleSizeMm,
    perfSlotLengthMm, setPerfSlotLengthMm,
    perfSlotWidthMm, setPerfSlotWidthMm,
    perfBorderXMm, setPerfBorderXMm,
    perfBorderYMm, setPerfBorderYMm,
    perfPreviewZoom, setPerfPreviewZoom,
    perforationPreview,
    createJob, printJobCard, createAndPrintJobCardSet, openJobCard,
    runQuantityCheck, markJobDone,
    loadJobDxfFiles, importJobDxfFromDesktopPicker, clearJobDxfReader,
    deleteSelectedJobDxfParts, exportSelectedJobDxfAsCutDxf,
    addManualJobPlate, addManualPerforatedPlate, exportPerforationDxf,
    saveJobDxfParts, toggleJobDxfLayer, toggleJobDxfPartSelected,
    toggleSelectAllJobDxfParts, updateJobDxfPartQuantity, updateJobDxfPartMeta,
    openJobFile, printJobFile,
  } = props;

  return (
          <PageContainer>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(210px, 240px) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.025)",
                  borderRadius: 16,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  border: "1px solid rgba(99, 102, 241, 0.18)",
                  boxShadow: "0 0 18px rgba(88, 101, 242, 0.06)"
                }}
              >
                <button
                  onClick={() => setJobsPage("create_job")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: jobsPage === "create_job" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: jobsPage === "create_job" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: jobsPage === "create_job" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  Create Job
                </button>
                <button
                  onClick={() => setJobsPage("job_process")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: jobsPage === "job_process" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: jobsPage === "job_process" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: jobsPage === "job_process" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  Job Process
                </button>
                <button
                  onClick={() => setJobsPage("job_dxf_reader")}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: jobsPage === "job_dxf_reader" ? "1px solid rgba(122, 132, 255, 0.9)" : "1px solid rgba(99, 102, 241, 0.18)",
                    background: jobsPage === "job_dxf_reader" ? "rgba(58, 68, 99, 0.82)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    boxShadow: jobsPage === "job_dxf_reader" ? "0 0 18px rgba(88, 101, 242, 0.16)" : "0 0 12px rgba(88, 101, 242, 0.05)"
                  }}
                >
                  Job DXF Reader
                </button>
              </div>

              <div>
            {jobsPage === "create_job" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Create Job</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={{
                      gridColumn: "span 2",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select machine</option>
                    {machineOptions.map((machine) => (
                      <option key={machine} value={machine}>
                        {machine}
                      </option>
                    ))}
                  </select>
                  <select
                    value={jobCustomer}
                    onChange={(e) => setJobCustomer(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={jobAssignedTo}
                    onChange={(e) => setJobAssignedTo(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select employee</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={worker.name}>
                        {worker.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={jobQuantity}
                    onChange={(e) => setJobQuantity(e.target.value)}
                    placeholder="Quantity"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <select
                    value={selectedQuote}
                    onChange={(e) => setSelectedQuote(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  >
                    <option value="">Select quote</option>
                    {quotes.slice(0, 20).map((quote) => (
                      <option key={quote.id} value={quote.quoteNumber}>
                        {quote.quoteNumber} · {quote.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={jobPrice}
                    onChange={(e) => setJobPrice(e.target.value)}
                    placeholder="Price"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    value={jobCost}
                    onChange={(e) => setJobCost(e.target.value)}
                    placeholder="Cost"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#111",
                      color: "white"
                    }}
                  />
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setJobFiles(e.target.files)}
                    style={{ gridColumn: "span 2" }}
                  />
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files) setJobFiles(e.dataTransfer.files);
                    }}
                    style={{
                      gridColumn: "span 2",
                      border: "1px dashed #444",
                      borderRadius: 8,
                      padding: 12,
                      textAlign: "center",
                      color: "#9ca3af"
                    }}
                  >
                    Drag & drop files here {jobFiles?.length ? `(${jobFiles.length} selected)` : ""}
                  </div>
                </div>
                <button
                  onClick={createJob}
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(104, 114, 147, 0.55)",
                    background: "rgba(78, 90, 128, 0.72)",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Create Job
                </button>
              </div>

              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 16, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Search</div>
                <input
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search by job number, title, customer"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #333",
                    background: "#111",
                    color: "white"
                  }}
                />
                <div style={{ fontSize: 12, marginTop: 10, opacity: 0.7 }}>
                  Showing {filteredJobs.length} of {jobs.length} jobs
                </div>
              </div>
            </div>
            ) : null}

            {jobsPage === "job_process" ? (
            <div>
              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 12, marginBottom: 12, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Search Job Cards</div>
                <input
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search by job number or customer name"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(99, 102, 241, 0.24)",
                    background: "#111",
                    color: "white"
                  }}
                />
                <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
                  Showing {filteredJobs.length} of {jobs.length} job cards
                </div>
              </div>
            <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[{ title: "Open", data: jobsOpen, color: "#22c55e" },
                { title: "In Progress", data: jobsInProgress, color: "#38bdf8" },
                { title: "Incomplete", data: jobsIncomplete, color: "#f97316" },
                { title: "Done", data: jobsDone, color: "#a3e635" }].map((column) => (
                <div key={column.title} style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 12, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: column.color }}>
                    {column.title} ({column.data.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {column.data.map((job) => (
                      <div key={job.id} style={{ padding: 12, borderRadius: 14, background: "rgba(0,0,0,0.16)", border: "1px solid rgba(99, 102, 241, 0.14)", boxShadow: "0 0 14px rgba(88, 101, 242, 0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <b>{job.jobNumber}</b>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{job.status}</div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{job.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {job.customerName ?? "No customer"} · {job.assignedTo ?? "Unassigned"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Qty {job.quantityExpected ?? "-"}</div>
                        {job.lastFileOpenedAt ? (
                          <div style={{ fontSize: 11, opacity: 0.7 }}>
                            Last file opened: {new Date(job.lastFileOpenedAt).toLocaleString("en-ZA")}
                          </div>
                        ) : null}
                        {job.repeatCount && job.repeatCount > 1 ? (
                          <div style={{ fontSize: 12, color: "#fbbf24" }}>
                            Repeat x{job.repeatCount} · Last charge {job.lastRepeatPrice ?? "-"}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => setSelectedJobId(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.035)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => printJobCard(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(104, 114, 147, 0.55)",
                              background: "rgba(78, 90, 128, 0.68)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Print Card
                          </button>
                          <button
                            onClick={() => {
                              void createAndPrintJobCardSet(job.id);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(76, 134, 129, 0.55)",
                              background: "rgba(52, 102, 98, 0.72)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Create Delivery Note
                          </button>
                          <button
                            onClick={() => openJobCard(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.03)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Delivery Note
                          </button>
                          <button
                            onClick={() => runQuantityCheck(job.id, job.quantityExpected)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.05)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Quantity
                          </button>
                          <button
                            onClick={() => markJobDone(job.id)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid rgba(88, 150, 112, 0.55)",
                              background: "rgba(50, 107, 72, 0.72)",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 12
                            }}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 12, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>Job Card Preview</div>
                  {selectedJob ? (
                    <button
                      onClick={() => printJobCard(selectedJob.id)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid rgba(104, 114, 147, 0.55)",
                        background: "rgba(78, 90, 128, 0.68)",
                        color: "white",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                    >
                      Print Card
                    </button>
                  ) : null}
                </div>
                {selectedJob ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedJob.jobNumber}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedJob.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Customer: {selectedJob.customerName ?? "-"}
                    </div>
                    {selectedJob.quoteNumber ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Quote: {selectedJob.quoteNumber}</div>
                    ) : null}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Assigned: {selectedJob.assignedTo ?? "-"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Quantity: {selectedJob.quantityExpected ?? "-"}
                    </div>
                    {selectedJob.lastFileOpenedAt ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Last file opened: {new Date(selectedJob.lastFileOpenedAt).toLocaleString("en-ZA")}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6 }}>
                      <QRCodeCanvas
                        value={`${APP_URL}/scan?token=${selectedJob.qrToken}`}
                        size={140}
                        bgColor="#ffffff"
                        fgColor="#111827"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openJobCard(selectedJob.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.05)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Open Delivery Note
                      </button>
                      <button
                        onClick={() => printJobCard(selectedJob.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(104, 114, 147, 0.55)",
                          background: "rgba(78, 90, 128, 0.68)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Print Delivery Note
                      </button>
                      <button
                        onClick={() => {
                          void createAndPrintJobCardSet(selectedJob.id);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(76, 134, 129, 0.55)",
                          background: "rgba(52, 102, 98, 0.72)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: 12
                        }}
                      >
                        Create Delivery Note
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Files</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(selectedJob.fileLinks ?? []).map((file) => (
                        <div
                          key={file.fileName}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                        >
                          <div style={{ fontSize: 12 }}>{file.fileName}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => openJobFile(selectedJob.id, file.fileName)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.05)",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 12
                              }}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => printJobFile(selectedJob.id, file.fileName)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid rgba(88, 150, 112, 0.55)",
                                background: "rgba(50, 107, 72, 0.72)",
                                color: "white",
                                cursor: "pointer",
                                fontSize: 12
                              }}
                            >
                              Print
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!selectedJob.fileLinks || selectedJob.fileLinks.length === 0) && (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>No files added.</div>
                      )}
                    </div>

                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Select a job to preview.</div>
                )}
              </div>
            </div>
            </div>
            ) : null}
            {jobsPage === "job_dxf_reader" ? (
            <div style={{ background: "rgba(255,255,255,0.028)", borderRadius: 16, padding: 12, marginTop: 12, border: "1px solid rgba(99, 102, 241, 0.16)", boxShadow: "0 0 20px rgba(88, 101, 242, 0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>
                    Job DXF Reader {selectedJob ? `(${selectedJob.jobNumber})` : "(Select a job first)"}
                  </div>
                  <button
                    onClick={() => {
                      void saveJobDxfParts();
                    }}
                    disabled={!selectedJob || jobDxfSaving || jobDxfParts.length === 0}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(88, 150, 112, 0.55)",
                      background: "rgba(50, 107, 72, 0.72)",
                      color: "white",
                      cursor: !selectedJob || jobDxfSaving || jobDxfParts.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 12
                    }}
                  >
                    {jobDxfSaving ? "Saving..." : "Save Quantities"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="file"
                    accept=".dxf"
                    multiple
                    onChange={(e) => {
                      void loadJobDxfFiles(e.target.files ?? undefined);
                      e.currentTarget.value = "";
                    }}
                  />
                  <button
                    onClick={() => {
                      void importJobDxfFromDesktopPicker();
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Import DXF (Desktop Access)
                  </button>
                  <button
                    onClick={clearJobDxfReader}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(137, 82, 82, 0.52)",
                      background: "rgba(103, 48, 48, 0.68)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Clear
                  </button>
                  <button
                    onClick={deleteSelectedJobDxfParts}
                    disabled={jobDxfSelectedPartIds.length === 0}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: jobDxfSelectedPartIds.length === 0 ? "rgba(255,255,255,0.05)" : "rgba(120, 43, 43, 0.72)",
                      color: "white",
                      cursor: jobDxfSelectedPartIds.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 12
                    }}
                  >
                    Delete Selected
                  </button>
                  <button
                    onClick={exportSelectedJobDxfAsCutDxf}
                    disabled={jobDxfSelectedPartIds.length === 0}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(99, 102, 241, 0.28)",
                      background: jobDxfSelectedPartIds.length === 0 ? "rgba(255,255,255,0.05)" : "rgba(52, 102, 98, 0.72)",
                      color: "white",
                      cursor: jobDxfSelectedPartIds.length === 0 ? "not-allowed" : "pointer",
                      fontSize: 12
                    }}
                  >
                    Export Selected DXF
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <select
                    value={manualPlateShape}
                    onChange={(e) => setManualPlateShape(e.target.value as "square" | "round")}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white",
                      fontSize: 12
                    }}
                  >
                    <option value="square">Square / Rectangle</option>
                    <option value="round">Round</option>
                  </select>
                  <input
                    value={manualPlateName}
                    onChange={(e) => setManualPlateName(e.target.value)}
                    placeholder="Manual part name"
                    style={{
                      width: 180,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white",
                      fontSize: 12
                    }}
                  />
                  {manualPlateShape === "square" ? (
                    <>
                      <input
                        value={manualPlateWidthMm}
                        onChange={(e) => setManualPlateWidthMm(e.target.value)}
                        placeholder="Width mm"
                        style={{
                          width: 95,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(99, 102, 241, 0.24)",
                          background: "#111",
                          color: "white",
                          fontSize: 12
                        }}
                      />
                      <input
                        value={manualPlateHeightMm}
                        onChange={(e) => setManualPlateHeightMm(e.target.value)}
                        placeholder="Height mm"
                        style={{
                          width: 95,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(99, 102, 241, 0.24)",
                          background: "#111",
                          color: "white",
                          fontSize: 12
                        }}
                      />
                    </>
                  ) : (
                    <input
                      value={manualPlateDiameterMm}
                      onChange={(e) => setManualPlateDiameterMm(e.target.value)}
                      placeholder="Diameter mm"
                      style={{
                        width: 110,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid rgba(99, 102, 241, 0.24)",
                        background: "#111",
                        color: "white",
                        fontSize: 12
                      }}
                    />
                  )}
                  <input
                    value={manualPlateQuantity}
                    onChange={(e) => setManualPlateQuantity(e.target.value)}
                    placeholder="Qty"
                    style={{
                      width: 72,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(99, 102, 241, 0.24)",
                      background: "#111",
                      color: "white",
                      fontSize: 12
                    }}
                  />
                  <button
                    onClick={addManualJobPlate}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(84, 196, 130, 0.28)",
                      background: "rgba(38, 64, 52, 0.78)",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Add Manual Plate
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.9fr)",
                    gap: 16,
                    alignItems: "start",
                    marginBottom: 12
                  }}
                  >
                    <div
                      style={{
                        background: "#151821",
                      borderRadius: 12,
                      border: "1px solid rgba(99, 102, 241, 0.18)",
                      padding: 16,
                      display: "grid",
                        gap: 14
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Perforation DXF Maker</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "end" }}>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Part Name</span>
                        <input
                          value={perfPartName}
                          onChange={(e) => setPerfPartName(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Plate Width (mm)</span>
                        <input
                          value={perfPlateWidthMm}
                          onChange={(e) => setPerfPlateWidthMm(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Plate Height (mm)</span>
                        <input
                          value={perfPlateHeightMm}
                          onChange={(e) => setPerfPlateHeightMm(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Quantity</span>
                        <input
                          value={perfQuantity}
                          onChange={(e) => setPerfQuantity(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Hole Type</span>
                        <select
                          value={perfHoleType}
                          onChange={(e) => setPerfHoleType(e.target.value as "round" | "square" | "hex" | "slot")}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        >
                          <option value="round">Round</option>
                          <option value="square">Square</option>
                          <option value="hex">Hex</option>
                          <option value="slot">Slot</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Pattern Type</span>
                        <select
                          value={perfPatternType}
                          onChange={(e) => setPerfPatternType(e.target.value as "square" | "staggered")}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        >
                          <option value="square">Square</option>
                          <option value="staggered">Staggered</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Spacing Mode</span>
                        <select
                          value={perfSpacingMode}
                          onChange={(e) => setPerfSpacingMode(e.target.value as "pitch" | "web")}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        >
                          <option value="pitch">Pitch</option>
                          <option value="web">Web</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>{perfSpacingMode === "pitch" ? "Pitch (mm)" : "Web (mm)"}</span>
                        <input
                          value={perfSpacingMode === "pitch" ? perfPitchMm : perfWebMm}
                          onChange={(e) => perfSpacingMode === "pitch" ? setPerfPitchMm(e.target.value) : setPerfWebMm(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>

                      {perfHoleType === "slot" ? (
                        <>
                          <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                            <span>Slot Length (mm)</span>
                            <input
                              value={perfSlotLengthMm}
                              onChange={(e) => setPerfSlotLengthMm(e.target.value)}
                              style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                            />
                          </label>
                          <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                            <span>Slot Width (mm)</span>
                            <input
                              value={perfSlotWidthMm}
                              onChange={(e) => setPerfSlotWidthMm(e.target.value)}
                              style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                            />
                          </label>
                        </>
                      ) : (
                        <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                          <span>Hole Size (mm)</span>
                          <input
                            value={perfHoleSizeMm}
                            onChange={(e) => setPerfHoleSizeMm(e.target.value)}
                            style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                          />
                        </label>
                      )}
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Border X (mm)</span>
                        <input
                          value={perfBorderXMm}
                          onChange={(e) => setPerfBorderXMm(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.88 }}>
                        <span>Border Y (mm)</span>
                        <input
                          value={perfBorderYMm}
                          onChange={(e) => setPerfBorderYMm(e.target.value)}
                          style={{ width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(99, 102, 241, 0.24)", background: "#111", color: "white", fontSize: 13 }}
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={addManualPerforatedPlate}
                        disabled={Boolean(perforationPreview.error)}
                        style={{
                          minWidth: 180,
                          minHeight: 42,
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid rgba(84, 196, 130, 0.28)",
                          background: perforationPreview.error ? "rgba(63, 63, 70, 0.75)" : "rgba(38, 64, 52, 0.88)",
                          color: "white",
                          cursor: perforationPreview.error ? "not-allowed" : "pointer",
                          fontSize: 13,
                          fontWeight: 700
                        }}
                      >
                        Add Perforated DXF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void exportPerforationDxf();
                        }}
                        disabled={Boolean(perforationPreview.error)}
                        style={{
                          minWidth: 160,
                          minHeight: 42,
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid rgba(96, 165, 250, 0.28)",
                          background: perforationPreview.error ? "rgba(63, 63, 70, 0.75)" : "rgba(30, 41, 59, 0.96)",
                          color: "white",
                          cursor: perforationPreview.error ? "not-allowed" : "pointer",
                          fontSize: 13,
                          fontWeight: 700
                        }}
                      >
                        Export DXF
                      </button>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.72 }}>
                      {perforationPreview.error
                        ? perforationPreview.error
                        : perfSpacingMode === "pitch"
                          ? `Using pitch ${Number(perfPitchMm) || 0} mm.`
                          : `Using web ${Number(perfWebMm) || 0} mm.`}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#151821",
                      borderRadius: 12,
                      border: "1px solid rgba(99, 102, 241, 0.18)",
                      padding: 16
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Live Preview</div>
                    <label style={{ display: "grid", gap: 4, fontSize: 11, opacity: 0.82, marginBottom: 8 }}>
                      <span>Zoom ({(Number(perfPreviewZoom) || 1).toFixed(1)}x)</span>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        step="0.5"
                        value={perfPreviewZoom}
                        onChange={(e) => setPerfPreviewZoom(e.target.value)}
                      />
                    </label>
                    <div
                      style={{
                        width: "100%",
                        height: 320,
                        borderRadius: 10,
                        border: "1px solid #334155",
                        background: "#0b1220",
                        overflow: "auto"
                      }}
                    >
                      {perforationPreview.previewDataUrl ? (
                        <div
                          style={{
                            width: `${220 * (Number(perfPreviewZoom) || 1)}px`,
                            height: `${220 * (Number(perfPreviewZoom) || 1)}px`,
                            minWidth: "100%",
                            minHeight: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 12
                          }}
                        >
                          <img
                            src={perforationPreview.previewDataUrl}
                            alt="Perforation preview"
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, opacity: 0.6 }}>Preview updates as you change values</div>
                      )}
                    </div>
                  </div>
                </div>
                {!selectedJob && jobDxfParts.length > 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    DXF is loaded locally. Select a job to save, or create a new job to attach these parts.
                  </div>
                ) : null}
                {jobDxfStatus ? <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>{jobDxfStatus}</div> : null}
                {jobDxfCalculatedParts.length > 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
                    Total DXF parts weight: {jobDxfTotalWeightKg.toFixed(2)} kg
                  </div>
                ) : null}
                {jobDxfLayers.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {jobDxfLayers.map((layer) => {
                      const selected = jobDxfSelectedLayers.includes(layer);
                      return (
                        <button
                          key={layer}
                          onClick={() => toggleJobDxfLayer(layer)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: selected ? "1px solid #22c55e" : "1px solid #475569",
                            background: selected ? "#14532d" : "#1f2937",
                            color: "white",
                            fontSize: 11,
                            cursor: "pointer"
                          }}
                        >
                          {layer}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflow: "auto" }}>
                    {jobDxfDisplayFiles.length > 0 ? (
                      jobDxfDisplayFiles.map((source) => (
                        <div
                          key={source.id}
                          style={{
                            border: "1px solid #334155",
                            borderRadius: 8,
                            padding: 6,
                            background: "#121826"
                          }}
                        >
                          {source.previewDataUrl ? (
                            <img
                              src={source.previewDataUrl}
                              alt={source.fileName}
                              style={{ width: "100%", height: 112, borderRadius: 6, border: "1px solid #334155", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: 112,
                                borderRadius: 6,
                                border: "1px solid #334155",
                                background: "#0b1220",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                opacity: 0.75
                              }}
                            >
                              No preview
                            </div>
                          )}
                          <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700 }}>{source.fileName}</div>
                          <div style={{ fontSize: 10, opacity: 0.75 }}>{source.parts.length} part type{source.parts.length === 1 ? "" : "s"}</div>
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: 140,
                          borderRadius: 8,
                          border: "1px solid #334155",
                          background: "#0b1220",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          opacity: 0.7
                        }}
                      >
                        No previews
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflow: "auto" }}>
                    {jobDxfParts.length > 0 ? (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85, marginBottom: 2 }}>
                        <input
                          type="checkbox"
                          checked={jobDxfSelectedPartIds.length > 0 && jobDxfSelectedPartIds.length === jobDxfParts.length}
                          onChange={toggleSelectAllJobDxfParts}
                        />
                        Select all ({jobDxfSelectedPartIds.length}/{jobDxfParts.length})
                      </label>
                    ) : null}
                    {jobDxfDisplayFiles.map((source) => (
                      <div key={`parts-${source.id}`} style={{ border: "1px solid #303238", borderRadius: 8, padding: 8, background: "#191b20" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                          {source.fileName}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {source.parts.map((part) => {
                            const calculatedPart = jobDxfCalculatedPartById.get(part.id);
                            return (
                              <div
                                key={part.id}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "22px 56px 1fr 210px",
                                  gap: 8,
                                  alignItems: "center",
                                  background: "#1b1c1f",
                                  border: "1px solid #303238",
                                  borderRadius: 8,
                                  padding: 6
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={jobDxfSelectedPartIds.includes(part.id)}
                                  onChange={() => toggleJobDxfPartSelected(part.id)}
                                />
                                <div
                                  style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 6,
                                    border: "1px solid #334155",
                                    overflow: "hidden",
                                    background: "#0b1220",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                  }}
                                >
                                  {part.thumbnailDataUrl ? (
                                    <img src={part.thumbnailDataUrl} alt={part.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <span style={{ fontSize: 10, opacity: 0.65 }}>No DXF</span>
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 700 }}>{part.name}</div>
                                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                                    {part.widthMm} x {part.heightMm} mm · Cut {part.cutLengthMm} mm · Pierce {part.pierceCount}
                                  </div>
                                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                                    Unit {(calculatedPart?.unitWeightKg ?? 0).toFixed(2)} kg · Total {(calculatedPart?.totalWeightKg ?? 0).toFixed(2)} kg
                                  </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 6 }}>
                                  <input
                                    value={part.quantity}
                                    onChange={(e) => updateJobDxfPartQuantity(part.id, Number(e.target.value) || 0)}
                                    style={{
                                      padding: 6,
                                      borderRadius: 6,
                                      border: "1px solid #333",
                                      background: "#111",
                                      color: "white",
                                      fontSize: 12
                                    }}
                                    title="Quantity"
                                  />
                                  <select
                                    value={part.thicknessMm}
                                    onChange={(e) => updateJobDxfPartMeta(part.id, { thicknessMm: Number(e.target.value) })}
                                    style={{
                                      padding: 6,
                                      borderRadius: 6,
                                      border: "1px solid #333",
                                      background: "#111",
                                      color: "white",
                                      fontSize: 12
                                    }}
                                    title="Thickness (mm)"
                                  >
                                    {JOB_DXF_THICKNESS_OPTIONS.map((value) => (
                                      <option key={value} value={value}>
                                        {value} mm
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={part.material}
                                    onChange={(e) => updateJobDxfPartMeta(part.id, { material: e.target.value })}
                                    style={{
                                      gridColumn: "span 2",
                                      padding: 6,
                                      borderRadius: 6,
                                      border: "1px solid #333",
                                      background: "#111",
                                      color: "white",
                                      fontSize: 12
                                    }}
                                    title="Material"
                                  >
                                    {quoteMaterialOptions.map((materialName) => (
                                      <option key={materialName} value={materialName}>
                                        {materialName}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                          {source.parts.length === 0 ? (
                            <div style={{ fontSize: 11, opacity: 0.65, padding: 4 }}>No parts detected for this file with current layer filter.</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {jobDxfParts.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.6 }}>No DXF parts loaded for this job.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
              </div>
            </div>
          </PageContainer>

  );
}
