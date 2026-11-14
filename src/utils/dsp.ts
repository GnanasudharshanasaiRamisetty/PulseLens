import { DetectedBeat, IBIPoint, RGBSample, SignalQualityLabel } from '../types/rppg';

/**
 * Computes mean of a numeric array.
 */
export function mean(arr: ArrayLike<number>): number {
  const n = arr.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  return sum / n;
}

/**
 * Computes sample standard deviation of a numeric array.
 */
export function std(arr: ArrayLike<number>, precomputedMean?: number): number {
  const n = arr.length;
  if (n < 2) return 0;
  const m = precomputedMean !== undefined ? precomputedMean : mean(arr);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * Computes median of a numeric array without mutating input.
 */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

/**
 * Normalizes a signal to zero mean and unit standard deviation.
 */
export function normalizeZeroMeanUnitStd(signal: number[]): number[] {
  const n = signal.length;
  if (n === 0) return [];
  const m = mean(signal);
  const s = std(signal, m);
  if (s < 1e-8) return new Array(n).fill(0);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = (signal[i] - m) / s;
  }
  return out;
}

/**
 * Step 5: Resample non-uniformly sampled 1D signal to a uniform rate using linear interpolation.
 */
export function resampleLinear(
  timestampsMs: number[],
  values: number[],
  targetFs: number
): { timestamps: number[]; values: number[] } {
  const n = timestampsMs.length;
  if (n < 2 || targetFs <= 0) {
    return { timestamps: [...timestampsMs], values: [...values] };
  }
  const tStart = timestampsMs[0];
  const tEnd = timestampsMs[n - 1];
  const durationSec = (tEnd - tStart) / 1000;
  if (durationSec <= 0) {
    return { timestamps: [...timestampsMs], values: [...values] };
  }

  const dtMs = 1000 / targetFs;
  const outLen = Math.max(2, Math.floor((tEnd - tStart) / dtMs) + 1);
  const outTimestamps = new Array<number>(outLen);
  const outValues = new Array<number>(outLen);

  let srcIdx = 0;
  for (let i = 0; i < outLen; i++) {
    const t = Math.min(tEnd, tStart + i * dtMs);
    outTimestamps[i] = t;
    while (srcIdx < n - 2 && timestampsMs[srcIdx + 1] < t) {
      srcIdx++;
    }
    const t0 = timestampsMs[srcIdx];
    const t1 = timestampsMs[srcIdx + 1];
    const v0 = values[srcIdx];
    const v1 = values[srcIdx + 1];
    const span = t1 - t0;
    const alpha = span > 1e-6 ? (t - t0) / span : 0;
    outValues[i] = v0 + alpha * (v1 - v0);
  }

  return { timestamps: outTimestamps, values: outValues };
}

/**
 * Step 5: Resample raw RGB buffer to a uniform sampling rate using measured average FPS.
 */
export function resampleRGBBuffer(samples: RGBSample[]): {
  timestamps: number[];
  r: number[];
  g: number[];
  b: number[];
  fs: number;
} {
  const n = samples.length;
  if (n < 2) {
    return {
      timestamps: samples.map((s) => s.timestamp),
      r: samples.map((s) => s.r),
      g: samples.map((s) => s.g),
      b: samples.map((s) => s.b),
      fs: 30,
    };
  }

  const tStart = samples[0].timestamp;
  const tEnd = samples[n - 1].timestamp;
  const durationSec = Math.max(1e-3, (tEnd - tStart) / 1000);
  // Measured average FPS clamped to reasonable bounds [10, 60] Hz
  const measuredFs = Math.max(10, Math.min(60, (n - 1) / durationSec));
  const dtMs = 1000 / measuredFs;
  const outLen = Math.max(2, Math.floor((tEnd - tStart) / dtMs) + 1);

  const timestamps = new Array<number>(outLen);
  const r = new Array<number>(outLen);
  const g = new Array<number>(outLen);
  const b = new Array<number>(outLen);

  let srcIdx = 0;
  for (let i = 0; i < outLen; i++) {
    const t = Math.min(tEnd, tStart + i * dtMs);
    timestamps[i] = t;
    while (srcIdx < n - 2 && samples[srcIdx + 1].timestamp < t) {
      srcIdx++;
    }
    const s0 = samples[srcIdx];
    const s1 = samples[srcIdx + 1];
    const span = s1.timestamp - s0.timestamp;
    const alpha = span > 1e-6 ? (t - s0.timestamp) / span : 0;
    r[i] = s0.r + alpha * (s1.r - s0.r);
    g[i] = s0.g + alpha * (s1.g - s0.g);
    b[i] = s0.b + alpha * (s1.b - s0.b);
  }

  return { timestamps, r, g, b, fs: measuredFs };
}

