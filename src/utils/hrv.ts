import { HRVMetrics, IBIPoint } from '../types/rppg';
import {
  detrendLinear,
  fftRadix2,
  hannWindow,
  mean,
  nextPowerOfTwo,
  resampleLinear,
  std,
} from './dsp';

/**
 * Step 10: Compute Time-Domain, Poincaré, and Frequency-Domain HRV metrics + Respiratory Rate.
 * - Requires >= 30 s of buffer duration and >= 15 clean beats.
 * - Computes Mean IBI, SDNN, RMSSD, pNN50, Poincaré SD1 and SD2.
 * - Interpolates IBI series at 4 Hz, computes power spectrum via FFT:
 *   - LF (0.04 - 0.15 Hz) / HF (0.15 - 0.40 Hz) ratio ONLY when >= 120 s of data is available
 *     (otherwise returns lfHf = null and lfHfStatus = 'needs 2+ min').
 *   - Experimental respiratory rate from dominant 0.10 - 0.50 Hz peak of the 4 Hz interpolated IBI series.
 */
export function computeHRVMetrics(
  ibiSeries: IBIPoint[],
  bufferDurationSec: number
): HRVMetrics {
  const cleanBeatCount = ibiSeries.length;
  // Allow a small tolerance (29.5s for 30s, 118s for 120s) for discrete frame timestamps
  const has30s = bufferDurationSec >= 29.5;
  const has15Beats = cleanBeatCount >= 15;
  const has120s = bufferDurationSec >= 118.0;

  if (!has30s || !has15Beats) {
    const neededSec = Math.max(0, Math.ceil(30 - bufferDurationSec));
    const reason = !has30s
      ? `Collecting data (${ neededSec }s remaining for HRV)`
      : `Need ${15 - cleanBeatCount} more clean beats`;
    return {
      isReady: false,
      reason,
      cleanBeatCount,
      durationSec: bufferDurationSec,
      meanIbi: null,
      sdnn: null,
      rmssd: null,
      pnn50: null,
      sd1: null,
      sd2: null,
      lfHf: null,
      lfHfStatus: 'needs 2+ min',
      respirationBpm: null,
    };
  }

  const ibis = ibiSeries.map((pt) => pt.ibiMs);
  const meanIbi = mean(ibis);
  const sdnn = std(ibis, meanIbi);

  // Successive differences for RMSSD, pNN50, SD1, SD2
  const diffs: number[] = [];
  let sumSqDiffs = 0;
  let countOver50 = 0;

  for (let i = 1; i < ibis.length; i++) {
    const d = ibis[i] - ibis[i - 1];
    diffs.push(d);
    sumSqDiffs += d * d;
    if (Math.abs(d) > 50) {
      countOver50++;
    }
  }

  const numDiffs = diffs.length;
  const rmssd = numDiffs > 0 ? Math.sqrt(sumSqDiffs / numDiffs) : 0;
  const pnn50 = numDiffs > 0 ? (countOver50 / numDiffs) * 100 : 0;

  // Poincaré plot descriptors:
  // SD1 = sqrt(0.5 * std(diffs)^2)
  // SD2 = sqrt(2 * SDNN^2 - 0.5 * std(diffs)^2)
  const stdDiff = std(diffs);
  const sd1 = Math.sqrt(0.5) * stdDiff;
  const sd2Sq = Math.max(0, 2 * sdnn * sdnn - 0.5 * stdDiff * stdDiff);
  const sd2 = Math.sqrt(sd2Sq);

  // Frequency-domain analysis on 4 Hz linearly interpolated IBI tachogram
  const interpFs = 4.0;
  const ibiTimestamps = ibiSeries.map((pt) => pt.timestamp);
  const { values: interpIbi } = resampleLinear(ibiTimestamps, ibis, interpFs);

  let lfHf: number | null = null;
  let respirationBpm: number | null = null;

  if (interpIbi.length >= 16) {
    const detrended = detrendLinear(interpIbi);
    const n = detrended.length;
    const win = hannWindow(n);
    const nFft = Math.max(512, nextPowerOfTwo(n * 4));
    const re = new Float64Array(nFft);
    const im = new Float64Array(nFft);

    for (let i = 0; i < n; i++) {
      re[i] = detrended[i] * win[i];
    }

    fftRadix2(re, im);

    const halfN = nFft >> 1;
    const df = interpFs / nFft;
    const power = new Float64Array(halfN);
    for (let k = 0; k < halfN; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
    }

    // Dominant respiratory rate from 0.10 - 0.50 Hz peak of interpolated IBI series
    const respKMin = Math.max(1, Math.ceil(0.1 / df));
    const respKMax = Math.min(halfN - 2, Math.floor(0.5 / df));
    let respPeakBin = respKMin;
    let respMaxPower = -1;
    for (let k = respKMin; k <= respKMax; k++) {
      if (power[k] > respMaxPower) {
        respMaxPower = power[k];
        respPeakBin = k;
      }
    }

    if (respMaxPower > 0) {
      let refinedRespBin = respPeakBin;
      if (respPeakBin > respKMin && respPeakBin < respKMax) {
        const pL = power[respPeakBin - 1];
        const pC = power[respPeakBin];
        const pR = power[respPeakBin + 1];
        const denom = pL - 2 * pC + pR;
        if (Math.abs(denom) > 1e-12) {
          const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (pL - pR)) / denom));
          refinedRespBin = respPeakBin + delta;
        }
      }
      respirationBpm = refinedRespBin * df * 60;
    }

    // LF (0.04 - 0.15 Hz) and HF (0.15 - 0.40 Hz) only when >= 120 s of data is available
    if (has120s) {
      let lfPower = 0;
      let hfPower = 0;
      for (let k = 1; k < halfN; k++) {
        const f = k * df;
        if (f >= 0.04 && f < 0.15) {
          lfPower += power[k];
        } else if (f >= 0.15 && f <= 0.4) {
          hfPower += power[k];
        }
      }
      if (hfPower > 1e-12) {
        lfHf = lfPower / hfPower;
      }
    }
  }

  return {
    isReady: true,
    cleanBeatCount,
    durationSec: bufferDurationSec,
    meanIbi,
    sdnn,
    rmssd,
    pnn50,
    sd1,
    sd2,
    lfHf,
    lfHfStatus: has120s && lfHf !== null ? 'ready' : 'needs 2+ min',
    respirationBpm,
  };
}
