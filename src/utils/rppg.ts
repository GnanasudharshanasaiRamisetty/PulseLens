import { RppgAlgorithm } from '../types/rppg';
import { detrendLinear, hannWindow, mean, normalizeZeroMeanUnitStd, std } from './dsp';

/**
 * Computes Pearson correlation sign between two equal-length signals.
 */
function correlatesNegatively(sigA: number[], sigB: number[]): boolean {
  const n = Math.min(sigA.length, sigB.length);
  if (n < 2) return false;
  let dot = 0;
  for (let i = 0; i < n; i++) {
    dot += sigA[i] * sigB[i];
  }
  return dot < 0;
}

/**
 * Computes normalized inverted green channel (-G) as baseline and polarity reference.
 */
export function extractPulseGREEN(g: number[]): number[] {
  const n = g.length;
  if (n === 0) return [];
  const invG = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    invG[i] = -g[i];
  }
  return normalizeZeroMeanUnitStd(detrendLinear(invG));
}

/**
 * Step 6a: POS (Plane-Orthogonal-to-Skin) algorithm (Wang et al., 2017).
 * - 1.6 s sliding window with step of 1 sample
 * - Normalise each channel by its window mean
 * - S1 = G - B
 * - S2 = -2R + G + B
 * - h = S1 + (std(S1) / std(S2)) * S2
 * - Subtract window mean of h
 * - Overlap-add all windows
 * - Normalise to zero mean, unit std, and flip sign if negatively correlated with inverted green
 */
export function extractPulsePOS(r: number[], g: number[], b: number[], fs: number): number[] {
  const n = r.length;
  if (n === 0) return [];
  const winLen = Math.max(4, Math.min(n, Math.round(1.6 * fs)));
  if (n < winLen) {
    return extractPulseGREEN(g);
  }

  const H = new Float64Array(n);
  const s1 = new Float64Array(winLen);
  const s2 = new Float64Array(winLen);

  for (let start = 0; start <= n - winLen; start++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < winLen; i++) {
      sumR += r[start + i];
      sumG += g[start + i];
      sumB += b[start + i];
    }
    const meanR = Math.max(1e-6, sumR / winLen);
    const meanG = Math.max(1e-6, sumG / winLen);
    const meanB = Math.max(1e-6, sumB / winLen);

    for (let i = 0; i < winLen; i++) {
      const rn = r[start + i] / meanR;
      const gn = g[start + i] / meanG;
      const bn = b[start + i] / meanB;
      s1[i] = gn - bn;
      s2[i] = -2 * rn + gn + bn;
    }

    const std1 = std(s1);
    const std2 = std(s2);
    const alpha = std2 > 1e-8 ? std1 / std2 : 0;

    let sumH = 0;
    for (let i = 0; i < winLen; i++) {
      sumH += s1[i] + alpha * s2[i];
    }
    const meanH = sumH / winLen;

    for (let i = 0; i < winLen; i++) {
      H[start + i] += s1[i] + alpha * s2[i] - meanH;
    }
  }

  const out = normalizeZeroMeanUnitStd(Array.from(H));
  const invGreenRef = extractPulseGREEN(g);
  if (correlatesNegatively(out, invGreenRef)) {
    for (let i = 0; i < out.length; i++) out[i] = -out[i];
  }
  return out;
}

/**
 * Step 6b: CHROM (Chrominance-based rPPG) algorithm (de Haan & Jeanne, 2013).
 * - 1.6 s sliding window with step of 1 sample
 * - Normalise each channel by its window mean
 * - Xs = 3R - 2G, Ys = 1.5R + G - 1.5B on normalised windows
 * - alpha = std(Xs) / std(Ys)
 * - S = Xs - alpha * Ys
 * - Hann-weighted overlap-add
 * - Normalise to zero mean, unit std, and flip sign if negatively correlated with inverted green
 */
export function extractPulseCHROM(r: number[], g: number[], b: number[], fs: number): number[] {
  const n = r.length;
  if (n === 0) return [];
  const winLen = Math.max(4, Math.min(n, Math.round(1.6 * fs)));
  if (n < winLen) {
    return extractPulseGREEN(g);
  }

  const H = new Float64Array(n);
  const xs = new Float64Array(winLen);
  const ys = new Float64Array(winLen);
  const hann = hannWindow(winLen);

  for (let start = 0; start <= n - winLen; start++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < winLen; i++) {
      sumR += r[start + i];
      sumG += g[start + i];
      sumB += b[start + i];
    }
    const meanR = Math.max(1e-6, sumR / winLen);
    const meanG = Math.max(1e-6, sumG / winLen);
    const meanB = Math.max(1e-6, sumB / winLen);

    for (let i = 0; i < winLen; i++) {
      const rn = r[start + i] / meanR - 1;
      const gn = g[start + i] / meanG - 1;
      const bn = b[start + i] / meanB - 1;
      xs[i] = 3 * rn - 2 * gn;
      ys[i] = 1.5 * rn + gn - 1.5 * bn;
    }

    const stdX = std(xs);
    const stdY = std(ys);
    const alpha = stdY > 1e-8 ? stdX / stdY : 0;

    let sumS = 0;
    for (let i = 0; i < winLen; i++) {
      sumS += xs[i] - alpha * ys[i];
    }
    const meanS = sumS / winLen;

    for (let i = 0; i < winLen; i++) {
      const sVal = xs[i] - alpha * ys[i] - meanS;
      H[start + i] += sVal * hann[i];
    }
  }

  const out = normalizeZeroMeanUnitStd(Array.from(H));
  const invGreenRef = extractPulseGREEN(g);
  if (correlatesNegatively(out, invGreenRef)) {
    for (let i = 0; i < out.length; i++) out[i] = -out[i];
  }
  return out;
}

/**
 * Dispatches raw RGB channels to the selected rPPG algorithm (POS, CHROM, or GREEN).
 */
export function extractPulseSignal(
  r: number[],
  g: number[],
  b: number[],
  fs: number,
  algorithm: RppgAlgorithm
): number[] {
  switch (algorithm) {
    case 'POS':
      return extractPulsePOS(r, g, b, fs);
    case 'CHROM':
      return extractPulseCHROM(r, g, b, fs);
    case 'GREEN':
      return extractPulseGREEN(g);
  }
}
