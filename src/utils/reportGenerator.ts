import {
  AlgorithmComparisonItem,
  PipelineAnalysisResult,
  ReadingLogEntry,
  RppgAlgorithm,
} from '../types/rppg';

export type ComparisonStatusTone = 'normal' | 'warning' | 'pending';

export interface ReferenceComparisonRow {
  id: string;
  parameter: string;
  unit: string;
  currentValue: number | null;
  currentFormatted: string;
  normalMin: number;
  normalMax: number;
  normalRangeFormatted: string;
  statusLabel: string;
  statusTone: ComparisonStatusTone;
  comparisonNote: string;
  /** Position of current value along visual scale [0, 100] */
  markerPercent: number | null;
  /** Normal zone start along visual scale [0, 100] */
  normStartPercent: number;
  /** Normal zone width along visual scale [0, 100] */
  normWidthPercent: number;
}

export interface FullReportPayload {
  reportId: string;
  generatedAtIso: string;
  generatedAtFormatted: string;
  mode: 'Live Webcam rPPG' | 'Synthetic 72 BPM Demo';
  activeAlgorithm: RppgAlgorithm;
  fftWindowSec: number;
  bufferDurationSec: number;
  measuredFps: number;
  skinPassPercent: number | null;
  meanRGB: { r: number; g: number; b: number } | null;
  analysis: PipelineAnalysisResult;
  comparisonList: AlgorithmComparisonItem[];
  referenceComparisons: ReferenceComparisonRow[];
  readingsLog: ReadingLogEntry[];
  interpretationNotes: string[];
}

function computeScalePosition(
  val: number | null,
  scaleMin: number,
  scaleMax: number,
  normMin: number,
  normMax: number
): {
  markerPercent: number | null;
  normStartPercent: number;
  normWidthPercent: number;
} {
  const span = Math.max(1e-6, scaleMax - scaleMin);
  const normStartPercent = Math.max(
    0,
    Math.min(100, ((normMin - scaleMin) / span) * 100)
  );
  const normEndPercent = Math.max(
    normStartPercent,
    Math.min(100, ((normMax - scaleMin) / span) * 100)
  );
  const normWidthPercent = normEndPercent - normStartPercent;

  if (val === null || !Number.isFinite(val)) {
    return { markerPercent: null, normStartPercent, normWidthPercent };
  }
  const markerPercent = Math.max(
    2,
    Math.min(98, ((val - scaleMin) / span) * 100)
  );
  return { markerPercent, normStartPercent, normWidthPercent };
}

/**
 * Builds the Physiological & Optical Reference Range Comparison table rows.
 */
