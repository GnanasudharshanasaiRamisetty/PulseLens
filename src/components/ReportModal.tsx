import React from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Play,
  X,
} from 'lucide-react';
import {
  buildMarkdownReport,
  buildStandaloneHtmlReport,
  downloadPdfReport,
  FullReportPayload,
  renderIbiSvgString,
  renderWaveformSvgString,
  triggerFileDownload,
} from '../utils/reportGenerator';

interface ReportModalProps {
  isOpen: boolean;
  report: FullReportPayload | null;
  onClose: () => void;
  onDownloadCsv: () => void;
  onStartDemoAndRegenerate: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  report,
  onClose,
  onDownloadCsv,
  onStartDemoAndRegenerate,
}) => {
  const [downloadedFormat, setDownloadedFormat] = React.useState<string | null>(
    null
  );

  if (!isOpen || !report) return null;

  const { analysis } = report;
  const hrv = analysis.hrv;
  const hasData = analysis.bpm !== null;

  const fmt = (val: number | null, digits = 1) =>
    val !== null && Number.isFinite(val) ? val.toFixed(digits) : '—';

  const dateSlug = report.generatedAtIso.slice(0, 19).replace(/:/g, '-');

  const handleDownloadPdf = () => {
    downloadPdfReport(report);
    setDownloadedFormat('PDF Report (.pdf)');
    setTimeout(() => setDownloadedFormat(null), 3500);
  };

  const handleDownloadHtml = () => {
    const html = buildStandaloneHtmlReport(report);
    triggerFileDownload(
      html,
      `pulselens-full-report-${dateSlug}.html`,
      'text/html;charset=utf-8;'
    );
    setDownloadedFormat('HTML Report (.html)');
    setTimeout(() => setDownloadedFormat(null), 3500);
  };

  const handleDownloadMarkdown = () => {
    const md = buildMarkdownReport(report);
    triggerFileDownload(
      md,
      `pulselens-report-${dateSlug}.md`,
      'text/markdown;charset=utf-8;'
    );
    setDownloadedFormat('Markdown Report (.md)');
    setTimeout(() => setDownloadedFormat(null), 3500);
  };

  const handleDownloadCsvClick = () => {
    onDownloadCsv();
    setDownloadedFormat('CSV Readings (.csv)');
    setTimeout(() => setDownloadedFormat(null), 3500);
  };

  const waveformSvg = renderWaveformSvgString(analysis);
  const ibiSvg = renderIbiSvgString(analysis);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      data-testid="full-report-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#3B3252] rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-[#2E2740] bg-slate-50 dark:bg-[#161320]">
          <div>
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-violet-700 dark:text-violet-400" />
              <h2
                id="report-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                PulseLens Diagnostic Report — Current Reading vs. Normal Range
              </h2>
            </div>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-0.5">
              Report ID: {report.reportId} · Generated: {report.generatedAtFormatted} · Mode: {report.mode}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="download-pdf-report-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-amber-400 rounded hover:bg-violet-800 dark:hover:bg-amber-300 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF Report (.PDF)
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Report Modal"
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Download Confirmation Banner */}
          {downloadedFormat && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs font-medium text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Downloaded <strong>{downloadedFormat}</strong> ({report.reportId}) to your device.
              </span>
            </div>
          )}

          {/* Prompt to load Demo Data if opened while in standby with 0 samples */}
          {!hasData && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  No Active Session Readings Yet
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                  Start the camera or load a calibrated 72 BPM synthetic session to compare live readings against normal physiological reference ranges.
                </p>
              </div>
              <button
                type="button"
                onClick={onStartDemoAndRegenerate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-violet-400 rounded hover:bg-violet-800 dark:hover:bg-violet-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Load 72 BPM Demo &amp; Generate
              </button>
            </div>
          )}

          {/* Section 1: Executive Vital Signs Summary */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              01. Executive Vital Signs &amp; Normal Reference Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Heart Rate (Median)
                </div>
                <div className="flex items-baseline mt-1">
                  <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {analysis.bpm !== null ? Math.round(analysis.bpm) : '—'}
                  </span>
                  <span className="text-xs font-mono text-slate-500 ml-1">
                    BPM
                  </span>
                </div>
                <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                  Normal: 60–100 BPM
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Signal Quality (SQI)
                </div>
                <div className="flex items-baseline mt-1">
                  <span className="text-2xl font-mono font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                    {Math.round(analysis.sqi * 100)}%
                  </span>
                  <span className="text-xs font-mono text-slate-500 ml-1.5">
                    ({analysis.sqiLabel})
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  Normal: ≥ 50% (Good)
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Mean IBI
                </div>
                <div className="flex items-baseline mt-1">
                  <span className="text-2xl font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {fmt(hrv.meanIbi, 0)}
                  </span>
                  <span className="text-xs font-mono text-slate-500 ml-1">
                    ms
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  Normal: 600–1000 ms
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-3.5">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Respiration (Exp.)
                </div>
                <div className="flex items-baseline mt-1">
                  <span className="text-2xl font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {fmt(hrv.respirationBpm, 1)}
                  </span>
                  <span className="text-xs font-mono text-slate-500 ml-1">
                    br/min
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  Normal: 12.0–20.0 br/min
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Current Reading vs. Normal Reference Range Comparison Table */}
          <section data-testid="reference-comparison-section">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                02. Current Reading vs. Normal Reference Range Comparison
              </h3>
              <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-xs bg-emerald-500/35 border border-emerald-500/60" />
                  Normal Reference Zone
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-3 bg-violet-600 dark:bg-amber-400 rounded-xs" />
                  Current Reading
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-[#2E2740] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-[#14111D] text-slate-600 dark:text-slate-400 font-mono border-b border-slate-200 dark:border-[#2E2740]">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Parameter</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Current Reading
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Normal Range
                    </th>
                    <th className="py-2.5 px-3 font-semibold w-44">
                      Range Comparison
                    </th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#2E2740]">
                  {report.referenceComparisons.map((row) => (
                    <tr
                      key={row.id}
                      className="bg-white dark:bg-[#1B1726] hover:bg-slate-50/80 dark:hover:bg-[#221D30]"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {row.parameter}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {row.comparisonNote}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {row.currentFormatted}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {row.normalRangeFormatted}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="relative w-full h-2.5 bg-slate-200 dark:bg-[#14111D] rounded-full overflow-hidden">
                          {/* Highlighted Normal Reference Range Zone */}
                          <div
                            className="absolute top-0 bottom-0 bg-emerald-500/30 dark:bg-emerald-400/25 border-x border-emerald-600/50 dark:border-emerald-400/50"
                            style={{
                              left: `${row.normStartPercent}%`,
                              width: `${row.normWidthPercent}%`,
                            }}
                          />
                          {/* Current Reading Marker Pin */}
                          {row.markerPercent !== null && (
                            <div
                              className={`absolute top-0 bottom-0 w-1.5 -ml-0.5 rounded-full ${
                                row.statusTone === 'normal'
                                  ? 'bg-violet-700 dark:bg-amber-400'
                                  : 'bg-rose-600 dark:bg-rose-400'
                              }`}
                              style={{ left: `${row.markerPercent}%` }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                        <span
                          className={
                            row.statusTone === 'normal'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : row.statusTone === 'warning'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {row.statusTone === 'normal'
                            ? `● ${row.statusLabel}`
                            : row.statusTone === 'warning'
                            ? `▲ ${row.statusLabel}`
                            : `○ ${row.statusLabel}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Automated Physiological & Signal Summary */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              03. Automated Diagnostic Observations
            </h3>
            <ul className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-4 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
              {report.interpretationNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </section>

          {/* Section 4: Waveform & IBI Snapshots */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                04. 10 s rPPG Waveform Snapshot
              </h3>
              <div
                className="rounded overflow-hidden border border-slate-200 dark:border-[#2E2740]"
                dangerouslySetInnerHTML={{ __html: waveformSvg }}
              />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                05. IBI Tachogram Snapshot
              </h3>
              <div
                className="rounded overflow-hidden border border-slate-200 dark:border-[#2E2740]"
                dangerouslySetInnerHTML={{ __html: ibiSvg }}
              />
            </div>
          </section>

          {/* Section 5: Multi-Algorithm Comparison */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              06. Multi-Algorithm Benchmark (POS vs CHROM vs GREEN)
            </h3>
            <div className="overflow-x-auto border border-slate-200 dark:border-[#2E2740] rounded-lg">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead className="bg-slate-100 dark:bg-[#14111D] text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="py-2 px-3">Algorithm</th>
                    <th className="py-2 px-3 text-right">Estimated BPM</th>
                    <th className="py-2 px-3 text-right">SQI Score</th>
                    <th className="py-2 px-3 text-right">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-[#2E2740]">
                  {report.comparisonList.map((item) => (
                    <tr key={item.algorithm}>
                      <td className="py-2 px-3 font-semibold">
                        {item.algorithm}
                        {item.algorithm === report.activeAlgorithm && (
                          <span className="ml-2 text-[10px] text-violet-700 dark:text-violet-300 font-normal">
                            (Active)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {item.bpm !== null ? `${item.bpm.toFixed(1)} BPM` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {item.sqi.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">
                        {item.sqiLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Modal Footer with PDF Primary Download + Secondary Formats */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-[#2E2740] bg-slate-50 dark:bg-[#161320]">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Screening/demo tool, not a medical device.
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsvClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#221D30] border border-slate-300 dark:border-[#3B3252] rounded hover:bg-slate-100 dark:hover:bg-[#2C253E] transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Raw CSV
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              data-testid="download-md-report-btn"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#221D30] border border-slate-300 dark:border-[#3B3252] rounded hover:bg-slate-100 dark:hover:bg-[#2C253E] transition-colors cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              Summary (.MD)
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              data-testid="download-html-report-btn"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#221D30] border border-slate-300 dark:border-[#3B3252] rounded hover:bg-slate-100 dark:hover:bg-[#2C253E] transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Printable (.HTML)
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="download-pdf-footer-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-amber-400 rounded hover:bg-violet-800 dark:hover:bg-amber-300 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF Report (.PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