/**
 * Step 7a: Linear detrending via ordinary least squares fit y = m*x + c.
 */
export function detrendLinear(signal: number[]): number[] {
  const n = signal.length;
  if (n < 2) return [...signal];

  const xMean = (n - 1) / 2;
  const yMean = mean(signal);

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    num += dx * (signal[i] - yMean);
    den += dx * dx;
  }

  const slope = den > 1e-12 ? num / den : 0;
  const intercept = yMean - slope * xMean;

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] - (slope * i + intercept);
  }
  return out;
}

/**
 * Second-Order Section (Biquad) coefficients:
 * H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
 */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Step 7b: Design a 3rd-order Butterworth bandpass filter (fLow = 0.7 Hz, fHigh = 4.0 Hz)
 * decomposed into 3 cascaded biquad sections via bilinear transform with frequency pre-warping.
 *
 * A 3rd-order Butterworth prototype has polynomial (s + 1)(s^2 + s + 1).
 * Transforming high-pass at fLow (order 3) and low-pass at fHigh (order 3) yields:
 * - Biquad 1: 2nd-order Butterworth high-pass section at fLow
 * - Biquad 2: 2nd-order Butterworth low-pass section at fHigh
 * - Biquad 3: Combined 1st-order Butterworth high-pass (fLow) * 1st-order Butterworth low-pass (fHigh)
 */
export function designButterworth3BandpassBiquads(
  fs: number,
  fLow = 0.7,
  fHigh = 4.0
): BiquadCoeffs[] {
  const nyq = fs / 2;
  const safeFLow = Math.max(0.05, Math.min(fLow, nyq * 0.85));
  const safeFHigh = Math.max(safeFLow + 0.1, Math.min(fHigh, nyq * 0.95));

  // Pre-warped digital frequencies K = tan(pi * fc / fs)
  const kH = Math.tan((Math.PI * safeFLow) / fs);
  const kL = Math.tan((Math.PI * safeFHigh) / fs);

  // 1) 2nd-order section of 3rd-order Butterworth High-Pass (s^2 + s + 1)
  const normH2 = 1 / (1 + kH + kH * kH);
  const biquadHP2: BiquadCoeffs = {
    b0: 1 * normH2,
    b1: -2 * normH2,
    b2: 1 * normH2,
    a1: 2 * (kH * kH - 1) * normH2,
    a2: (1 - kH + kH * kH) * normH2,
  };

  // 2) 2nd-order section of 3rd-order Butterworth Low-Pass (s^2 + s + 1)
  const normL2 = 1 / (1 + kL + kL * kL);
  const biquadLP2: BiquadCoeffs = {
    b0: kL * kL * normL2,
    b1: 2 * kL * kL * normL2,
    b2: kL * kL * normL2,
    a1: 2 * (kL * kL - 1) * normL2,
    a2: (1 - kL + kL * kL) * normL2,
  };

  // 3) Product of 1st-order High-Pass (s + 1) and 1st-order Low-Pass (s + 1) as a single Biquad
  const gH1 = 1 / (1 + kH);
  const aH1 = (kH - 1) / (kH + 1);
  const gL1 = kL / (1 + kL);
  const aL1 = (kL - 1) / (kL + 1);
  const g1 = gH1 * gL1;

  const biquadCombined1: BiquadCoeffs = {
    b0: g1,
    b1: 0,
    b2: -g1,
    a1: aH1 + aL1,
    a2: aH1 * aL1,
  };

  return [biquadHP2, biquadLP2, biquadCombined1];
}

/**
 * Applies a single biquad filter in the forward direction using Direct Form II Transposed.
 */
function applyBiquadForward(signal: number[], c: BiquadCoeffs): number[] {
  const n = signal.length;
  const out = new Array<number>(n);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < n; i++) {
    const x = signal[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    out[i] = y;
  }
  return out;
}