export function buildReferenceComparisons(
  analysis: PipelineAnalysisResult
): ReferenceComparisonRow[] {
  const { hrv } = analysis;
  const rows: ReferenceComparisonRow[] = [];

  // 1. Heart Rate (BPM)
  {
    const val = analysis.bpm;
    const scale = computeScalePosition(val, 40, 130, 60, 100);
    let statusLabel = 'Pending (< 8s)';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Awaiting 8+ seconds of optical signal';
    if (val !== null) {
      if (val >= 60 && val <= 100) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = `Optimal adult resting rate (${(val - 80 >= 0 ? '+' : '') + (val - 80).toFixed(1)} BPM vs 80 BPM midpoint)`;
      } else if (val < 60) {
        statusLabel = 'Below Normal';
        statusTone = 'warning';
        comparisonNote = `${(60 - val).toFixed(1)} BPM below 60 BPM resting threshold (bradycardic/athletic)`;
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'warning';
        comparisonNote = `${(val - 100).toFixed(1)} BPM above 100 BPM resting threshold (elevated)`;
      }
    }
    rows.push({
      id: 'bpm',
      parameter: 'Heart Rate (Resting)',
      unit: 'BPM',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(1)} BPM` : '—',
      normalMin: 60,
      normalMax: 100,
      normalRangeFormatted: '60.0 – 100.0 BPM',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 2. Mean IBI (ms)
  {
    const val = hrv.meanIbi;
    const scale = computeScalePosition(val, 450, 1200, 600, 1000);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 30 s buffer and ≥ 15 clean beats';
    if (val !== null) {
      if (val >= 600 && val <= 1000) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = `Within normal 600–1000 ms NN interval window`;
      } else if (val < 600) {
        statusLabel = 'Below Normal';
        statusTone = 'warning';
        comparisonNote = `Shorter beat interval (< 600 ms indicates > 100 BPM)`;
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'warning';
        comparisonNote = `Longer beat interval (> 1000 ms indicates < 60 BPM)`;
      }
    }
    rows.push({
      id: 'mean_ibi',
      parameter: 'Mean IBI (NN Interval)',
      unit: 'ms',
      currentValue: val,
      currentFormatted: val !== null ? `${Math.round(val)} ms` : '—',
      normalMin: 600,
      normalMax: 1000,
      normalRangeFormatted: '600 – 1000 ms',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 3. SDNN (ms)
  {
    const val = hrv.sdnn;
    const scale = computeScalePosition(val, 5, 130, 20, 100);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 30 s buffer and ≥ 15 clean beats';
    if (val !== null) {
      if (val >= 20 && val <= 100) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = 'Healthy global autonomic heart rate variability';
      } else if (val < 20) {
        statusLabel = 'Below Normal';
        statusTone = 'warning';
        comparisonNote = `${(20 - val).toFixed(1)} ms below 20 ms resting threshold`;
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'warning';
        comparisonNote = 'Elevated beat-to-beat dispersion (> 100 ms)';
      }
    }
    rows.push({
      id: 'sdnn',
      parameter: 'SDNN (Global HRV)',
      unit: 'ms',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(1)} ms` : '—',
      normalMin: 20,
      normalMax: 100,
      normalRangeFormatted: '20.0 – 100.0 ms',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 4. RMSSD (ms)
  {
    const val = hrv.rmssd;
    const scale = computeScalePosition(val, 5, 100, 19, 75);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 30 s buffer and ≥ 15 clean beats';
    if (val !== null) {
      if (val >= 19 && val <= 75) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = 'Normal parasympathetic vagal tone modulation';
      } else if (val < 19) {
        statusLabel = 'Below Normal';
        statusTone = 'warning';
        comparisonNote = 'Reduced short-term vagal heart rate modulation';
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'normal';
        comparisonNote = 'High parasympathetic modulation (> 75 ms)';
      }
    }
    rows.push({
      id: 'rmssd',
      parameter: 'RMSSD (Vagal Tone)',
      unit: 'ms',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(1)} ms` : '—',
      normalMin: 19,
      normalMax: 75,
      normalRangeFormatted: '19.0 – 75.0 ms',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 5. pNN50 (%)
  {
    const val = hrv.pnn50;
    const scale = computeScalePosition(val, 0, 60, 3, 43);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 30 s buffer and ≥ 15 clean beats';
    if (val !== null) {
      if (val >= 3 && val <= 43) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = 'Normal proportion of successive intervals > 50 ms';
      } else if (val < 3) {
        statusLabel = 'Below Normal';
        statusTone = 'warning';
        comparisonNote = 'Low frequency of > 50 ms successive differences';
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'normal';
        comparisonNote = 'High beat-to-beat parasympathetic variability';
      }
    }
    rows.push({
      id: 'pnn50',
      parameter: 'pNN50 (|ΔIBI| > 50 ms)',
      unit: '%',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(1)} %` : '—',
      normalMin: 3,
      normalMax: 43,
      normalRangeFormatted: '3.0 – 43.0 %',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 6. Poincaré SD1 (ms)
  {
    const val = hrv.sd1;
    const sd2 = hrv.sd2;
    const scale = computeScalePosition(val, 5, 80, 14, 55);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 30 s buffer and ≥ 15 clean beats';
    if (val !== null && sd2 !== null) {
      if (val >= 14 && val <= 55) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = `SD1=${val.toFixed(1)} ms (norm 14–55), SD2=${sd2.toFixed(1)} ms (norm 25–110)`;
      } else {
        statusLabel = 'Outside Ref.';
        statusTone = 'warning';
        comparisonNote = `SD1=${val.toFixed(1)} ms, SD2=${sd2.toFixed(1)} ms`;
      }
    }
    rows.push({
      id: 'poincare',
      parameter: 'Poincaré SD1 / SD2',
      unit: 'ms',
      currentValue: val,
      currentFormatted:
        val !== null && sd2 !== null
          ? `${val.toFixed(1)} / ${sd2.toFixed(1)} ms`
          : '—',
      normalMin: 14,
      normalMax: 55,
      normalRangeFormatted: 'SD1: 14–55 · SD2: 25–110 ms',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 7. LF / HF Ratio
  {
    const val = hrv.lfHfStatus === 'ready' ? hrv.lfHf : null;
    const scale = computeScalePosition(val, 0, 3.0, 0.5, 2.0);
    let statusLabel = 'Needs 2+ Min';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Requires ≥ 120 s buffer for LF (0.04–0.15 Hz) resolution';
    if (val !== null) {
      if (val >= 0.5 && val <= 2.0) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = 'Balanced sympathovagal autonomic ratio';
      } else if (val < 0.5) {
        statusLabel = 'Vagal Dominant';
        statusTone = 'normal';
        comparisonNote = 'High HF respiratory sinus arrhythmia power (< 0.50)';
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'warning';
        comparisonNote = 'Elevated low-frequency sympathetic dominance (> 2.00)';
      }
    }
    rows.push({
      id: 'lf_hf',
      parameter: 'LF / HF Spectral Ratio',
      unit: 'ratio',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(2)}` : 'needs 2+ min',
      normalMin: 0.5,
      normalMax: 2.0,
      normalRangeFormatted: '0.50 – 2.00 ratio',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 8. Experimental Respiration Rate (br/min)
  {
    const val = hrv.respirationBpm;
    const scale = computeScalePosition(val, 6, 30, 12, 20);
    let statusLabel = 'Needs 30s Data';
    let statusTone: ComparisonStatusTone = 'pending';
    let comparisonNote = 'Derived from 0.10–0.50 Hz IBI spectral peak';
    if (val !== null) {
      if (val >= 12 && val <= 20) {
        statusLabel = 'Normal Range';
        statusTone = 'normal';
        comparisonNote = 'Within normal adult resting eupnea (12–20 breaths/min)';
      } else if (val < 12) {
        statusLabel = 'Below Normal';
        statusTone = 'normal';
        comparisonNote = 'Slow / paced breathing pattern (< 12 breaths/min)';
      } else {
        statusLabel = 'Above Normal';
        statusTone = 'warning';
        comparisonNote = 'Elevated respiratory frequency (> 20 breaths/min)';
      }
    }
    rows.push({
      id: 'respiration',
      parameter: 'Respiration Rate (Exp.)',
      unit: 'br/min',
      currentValue: val,
      currentFormatted: val !== null ? `${val.toFixed(1)} br/min` : '—',
      normalMin: 12,
      normalMax: 20,
      normalRangeFormatted: '12.0 – 20.0 br/min',
      statusLabel,
      statusTone,
      comparisonNote,
      ...scale,
    });
  }

  // 9. Optical Signal Quality Index (SQI %)
  {
    const val = analysis.sqi * 100;
    const scale = computeScalePosition(val, 0, 100, 50, 100);
    const isGood = val >= 50;
    const isFair = val >= 30 && val < 50;
    rows.push({
      id: 'sqi',
      parameter: 'Optical Signal Quality (SQI)',
      unit: '%',
      currentValue: val,
      currentFormatted: `${val.toFixed(0)} % (${analysis.sqiLabel})`,
      normalMin: 50,
      normalMax: 100,
      normalRangeFormatted: '50 % – 100 % (Good)',
      statusLabel: isGood ? 'Normal / Good' : isFair ? 'Fair Signal' : 'Poor Signal',
      statusTone: isGood ? 'normal' : 'warning',
      comparisonNote: isGood
        ? 'High cardiac fundamental + 2nd harmonic SNR'
        : 'Increase ambient lighting on forehead and cheeks',
      ...scale,
    });
  }

  return rows;
}

/**
 * Compiles a structured FullReportPayload from the current PulseLens state.
 */
export function generateFullReportData(params: {
  isDemoMode: boolean;
  algorithm: RppgAlgorithm;
  windowSec: number;
  latestRGB: { r: number; g: number; b: number; skinRatio: number } | null;
  analysis: PipelineAnalysisResult;
  readingsLog: ReadingLogEntry[];
}): FullReportPayload {
  const now = new Date();
  const reportId = `PL-${now.getTime().toString(36).toUpperCase()}`;
  const { isDemoMode, algorithm, windowSec, latestRGB, analysis, readingsLog } =
    params;

  const algos: RppgAlgorithm[] = ['POS', 'CHROM', 'GREEN'];
  const comparisonList: AlgorithmComparisonItem[] = algos.map((algo) => {
    if (analysis.comparison && analysis.comparison[algo]) {
      return analysis.comparison[algo];
    }
    return {
      algorithm: algo,
      bpm: analysis.bpm,
      rawBpm: analysis.instantBpm,
      sqi: analysis.sqi,
      sqiLabel: analysis.sqiLabel,
    };
  });

  const referenceComparisons = buildReferenceComparisons(analysis);

  const notes: string[] = [];
  if (analysis.bpm !== null) {
    if (analysis.bpm < 60) {
      notes.push(
        `Estimated heart rate is ${analysis.bpm.toFixed(1)} BPM (below the 60–100 BPM adult resting reference range).`
      );
    } else if (analysis.bpm <= 100) {
      notes.push(
        `Estimated heart rate is ${analysis.bpm.toFixed(1)} BPM, well within the normal adult resting reference range (60.0–100.0 BPM).`
      );
    } else {
      notes.push(
        `Estimated heart rate is ${analysis.bpm.toFixed(1)} BPM (above the 60–100 BPM adult resting reference range).`
      );
    }
  } else {
    notes.push(
      'Insufficient optical buffer duration (< 8 s) to lock a stable spectral BPM peak.'
    );
  }

  if (analysis.sqiLabel === 'Good') {
    notes.push(
      `Optical Signal Quality Index (SQI) is Good (${(analysis.sqi * 100).toFixed(0)}%, reference ≥ 50%), indicating strong cardiac harmonic concentration in the 0.7–4.0 Hz passband.`
    );
  } else if (analysis.sqiLabel === 'Fair') {
    notes.push(
      `Optical Signal Quality Index (SQI) is Fair (${(analysis.sqi * 100).toFixed(0)}%, reference ≥ 50%). Minor illumination or motion artifacts detected.`
    );
  } else {
    notes.push(
      `Optical Signal Quality Index (SQI) is Poor (${(analysis.sqi * 100).toFixed(0)}%, reference ≥ 50%). Ensure even front lighting and minimal head motion.`
    );
  }

  if (
    analysis.hrv.isReady &&
    analysis.hrv.rmssd !== null &&
    analysis.hrv.sdnn !== null
  ) {
    notes.push(
      `Autonomic HRV calibrated over ${analysis.hrv.durationSec.toFixed(0)} s (${analysis.hrv.cleanBeatCount} clean beats): SDNN = ${analysis.hrv.sdnn.toFixed(1)} ms (normal 20–100 ms), RMSSD = ${analysis.hrv.rmssd.toFixed(1)} ms (normal 19–75 ms), Poincaré SD1/SD2 = ${analysis.hrv.sd1?.toFixed(0) ?? '—'}/${analysis.hrv.sd2?.toFixed(0) ?? '—'} ms.`
    );
  } else {
    notes.push(
      `HRV metrics require at least 30 seconds of clean tracking and 15+ artifact-free beats (currently ${analysis.hrv.durationSec.toFixed(0)} s / ${analysis.hrv.cleanBeatCount} beats).`
    );
  }

  return {
    reportId,
    generatedAtIso: now.toISOString(),
    generatedAtFormatted: now.toLocaleString(),
    mode: isDemoMode ? 'Synthetic 72 BPM Demo' : 'Live Webcam rPPG',
    activeAlgorithm: algorithm,
    fftWindowSec: windowSec,
    bufferDurationSec: analysis.bufferDurationSec,
    measuredFps: analysis.measuredFps,
    skinPassPercent: latestRGB ? Math.round(latestRGB.skinRatio * 100) : null,
    meanRGB: latestRGB
      ? {
          r: Number(latestRGB.r.toFixed(1)),
          g: Number(latestRGB.g.toFixed(1)),
          b: Number(latestRGB.b.toFixed(1)),
        }
      : null,
    analysis,
    comparisonList,
    referenceComparisons,
    readingsLog,
    interpretationNotes: notes,
  };
}

/**
 * Renders the 10s filtered pulse waveform and detected systolic beats as a standalone SVG string.
 */
export function renderWaveformSvgString(analysis: PipelineAnalysisResult): string {
  const width = 720;
  const height = 170;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { waveformTimestamps: ts, waveformValues: vals, waveformBeats: beats } =
    analysis;

  if (vals.length < 4 || ts.length !== vals.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <rect width="${width}" height="${height}" fill="#F8FAFC" rx="6" stroke="#CBD5E1" />
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#64748B" font-family="monospace" font-size="12">No pulse waveform samples recorded</text>
    </svg>`;
  }

  const tMax = ts[ts.length - 1];
  const tMin = tMax - 10_000;
  let maxAbs = 0.5;
  for (const v of vals) {
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  maxAbs *= 1.18;

  const mapX = (t: number) =>
    padL + Math.max(0, Math.min(1, (t - tMin) / 10_000)) * plotW;
  const mapY = (v: number) => padT + plotH / 2 - (v / maxAbs) * (plotH / 2);

  const points = vals
    .map((v, i) => `${mapX(ts[i]).toFixed(1)},${mapY(v).toFixed(1)}`)
    .join(' ');

  const beatElements = beats
    .filter((b) => b.timestamp >= tMin && b.timestamp <= tMax)
    .map((b) => {
      const bx = mapX(b.timestamp).toFixed(1);
      const by = mapY(b.amplitude).toFixed(1);
      return `<line x1="${bx}" y1="${padT}" x2="${bx}" y2="${padT + plotH}" stroke="#E11D48" stroke-dasharray="3,3" stroke-opacity="0.4" />
      <circle cx="${bx}" cy="${by}" r="3.5" fill="#E11D48" stroke="#FFFFFF" stroke-width="1.2" />`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
    <rect width="${width}" height="${height}" fill="#F8FAFC" rx="6" stroke="#CBD5E1" />
    <line x1="${padL}" y1="${padT + plotH / 2}" x2="${padL + plotW}" y2="${padT + plotH / 2}" stroke="#CBD5E1" stroke-width="1" />
    ${beatElements}
    <polyline fill="none" stroke="#0F766E" stroke-width="2" points="${points}" />
  </svg>`;
}

/**
 * Renders the IBI Tachogram series as a standalone SVG string.
 */
export function renderIbiSvgString(analysis: PipelineAnalysisResult): string {
  const width = 720;
  const height = 155;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const recent = analysis.ibiSeries.slice(-60);
  if (recent.length < 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <rect width="${width}" height="${height}" fill="#F8FAFC" rx="6" stroke="#CBD5E1" />
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#64748B" font-family="monospace" font-size="12">Insufficient clean beats for IBI tachogram</text>
    </svg>`;
  }

  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of recent) {
    if (p.ibiMs < minV) minV = p.ibiMs;
    if (p.ibiMs > maxV) maxV = p.ibiMs;
  }
  const center = analysis.hrv.meanIbi ?? 0.5 * (minV + maxV);
  const halfSpan = Math.max(60, Math.max(center - minV, maxV - center) * 1.25);
  const yMin = Math.max(300, Math.round(center - halfSpan));
  const yMax = Math.min(1500, Math.round(center + halfSpan));

  const tMin = recent[0].relativeSec;
  const tMax = Math.max(tMin + 1, recent[recent.length - 1].relativeSec);

  const mapX = (s: number) => padL + ((s - tMin) / (tMax - tMin)) * plotW;
  const mapY = (ms: number) =>
    padT + plotH - ((ms - yMin) / Math.max(1, yMax - yMin)) * plotH;

  const points = recent
    .map((p) => `${mapX(p.relativeSec).toFixed(1)},${mapY(p.ibiMs).toFixed(1)}`)
    .join(' ');

  const circles = recent
    .map(
      (p) =>
        `<circle cx="${mapX(p.relativeSec).toFixed(1)}" cy="${mapY(p.ibiMs).toFixed(1)}" r="2.5" fill="#0284C7" />`
    )
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
    <rect width="${width}" height="${height}" fill="#F8FAFC" rx="6" stroke="#CBD5E1" />
    <polyline fill="none" stroke="#4F46E5" stroke-width="2" points="${points}" />
    ${circles}
  </svg>`;
}

/**
 * Escapes ASCII text for PDF literal strings.
 */
function pdfEscape(str: string): string {
  return str
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === '–' || ch === '—') return '-';
      if (ch === '·') return '|';
      if (ch === '≥') return '>=';
      if (ch === '≤') return '<=';
      if (ch === 'Δ') return 'd';
      if (ch === 'é') return 'e';
      return ' ';
    })
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Pure TypeScript ISO-32000 PDF 1.4 Generator.
 * Produces a vector-sharp A4 clinical PDF report with:
 * - Header & Session Metadata
 * - Executive Vital Signs Cards
 * - Normal Reference Range vs. Current Reading Comparison Table + Visual Range Bars
 * - Vector 10s rPPG Pulse Waveform & Detected Systolic Peaks
 * - Multi-Algorithm Comparison Table & Diagnostic Observations
 */
export function buildClinicalPdfBytes(report: FullReportPayload): Uint8Array {
  const pageW = 595.28; // A4 width in pt
  const pageH = 841.89; // A4 height in pt
  const margin = 36;
  const contentW = pageW - margin * 2;

  const ops: string[] = [];

  const setFillRGB = (r: number, g: number, b: number) =>
    ops.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`);
  const setStrokeRGB = (r: number, g: number, b: number) =>
    ops.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG`);
  const setLineWidth = (w: number) => ops.push(`${w.toFixed(2)} w`);

  // Helper to convert top-down Y coordinate to PDF bottom-up Y coordinate
  const pdfY = (topY: number) => pageH - topY;

  const drawRect = (
    x: number,
    topY: number,
    w: number,
    h: number,
    mode: 'f' | 'S' | 'B'
  ) => {
    ops.push(
      `${x.toFixed(2)} ${(pageH - topY - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${mode}`
    );
  };

  const drawLine = (x1: number, topY1: number, x2: number, topY2: number) => {
    ops.push(
      `${x1.toFixed(2)} ${pdfY(topY1).toFixed(2)} m ${x2.toFixed(2)} ${pdfY(topY2).toFixed(2)} l S`
    );
  };

  const drawText = (
    text: string,
    x: number,
    topY: number,
    font: 'F1' | 'F2' | 'F3',
    size: number,
    rgb: [number, number, number] = [15, 23, 42]
  ) => {
    setFillRGB(rgb[0], rgb[1], rgb[2]);
    ops.push(
      `BT /${font} ${size} Tf ${x.toFixed(2)} ${pdfY(topY).toFixed(2)} Td (${pdfEscape(
        text
      )}) Tj ET`
    );
  };

  // 1. Top Header Banner
  setFillRGB(15, 23, 42);
  drawRect(0, 0, pageW, 64, 'f');

  drawText(
    'PulseLens — Contactless Vital-Signs & HRV Report',
    margin,
    26,
    'F2',
    15,
    [255, 255, 255]
  );
  drawText(
    'Remote Photoplethysmography (rPPG) Optical Signal & Reference Range Comparison',
    margin,
    43,
    'F1',
    8.5,
    [45, 212, 191]
  );

  drawText(
    `Report ID: ${report.reportId}`,
    pageW - margin - 155,
    24,
    'F3',
    8,
    [226, 232, 240]
  );
  drawText(
    `Date: ${report.generatedAtFormatted}`,
    pageW - margin - 155,
    36,
    'F3',
    7.5,
    [148, 163, 184]
  );
  drawText(
    `Mode: ${report.mode}`,
    pageW - margin - 155,
    48,
    'F3',
    7.5,
    [148, 163, 184]
  );

  // Disclaimer Strip
  let curY = 74;
  setFillRGB(254, 243, 199);
  setStrokeRGB(251, 191, 36);
  setLineWidth(0.75);
  drawRect(margin, curY, contentW, 18, 'B');
  drawText(
    'CLINICAL DISCLAIMER: Screening/demo tool only - not a medical device. All values are optical rPPG estimates.',
    margin + 8,
    curY + 12,
    'F2',
    7.5,
    [146, 64, 14]
  );

  // 2. Executive Summary Cards (4 columns)
  curY = 102;
  drawText(
    '01. EXECUTIVE VITAL SIGNS SUMMARY',
    margin,
    curY,
    'F2',
    9.5,
    [15, 118, 110]
  );
  curY += 6;

  const { analysis } = report;
  const { hrv } = analysis;
  const fmt = (v: number | null, d = 1) =>
    v !== null && Number.isFinite(v) ? v.toFixed(d) : '--';

  const cardW = (contentW - 18) / 4;
  const cards = [
    {
      label: 'HEART RATE (MEDIAN)',
      val: analysis.bpm !== null ? `${Math.round(analysis.bpm)} BPM` : '--',
      sub: `Normal: 60-100 BPM (Exact: ${fmt(analysis.bpm, 1)})`,
    },
    {
      label: 'SIGNAL QUALITY (SQI)',
      val: `${Math.round(analysis.sqi * 100)}% (${analysis.sqiLabel})`,
      sub: `Normal: >= 50% | Algo: ${report.activeAlgorithm}`,
    },
    {
      label: 'MEAN IBI (NN INTERVAL)',
      val: hrv.meanIbi !== null ? `${Math.round(hrv.meanIbi)} ms` : '--',
      sub: `Normal: 600-1000 ms (${hrv.cleanBeatCount} beats)`,
    },
    {
      label: 'RESPIRATION (EXP.)',
      val: hrv.respirationBpm !== null ? `${hrv.respirationBpm.toFixed(1)} br/m` : '--',
      sub: 'Normal: 12.0-20.0 br/min',
    },
  ];

  cards.forEach((c, idx) => {
    const cx = margin + idx * (cardW + 6);
    setFillRGB(248, 250, 252);
    setStrokeRGB(203, 213, 225);
    setLineWidth(0.75);
    drawRect(cx, curY, cardW, 46, 'B');
    drawText(c.label, cx + 7, curY + 12, 'F2', 7, [71, 85, 105]);
    drawText(c.val, cx + 7, curY + 28, 'F3', 12, [15, 23, 42]);
    drawText(c.sub, cx + 7, curY + 40, 'F1', 6.5, [100, 116, 139]);
  });

  // 3. Normal Reference Range vs. Current Reading Comparison Table
  curY += 62;
  drawText(
    '02. CURRENT READING VS. NORMAL REFERENCE RANGE COMPARISON',
    margin,
    curY,
    'F2',
    9.5,
    [15, 118, 110]
  );
  curY += 6;

  // Table Header
  const rowH = 22;
  setFillRGB(241, 245, 249);
  setStrokeRGB(203, 213, 225);
  drawRect(margin, curY, contentW, 18, 'B');

  const colParamX = margin + 6;
  const colCurrX = margin + 145;
  const colNormX = margin + 230;
  const colBarX = margin + 345;
  const colStatX = margin + 445;

  drawText('PARAMETER', colParamX, curY + 12, 'F2', 7.5, [51, 65, 85]);
  drawText('CURRENT READING', colCurrX, curY + 12, 'F2', 7.5, [51, 65, 85]);
  drawText('NORMAL REFERENCE', colNormX, curY + 12, 'F2', 7.5, [51, 65, 85]);
  drawText('VISUAL RANGE COMPARISON', colBarX, curY + 12, 'F2', 7.5, [51, 65, 85]);
  drawText('STATUS', colStatX, curY + 12, 'F2', 7.5, [51, 65, 85]);
  curY += 18;

  report.referenceComparisons.forEach((row, idx) => {
    setFillRGB(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    setStrokeRGB(226, 232, 240);
    setLineWidth(0.5);
    drawRect(margin, curY, contentW, rowH, 'B');

    drawText(row.parameter, colParamX, curY + 10, 'F2', 7.5, [15, 23, 42]);
    drawText(
      row.comparisonNote.slice(0, 42),
      colParamX,
      curY + 18,
      'F1',
      6,
      [100, 116, 139]
    );

    drawText(row.currentFormatted, colCurrX, curY + 14, 'F3', 8, [15, 23, 42]);
    drawText(row.normalRangeFormatted, colNormX, curY + 14, 'F3', 7.5, [51, 65, 85]);

    // Visual range gauge bar (width 86pt)
    const barW = 86;
    const barH = 6;
    const barY = curY + 8;
    // Full track
    setFillRGB(226, 232, 240);
    drawRect(colBarX, barY, barW, barH, 'f');

    // Normal reference zone highlight in soft emerald/teal
    const nx = colBarX + (row.normStartPercent / 100) * barW;
    const nw = (row.normWidthPercent / 100) * barW;
    setFillRGB(167, 243, 208);
    drawRect(nx, barY, nw, barH, 'f');

    // Current reading marker tick
    if (row.markerPercent !== null) {
      const mx = colBarX + (row.markerPercent / 100) * barW;
      if (row.statusTone === 'normal') {
        setFillRGB(13, 148, 136);
      } else {
        setFillRGB(225, 29, 72);
      }
      drawRect(mx - 2, barY - 2, 4, barH + 4, 'f');
    }

    // Status label
    const statusColor: [number, number, number] =
      row.statusTone === 'normal'
        ? [5, 150, 105]
        : row.statusTone === 'warning'
        ? [217, 119, 6]
        : [100, 116, 139];
    drawText(row.statusLabel, colStatX, curY + 14, 'F2', 7.5, statusColor);

    curY += rowH;
  });

  // 4. Vector 10s rPPG Pulse Waveform Plot
  curY += 16;
  drawText(
    `03. 10-SECOND FILTERED rPPG PULSE WAVEFORM (${report.activeAlgorithm}) & DETECTED BEATS`,
    margin,
    curY,
    'F2',
    9.5,
    [15, 118, 110]
  );
  curY += 6;

  const waveBoxH = 88;
  setFillRGB(248, 250, 252);
  setStrokeRGB(203, 213, 225);
  setLineWidth(0.75);
  drawRect(margin, curY, contentW, waveBoxH, 'B');

  // Center zero-line
  setStrokeRGB(203, 213, 225);
  setLineWidth(0.5);
  drawLine(margin + 8, curY + waveBoxH / 2, margin + contentW - 8, curY + waveBoxH / 2);

  const { waveformTimestamps: ts, waveformValues: vals, waveformBeats: beats } =
    analysis;
  if (vals.length >= 4 && ts.length === vals.length) {
    const plotX = margin + 10;
    const plotW = contentW - 20;
    const plotY = curY + 10;
    const plotH = waveBoxH - 20;

    const tMax = ts[ts.length - 1];
    const tMin = tMax - 10_000;
    let maxAbs = 0.5;
    for (const v of vals) {
      if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
    maxAbs *= 1.15;

    const mapX = (t: number) =>
      plotX + Math.max(0, Math.min(1, (t - tMin) / 10_000)) * plotW;
    const mapY = (v: number) => plotY + plotH / 2 - (v / maxAbs) * (plotH / 2);

    // Draw systolic beat vertical ticks and peak boxes
    setStrokeRGB(225, 29, 72);
    setFillRGB(225, 29, 72);
    setLineWidth(0.6);
    for (const b of beats) {
      if (b.timestamp < tMin || b.timestamp > tMax) continue;
      const bx = mapX(b.timestamp);
      const by = mapY(b.amplitude);
      drawLine(bx, plotY, bx, plotY + plotH);
      drawRect(bx - 1.8, by - 1.8, 3.6, 3.6, 'f');
    }

    // Draw continuous pulse waveform vector path
    setStrokeRGB(15, 118, 110);
    setLineWidth(1.4);
    const step = Math.max(1, Math.floor(vals.length / 260));
    ops.push(
      `${mapX(ts[0]).toFixed(2)} ${pdfY(mapY(vals[0])).toFixed(2)} m`
    );
    for (let i = step; i < vals.length; i += step) {
      ops.push(
        `${mapX(ts[i]).toFixed(2)} ${pdfY(mapY(vals[i])).toFixed(2)} l`
      );
    }
    ops.push('S');
  } else {
    drawText(
      'No waveform samples recorded in buffer.',
      margin + contentW / 2 - 80,
      curY + waveBoxH / 2 + 3,
      'F3',
      8,
      [100, 116, 139]
    );
  }

  curY += waveBoxH + 16;

  // 5. Multi-Algorithm Benchmark + Diagnostic Summary Side-by-Side
  drawText(
    '04. MULTI-ALGORITHM BENCHMARK & DIAGNOSTIC OBSERVATIONS',
    margin,
    curY,
    'F2',
    9.5,
    [15, 118, 110]
  );
  curY += 6;

  // Left half: Algorithm table
  const halfW = (contentW - 12) / 2;
  setFillRGB(241, 245, 249);
  setStrokeRGB(203, 213, 225);
  drawRect(margin, curY, halfW, 16, 'B');
  drawText('ALGORITHM', margin + 6, curY + 11, 'F2', 7, [51, 65, 85]);
  drawText('EST. BPM', margin + 95, curY + 11, 'F2', 7, [51, 65, 85]);
  drawText('SQI', margin + 165, curY + 11, 'F2', 7, [51, 65, 85]);
  drawText('QUALITY', margin + 205, curY + 11, 'F2', 7, [51, 65, 85]);

  report.comparisonList.forEach((item, idx) => {
    const ry = curY + 16 + idx * 17;
    setFillRGB(255, 255, 255);
    setStrokeRGB(226, 232, 240);
    drawRect(margin, ry, halfW, 17, 'B');
    drawText(
      `${item.algorithm}${item.algorithm === report.activeAlgorithm ? ' *' : ''}`,
      margin + 6,
      ry + 11,
      'F2',
      7.5,
      [15, 23, 42]
    );
    drawText(
      item.bpm !== null ? `${item.bpm.toFixed(1)} BPM` : '--',
      margin + 95,
      ry + 11,
      'F3',
      7.5,
      [15, 23, 42]
    );
    drawText(item.sqi.toFixed(2), margin + 165, ry + 11, 'F3', 7.5, [51, 65, 85]);
    drawText(item.sqiLabel, margin + 205, ry + 11, 'F2', 7.5, [13, 148, 136]);
  });

  // Right half: Diagnostic interpretation box
  const notesX = margin + halfW + 12;
  setFillRGB(248, 250, 252);
  setStrokeRGB(203, 213, 225);
  drawRect(notesX, curY, halfW, 67, 'B');
  drawText('INTERPRETATION & OPTICAL NOTES', notesX + 8, curY + 12, 'F2', 7.5, [15, 23, 42]);

  let noteY = curY + 24;
  report.interpretationNotes.forEach((note) => {
    // Wrap note into ~54-char lines
    const words = note.split(' ');
    let line = '- ';
    for (const w of words) {
      if ((line + w).length > 54) {
        drawText(line, notesX + 8, noteY, 'F1', 6.8, [51, 65, 85]);
        noteY += 9.5;
        line = '  ' + w + ' ';
      } else {
        line += w + ' ';
      }
    }
    if (line.trim().length > 0 && noteY < curY + 64) {
      drawText(line, notesX + 8, noteY, 'F1', 6.8, [51, 65, 85]);
      noteY += 10.5;
    }
  });

  // Footer
  setStrokeRGB(203, 213, 225);
  setLineWidth(0.5);
  drawLine(margin, pageH - 28, pageW - margin, pageH - 28);
  drawText(
    `PulseLens Client-Side rPPG Report | Measured FPS: ${report.measuredFps.toFixed(1)} Hz | Buffer: ${report.bufferDurationSec.toFixed(1)}s | Skin Pass: ${report.skinPassPercent ?? '--'}%`,
    margin,
    pageH - 16,
    'F1',
    7,
    [100, 116, 139]
  );
  drawText(
    'Page 1 of 1',
    pageW - margin - 42,
    pageH - 16,
    'F3',
    7,
    [100, 116, 139]
  );

  // Assemble valid PDF 1.4 structure
  const contentStream = ops.join('\n');
  const objects: string[] = [];

  // 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  // 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  // 3: Page
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(
      2
    )}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj`
  );
  // 4: Font F1 (Helvetica)
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj'
  );
  // 5: Font F2 (Helvetica-Bold)
  objects.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj'
  );
  // 6: Font F3 (Courier-Bold)
  objects.push(
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj'
  );
  // 7: Content Stream
  objects.push(
    `7 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj`
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdf);
}

/**
 * Triggers a browser download of the generated PDF report file (.pdf).
 */
export function downloadPdfReport(report: FullReportPayload): void {
  const pdfBytes = buildClinicalPdfBytes(report);
  const dateSlug = report.generatedAtIso.slice(0, 19).replace(/:/g, '-');
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `pulselens-report-${dateSlug}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a standalone, self-contained HTML clinical report document for download.
 */
export function buildStandaloneHtmlReport(report: FullReportPayload): string {
  const { analysis } = report;
  const hrv = analysis.hrv;
  const fmt = (v: number | null, d = 1) =>
    v !== null && Number.isFinite(v) ? v.toFixed(d) : '—';

  const waveformSvg = renderWaveformSvgString(analysis);
  const ibiSvg = renderIbiSvgString(analysis);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PulseLens Full Diagnostic Report — ${report.reportId}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'IBM Plex Sans', 'Segoe UI', Roboto, sans-serif;
      background: #F1F5F9;
      color: #0F172A;
      margin: 0;
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      padding: 32px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F766E;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .brand { font-size: 24px; font-weight: 700; color: #0F172A; margin: 0; }
    .subtitle { font-size: 13px; color: #0F766E; font-weight: 600; margin-top: 2px; }
    .meta { text-align: right; font-family: monospace; font-size: 12px; color: #475569; }
    .disclaimer {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      color: #92400E;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 15px;
      font-weight: 700;
      color: #0F172A;
      margin: 24px 0 12px 0;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 6px;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 14px;
    }
    .card-label { font-size: 11px; color: #475569; font-weight: 600; text-transform: uppercase; }
    .card-val { font-size: 24px; font-weight: 700; font-family: monospace; color: #0F172A; margin-top: 4px; }
    .card-unit { font-size: 12px; color: #64748B; font-weight: 500; margin-left: 4px; }
    .card-sub { font-size: 11px; color: #64748B; font-family: monospace; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      font-family: monospace;
      margin-top: 8px;
    }
    th, td {
      border-bottom: 1px solid #E2E8F0;
      padding: 8px 10px;
      text-align: left;
    }
    th { background: #F8FAFC; color: #475569; font-weight: 600; }
    ul.notes { margin: 8px 0; padding-left: 20px; font-size: 13px; color: #334155; }
    ul.notes li { margin-bottom: 6px; }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #E2E8F0;
      font-size: 11px;
      color: #64748B;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="brand">PulseLens — Contactless rPPG Vital-Signs &amp; HRV Report</h1>
        <div class="subtitle">Current Reading vs. Normal Reference Range Comparison</div>
      </div>
      <div class="meta">
        <div><strong>Report ID:</strong> ${report.reportId}</div>
        <div><strong>Timestamp:</strong> ${report.generatedAtFormatted}</div>
        <div><strong>Source Mode:</strong> ${report.mode}</div>
      </div>
    </div>

    <div class="disclaimer">
      <strong>Clinical Disclaimer:</strong> Screening and educational demonstration tool only — not a certified medical device. Do not use for clinical diagnosis.
    </div>

    <h2>1. Primary Vital Signs &amp; Optical Signal Quality</h2>
    <div class="grid-4">
      <div class="card">
        <div class="card-label">Heart Rate (Median)</div>
        <div class="card-val">${analysis.bpm !== null ? Math.round(analysis.bpm) : '—'}<span class="card-unit">BPM</span></div>
        <div class="card-sub">Normal: 60–100 BPM · Exact: ${fmt(analysis.bpm, 1)}</div>
      </div>
      <div class="card">
        <div class="card-label">Signal Quality (SQI)</div>
        <div class="card-val">${Math.round(analysis.sqi * 100)}<span class="card-unit">% (${analysis.sqiLabel})</span></div>
        <div class="card-sub">Normal: ≥ 50% · Method: ${report.activeAlgorithm}</div>
      </div>
      <div class="card">
        <div class="card-label">Mean IBI</div>
        <div class="card-val">${fmt(hrv.meanIbi, 0)}<span class="card-unit">ms</span></div>
        <div class="card-sub">Normal: 600–1000 ms (${hrv.cleanBeatCount} beats)</div>
      </div>
      <div class="card">
        <div class="card-label">Respiration (Exp.)</div>
        <div class="card-val">${fmt(hrv.respirationBpm, 1)}<span class="card-unit">br/min</span></div>
        <div class="card-sub">Normal: 12.0–20.0 br/min</div>
      </div>
    </div>

    <h2>2. Current Reading vs. Normal Reference Range Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Current Reading</th>
          <th>Normal Reference Range</th>
          <th>Status</th>
          <th>Clinical / Physiological Comparison</th>
        </tr>
      </thead>
      <tbody>
        ${report.referenceComparisons
          .map(
            (r) => `<tr>
          <td><strong>${r.parameter}</strong></td>
          <td><strong>${r.currentFormatted}</strong></td>
          <td>${r.normalRangeFormatted}</td>
          <td style="color:${r.statusTone === 'normal' ? '#059669' : r.statusTone === 'warning' ? '#D97706' : '#64748B'};font-weight:700;">${r.statusLabel}</td>
          <td>${r.comparisonNote}</td>
        </tr>`
          )
          .join('\n        ')}
      </tbody>
    </table>

    <h2>3. Automated Signal &amp; Physiological Summary</h2>
    <ul class="notes">
      ${report.interpretationNotes.map((n) => `<li>${n}</li>`).join('\n      ')}
    </ul>

    <h2>4. Filtered 10 s rPPG Pulse Waveform &amp; Detected Systolic Peaks</h2>
    ${waveformSvg}

    <h2>5. Inter-Beat Interval (IBI) Tachogram</h2>
    ${ibiSvg}

    <div class="footer">
      <span>Generated by PulseLens Client-Side rPPG Engine (100% In-Browser DSP)</span>
      <span>Report ID: ${report.reportId}</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates a clean plain-text / Markdown report for quick text download.
 */
export function buildMarkdownReport(report: FullReportPayload): string {
  const { analysis } = report;
  const hrv = analysis.hrv;
  const fmt = (v: number | null, d = 1) =>
    v !== null && Number.isFinite(v) ? v.toFixed(d) : '—';

  return `# PulseLens — Contactless Vital-Signs & HRV Report
Report ID: ${report.reportId}
Generated: ${report.generatedAtFormatted}
Mode: ${report.mode}
Active rPPG Algorithm: ${report.activeAlgorithm} (FFT Window: ${report.fftWindowSec} s)
Disclaimer: Screening/demo tool, not a medical device.

## 1. Current Reading vs. Normal Reference Range Comparison
| Parameter | Current Reading | Normal Reference Range | Status | Comparison Note |
| :--- | :--- | :--- | :--- | :--- |
${report.referenceComparisons
  .map(
    (r) =>
      `| ${r.parameter} | ${r.currentFormatted} | ${r.normalRangeFormatted} | ${r.statusLabel} | ${r.comparisonNote} |`
  )
  .join('\n')}

## 2. Primary Vital Signs & HRV Summary
- Heart Rate (Median of 5): ${analysis.bpm !== null ? `${Math.round(analysis.bpm)} BPM (Exact: ${analysis.bpm.toFixed(1)} BPM, Normal: 60-100 BPM)` : '—'}
- Signal Quality Index (SQI): ${(analysis.sqi * 100).toFixed(0)}% (${analysis.sqi.toFixed(2)} - ${analysis.sqiLabel}, Normal: >= 50%)
- Mean IBI: ${fmt(hrv.meanIbi, 0)} ms (Normal: 600-1000 ms)
- SDNN: ${fmt(hrv.sdnn, 1)} ms (Normal: 20-100 ms)
- RMSSD: ${fmt(hrv.rmssd, 1)} ms (Normal: 19-75 ms)
- pNN50: ${fmt(hrv.pnn50, 1)} % (Normal: 3-43 %)
- Poincare SD1 / SD2: ${fmt(hrv.sd1, 1)} ms / ${fmt(hrv.sd2, 1)} ms
- LF / HF Ratio: ${hrv.lfHfStatus === 'ready' && hrv.lfHf !== null ? hrv.lfHf.toFixed(2) : 'needs 2+ min'} (Normal: 0.50-2.00)
- Experimental Respiration Rate: ${fmt(hrv.respirationBpm, 1)} breaths/min (Normal: 12-20 br/min)

## 3. Summary Notes
${report.interpretationNotes.map((n) => `- ${n}`).join('\n')}
`;
}

/**
 * Triggers a browser file download from string content.
 */
export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
