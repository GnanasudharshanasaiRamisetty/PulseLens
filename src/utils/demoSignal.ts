import {
  AlgorithmComparisonItem,
  PipelineAnalysisResult,
  RGBSample,
  RppgAlgorithm,
} from '../types/rppg';
import {
  bandpassFilterZeroPhase,
  detectBeatsAndIbi,
  estimateHeartRateAndSqi,
  resampleRGBBuffer,
} from './dsp';
import { computeHRVMetrics } from './hrv';
import { extractPulseSignal } from './rppg';

/**
 * Generates a realistic synthetic RGB sample at timestamp `tMs` (in milliseconds)
 * for Demo Mode verification:
 * - True heart rate: 72 BPM (1.20 Hz)
 * - Respiratory sinus arrhythmia (RSA): 0.25 Hz (15 breaths/min) phase modulation
 *   producing realistic beat-to-beat HRV (~38 ms SDNN, ~32 ms RMSSD)
 * - Breathing amplitude modulation (0.25 Hz)
 * - Slow ambient illumination drift (0.05 Hz) across all RGB channels
 * - Blood volume pulse weights matching skin hemoglobin absorption (strongest in G, weaker in B and R)
 */
export function generateSyntheticRGBSample(tMs: number): RGBSample {
  const t = tMs / 1000;

  // 72 BPM = 1.20 Hz fundamental cardiac frequency
  const fHeart = 1.2;
  // 15 breaths/min = 0.25 Hz respiratory frequency
  const fResp = 0.25;

  // Respiratory Sinus Arrhythmia (RSA) phase modulation + subtle Mayer wave (0.10 Hz)
  // Instantaneous frequency f(t) = 1.2 + 0.055 * cos(2*pi*0.25*t) + 0.025 * cos(2*pi*0.10*t)
  const phaseHeart =
    2 * Math.PI * fHeart * t +
    (0.055 / fResp) * Math.sin(2 * Math.PI * fResp * t) +
    (0.025 / 0.1) * Math.sin(2 * Math.PI * 0.1 * t);

  // Cardiac blood volume pulse wave (fundamental + dicrotic notch 2nd harmonic)
  // Note: Blood volume increase reduces reflected light (-pulse), so extractPulseGREEN (-G) aligns positively
  const cardiacPulse =
    Math.sin(phaseHeart) + 0.28 * Math.sin(2 * phaseHeart - 0.4);

  // Breathing baseline modulation
  const respMod = 0.25 * Math.sin(2 * Math.PI * fResp * t);

  // Slow ambient lighting intensity drift (0.05 Hz)
  const lightDrift = 1 + 0.015 * Math.sin(2 * Math.PI * 0.05 * t);

  // Base skin RGB reflectance under warm ambient light
  const baseR = 186;
  const baseG = 142;
  const baseB = 118;

  // Hemoglobin absorption is strongest in Green, moderate in Blue, weak in Red
  const r = baseR * lightDrift * (1 - 0.0022 * cardiacPulse + 0.001 * respMod);
  const g = baseG * lightDrift * (1 - 0.0125 * cardiacPulse + 0.002 * respMod);
  const b = baseB * lightDrift * (1 - 0.0055 * cardiacPulse + 0.0015 * respMod);

  return {
    timestamp: tMs,
    r,
    g,
    b,
    skinRatio: 0.94,
  };
}

/**
 * Generates a pre-populated synthetic RGB buffer of `durationSec` seconds at `fps`
 * ending at `nowMs` so Demo Mode can immediately display stabilized 72 BPM and HRV.
 */
export function generateSyntheticBuffer(
  nowMs: number,
  durationSec = 36,
  fps = 30
): RGBSample[] {
  const totalSamples = Math.round(durationSec * fps);
  const dtMs = 1000 / fps;
  const startMs = nowMs - (totalSamples - 1) * dtMs;
  const samples: RGBSample[] = new Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = generateSyntheticRGBSample(startMs + i * dtMs);
  }
  return samples;
}

/**
 * Runs the complete PulseLens rPPG -> Filter -> FFT BPM/SQI -> Beats/IBI -> HRV pipeline.
 */