/**
 * Step 7: Zero-phase (forward-backward) 3rd-order Butterworth bandpass filter (0.7 - 4.0 Hz)
 * implemented with cascaded biquad sections and odd-reflection padding to eliminate edge transients.
 */
export function bandpassFilterZeroPhase(
  signal: number[],
  fs: number,
  fLow = 0.7,
  fHigh = 4.0
): number[] {
  const n = signal.length;
  if (n < 6) return [...signal];

  // Step 7a: Linear detrend first
  const detrended = detrendLinear(signal);
  const biquads = designButterworth3BandpassBiquads(fs, fLow, fHigh);

  // Odd-reflection pad at both ends to suppress startup transients during forward-backward pass
  const padLen = Math.min(n - 2, Math.max(12, Math.round(fs * 1.5)));
  const paddedLen = n + 2 * padLen;
  let buf = new Array<number>(paddedLen);

  const leftEdge = detrended[0];
  for (let i = 0; i < padLen; i++) {
    buf[i] = 2 * leftEdge - detrended[padLen - i];
  }
  for (let i = 0; i < n; i++) {
    buf[padLen + i] = detrended[i];
  }
  const rightEdge = detrended[n - 1];
  for (let i = 0; i < padLen; i++) {
    buf[padLen + n + i] = 2 * rightEdge - detrended[n - 2 - i];
  }

  // Forward pass through all biquad sections
  for (const bq of biquads) {
    buf = applyBiquadForward(buf, bq);
  }

  // Reverse signal
  buf.reverse();

  // Backward pass through all biquad sections
  for (const bq of biquads) {
    buf = applyBiquadForward(buf, bq);
  }

  // Reverse back and strip padding
  buf.reverse();
  return buf.slice(padLen, padLen + n);
}

/**
 * Next power of 2 >= n.
 */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Step 8: In-place iterative Cooley-Tukey Radix-2 FFT.
 * Length of re and im MUST be a power of 2.
 */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, received ${n}`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Butterfly stages
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    const wStepRe = Math.cos(angleStep);
    const wStepIm = Math.sin(angleStep);

    for (let i = 0; i < n; i += size) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < halfSize; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;

        const tRe = wRe * re[oddIdx] - wIm * im[oddIdx];
        const tIm = wRe * im[oddIdx] + wIm * re[oddIdx];

        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Generates a Hann window of length n.
 */
export function hannWindow(n: number): Float64Array {
  const win = new Float64Array(n);
  if (n <= 1) {
    if (n === 1) win[0] = 1;
    return win;
  }
  for (let i = 0; i < n; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return win;
}

/**
 * Classifies Signal Quality Index (SQI) per specification:
 * Good (>= 0.5), Fair (>= 0.3), Poor (< 0.3)
 */
export function classifySqi(sqi: number): SignalQualityLabel {
  if (sqi >= 0.5) return 'Good';
  if (sqi >= 0.3) return 'Fair';
  return 'Poor';
}

/**
 * Step 8: Estimate Heart Rate (BPM) and Signal Quality Index (SQI) from filtered pulse.
 * - Takes the last `windowSec` (default 15 s, adjustable 8-30 s).
 * - Applies a Hann window, zero-pads, computes power spectrum with radix-2 FFT.
 * - Takes the peak between 0.7 and 4.0 Hz (x60 = BPM).
 * - Computes SQI = fraction of in-band (0.7-4.0 Hz) power within +/-0.15 Hz of the peak
 *   and of its 2nd harmonic.
 */
export function estimateHeartRateAndSqi(
  filteredPulse: number[],
  fs: number,
  windowSec = 15,
  recentBpms: number[] = []
): {
  instantBpm: number | null;
  smoothedBpm: number | null;
  sqi: number;
  sqiLabel: SignalQualityLabel;
  updatedHistory: number[];
} {
  const totalSamples = filteredPulse.length;
  const minSamples = Math.floor(7.5 * fs); // Require ~8 s minimum
  if (totalSamples < minSamples) {
    return {
      instantBpm: null,
      smoothedBpm: recentBpms.length > 0 ? median(recentBpms) : null,
      sqi: 0,
      sqiLabel: 'Poor',
      updatedHistory: recentBpms,
    };
  }

  const winSamples = Math.min(totalSamples, Math.round(windowSec * fs));
  const segment = filteredPulse.slice(totalSamples - winSamples);
  const segMean = mean(segment);

  // Zero-pad to at least 4x length and >= 2048 for fine frequency resolution (~0.007 Hz/bin)
  const nFft = Math.max(2048, nextPowerOfTwo(winSamples * 4));
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const win = hannWindow(winSamples);

  for (let i = 0; i < winSamples; i++) {
    re[i] = (segment[i] - segMean) * win[i];
  }

  fftRadix2(re, im);

  const halfN = nFft >> 1;
  const df = fs / nFft;
  const power = new Float64Array(halfN);
  for (let k = 0; k < halfN; k++) {
    power[k] = re[k] * re[k] + im[k] * im[k];
  }

  const kMin = Math.max(1, Math.ceil(0.7 / df));
  const kMax = Math.min(halfN - 2, Math.floor(4.0 / df));

  let peakBin = kMin;
  let maxPower = -1;
  let totalInBandPower = 0;

  for (let k = kMin; k <= kMax; k++) {
    const p = power[k];
    totalInBandPower += p;
    if (p > maxPower) {
      maxPower = p;
      peakBin = k;
    }
  }

  if (totalInBandPower <= 1e-12 || maxPower <= 0) {
    return {
      instantBpm: null,
      smoothedBpm: recentBpms.length > 0 ? median(recentBpms) : null,
      sqi: 0,
      sqiLabel: 'Poor',
      updatedHistory: recentBpms,
    };
  }

  // Parabolic interpolation around peakBin for sub-bin accuracy
  let refinedBin = peakBin;
  if (peakBin > kMin && peakBin < kMax) {
    const pLeft = power[peakBin - 1];
    const pCenter = power[peakBin];
    const pRight = power[peakBin + 1];
    const denom = pLeft - 2 * pCenter + pRight;
    if (Math.abs(denom) > 1e-12) {
      const delta = (0.5 * (pLeft - pRight)) / denom;
      if (Math.abs(delta) <= 0.5) {
        refinedBin = peakBin + delta;
      }
    }
  }

  const peakFreqHz = refinedBin * df;
  const instantBpm = peakFreqHz * 60;

  // SQI = fraction of in-band power within +/-0.15 Hz of peak and of its 2nd harmonic
  const harmonicFreqHz = 2 * peakFreqHz;
  let signalHarmonicPower = 0;
  for (let k = kMin; k <= kMax; k++) {
    const f = k * df;
    const nearFundamental = Math.abs(f - peakFreqHz) <= 0.15;
    const nearHarmonic = Math.abs(f - harmonicFreqHz) <= 0.15;
    if (nearFundamental || nearHarmonic) {
      signalHarmonicPower += power[k];
    }
  }

  const sqi = Math.max(0, Math.min(1, signalHarmonicPower / totalInBandPower));
  const sqiLabel = classifySqi(sqi);

  // Maintain rolling window of last 5 estimates and take median
  const updatedHistory = [...recentBpms, instantBpm].slice(-5);
  const smoothedBpm = median(updatedHistory);

  return {
    instantBpm,
    smoothedBpm,
    sqi,
    sqiLabel,
    updatedHistory,
  };
}

/**
 * Step 9: Beat peak detection and IBI calculation.
 * - Minimum distance: 60% of expected beat period (from BPM estimate).
 * - Minimum prominence: 0.25 * std(filteredPulse).
 * - Parabolic interpolation on each peak.
 * - Ignore first and last 1 s of the buffer.
 * - Reject IBIs outside 300-1500 ms or more than 25% from the median.
 */
export function detectBeatsAndIbi(
  filteredPulse: number[],
  timestampsMs: number[],
  fs: number,
  bpmEstimate: number | null
): {
  beats: DetectedBeat[];
  ibiSeries: IBIPoint[];
} {
  const n = filteredPulse.length;
  if (n < 10 || timestampsMs.length !== n) {
    return { beats: [], ibiSeries: [] };
  }

  const signalStd = std(filteredPulse);
  if (signalStd < 1e-8) {
    return { beats: [], ibiSeries: [] };
  }

  const effectiveBpm = bpmEstimate && bpmEstimate >= 42 && bpmEstimate <= 240 ? bpmEstimate : 75;
  const expectedPeriodSec = 60 / effectiveBpm;
  const minDistanceSamples = Math.max(3, Math.round(0.6 * expectedPeriodSec * fs));
  const minProminence = 0.25 * signalStd;
  const prominenceWindow = Math.max(minDistanceSamples, Math.round(expectedPeriodSec * fs * 1.25));

  const tStart = timestampsMs[0];
  const tEnd = timestampsMs[n - 1];

  interface CandidatePeak {
    idx: number;
    val: number;
    prominence: number;
  }

  const candidates: CandidatePeak[] = [];

  for (let i = 1; i < n - 1; i++) {
    const y = filteredPulse[i];
    if (y > filteredPulse[i - 1] && y >= filteredPulse[i + 1]) {
      // Compute prominence within local neighborhood or until a higher peak is reached
      let leftMin = y;
      const leftBound = Math.max(0, i - prominenceWindow);
      for (let l = i - 1; l >= leftBound; l--) {
        if (filteredPulse[l] > y) break;
        if (filteredPulse[l] < leftMin) leftMin = filteredPulse[l];
      }

      let rightMin = y;
      const rightBound = Math.min(n - 1, i + prominenceWindow);
      for (let r = i + 1; r <= rightBound; r++) {
        if (filteredPulse[r] > y) break;
        if (filteredPulse[r] < rightMin) rightMin = filteredPulse[r];
      }

      const referenceBase = Math.max(leftMin, rightMin);
      const prominence = y - referenceBase;
      if (prominence >= minProminence) {
        candidates.push({ idx: i, val: y, prominence });
      }
    }
  }

  // Enforce minimum distance by greedy selection ordered by peak height descending
  const sortedByHeight = [...candidates].sort((a, b) => b.val - a.val);
  const selectedIndices: CandidatePeak[] = [];

  for (const cand of sortedByHeight) {
    const tooClose = selectedIndices.some(
      (sel) => Math.abs(sel.idx - cand.idx) < minDistanceSamples
    );
    if (!tooClose) {
      selectedIndices.push(cand);
    }
  }

  // Sort chronologically
  selectedIndices.sort((a, b) => a.idx - b.idx);

  const dtMs = 1000 / fs;
  const beats: DetectedBeat[] = [];

  for (const peak of selectedIndices) {
    const k = peak.idx;
    const yLeft = filteredPulse[k - 1];
    const yCenter = filteredPulse[k];
    const yRight = filteredPulse[k + 1];

    // Parabolic refinement
    const denom = yLeft - 2 * yCenter + yRight;
    let delta = 0;
    let refinedAmp = yCenter;
    if (Math.abs(denom) > 1e-12) {
      delta = Math.max(-0.5, Math.min(0.5, (0.5 * (yLeft - yRight)) / denom));
      refinedAmp = yCenter - 0.25 * (yLeft - yRight) * delta;
    }

    const refinedIdx = k + delta;
    const refinedTimestamp = timestampsMs[k] + delta * dtMs;

    // Ignore the first 1 s and last 1 s of the buffer
    if (refinedTimestamp < tStart + 1000 || refinedTimestamp > tEnd - 1000) {
      continue;
    }

    beats.push({
      index: refinedIdx,
      timestamp: refinedTimestamp,
      amplitude: refinedAmp,
    });
  }

  // Compute raw consecutive IBIs and filter out [300, 1500] ms
  const rawIbis: IBIPoint[] = [];
  for (let i = 1; i < beats.length; i++) {
    const ibiMs = beats[i].timestamp - beats[i - 1].timestamp;
    if (ibiMs >= 300 && ibiMs <= 1500) {
      rawIbis.push({
        timestamp: beats[i].timestamp,
        relativeSec: (beats[i].timestamp - tStart) / 1000,
        ibiMs,
      });
    }
  }

  if (rawIbis.length === 0) {
    return { beats, ibiSeries: [] };
  }

  // Reject IBIs more than 25% from the median
  const medIbi = median(rawIbis.map((p) => p.ibiMs));
  const ibiSeries = rawIbis.filter(
    (p) => Math.abs(p.ibiMs - medIbi) <= 0.25 * medIbi
  );

  return { beats, ibiSeries };
}