export function runPulseLensPipeline(
  rawBuffer: RGBSample[],
  algorithm: RppgAlgorithm,
  windowSec: number,
  compareAll: boolean,
  bpmHistoryByAlgo: Record<RppgAlgorithm, number[]>
): {
  result: PipelineAnalysisResult;
  updatedBpmHistory: Record<RppgAlgorithm, number[]>;
} {
  const n = rawBuffer.length;
  const now = n > 0 ? rawBuffer[n - 1].timestamp : performance.now();

  if (n < 15) {
    return {
      result: {
        timestamp: now,
        bufferDurationSec:
          n >= 2 ? (rawBuffer[n - 1].timestamp - rawBuffer[0].timestamp) / 1000 : 0,
        measuredFps: 30,
        sampleCount: n,
        bpm: null,
        instantBpm: null,
        sqi: 0,
        sqiLabel: 'Poor',
        waveformTimestamps: [],
        waveformValues: [],
        waveformBeats: [],
        ibiSeries: [],
        hrv: computeHRVMetrics([], 0),
      },
      updatedBpmHistory: bpmHistoryByAlgo,
    };
  }

  // Step 5: Resample buffer to uniform rate using linear interpolation at measured average FPS
  const { timestamps, r, g, b, fs } = resampleRGBBuffer(rawBuffer);
  const bufferDurationSec =
    (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;

  // Step 6: Extract raw pulse signal for primary selected algorithm
  const rawPulse = extractPulseSignal(r, g, b, fs, algorithm);

  // Step 7: Linear detrend + zero-phase 3rd-order Butterworth bandpass (0.7 - 4.0 Hz)
  const filteredPulse = bandpassFilterZeroPhase(rawPulse, fs, 0.7, 4.0);

  // Step 8: Estimate Heart Rate (BPM) & SQI on last `windowSec`
  const primaryHr = estimateHeartRateAndSqi(
    filteredPulse,
    fs,
    windowSec,
    bpmHistoryByAlgo[algorithm] || []
  );

  const nextBpmHistory: Record<RppgAlgorithm, number[]> = {
    ...bpmHistoryByAlgo,
    [algorithm]: primaryHr.updatedHistory,
  };

  // Step 9: Detect beats and compute clean IBI series
  const { beats, ibiSeries } = detectBeatsAndIbi(
    filteredPulse,
    timestamps,
    fs,
    primaryHr.smoothedBpm
  );

  // Step 10: Compute HRV metrics
  const hrv = computeHRVMetrics(ibiSeries, bufferDurationSec);

  // Slice last 10 seconds for the scrolling pulse waveform display
  const tEnd = timestamps[timestamps.length - 1];
  const tWaveformStart = tEnd - 10_000;
  let waveStartIdx = 0;
  while (
    waveStartIdx < timestamps.length - 1 &&
    timestamps[waveStartIdx] < tWaveformStart
  ) {
    waveStartIdx++;
  }

  const waveformTimestamps = timestamps.slice(waveStartIdx);
  const waveformValues = filteredPulse.slice(waveStartIdx);
  const waveformBeats = beats.filter((bt) => bt.timestamp >= timestamps[waveStartIdx]);

  // Optional: Compare all algorithms (POS, CHROM, GREEN) on the exact same resampled data
  let comparison: Record<RppgAlgorithm, AlgorithmComparisonItem> | undefined;
  if (compareAll) {
    const algos: RppgAlgorithm[] = ['POS', 'CHROM', 'GREEN'];
    comparison = {} as Record<RppgAlgorithm, AlgorithmComparisonItem>;

    for (const algo of algos) {
      if (algo === algorithm) {
        comparison[algo] = {
          algorithm: algo,
          bpm: primaryHr.smoothedBpm,
          rawBpm: primaryHr.instantBpm,
          sqi: primaryHr.sqi,
          sqiLabel: primaryHr.sqiLabel,
        };
      } else {
        const p = extractPulseSignal(r, g, b, fs, algo);
        const fp = bandpassFilterZeroPhase(p, fs, 0.7, 4.0);
        const hr = estimateHeartRateAndSqi(
          fp,
          fs,
          windowSec,
          bpmHistoryByAlgo[algo] || []
        );
        nextBpmHistory[algo] = hr.updatedHistory;
        comparison[algo] = {
          algorithm: algo,
          bpm: hr.smoothedBpm,
          rawBpm: hr.instantBpm,
          sqi: hr.sqi,
          sqiLabel: hr.sqiLabel,
        };
      }
    }
  }

  return {
    result: {
      timestamp: now,
      bufferDurationSec,
      measuredFps: fs,
      sampleCount: timestamps.length,
      bpm: primaryHr.smoothedBpm,
      instantBpm: primaryHr.instantBpm,
      sqi: primaryHr.sqi,
      sqiLabel: primaryHr.sqiLabel,
      waveformTimestamps,
      waveformValues,
      waveformBeats,
      ibiSeries,
      hrv,
      comparison,
    },
    updatedBpmHistory: nextBpmHistory,
  };
}
