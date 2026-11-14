import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandpassFilterZeroPhase,
  detectBeatsAndIbi,
  detrendLinear,
  estimateHeartRateAndSqi,
  fftRadix2,
  resampleLinear,
  resampleRGBBuffer,
} from './dsp';
import {
  extractPulseCHROM,
  extractPulseGREEN,
  extractPulsePOS,
} from './rppg';
import { computeHRVMetrics } from './hrv';
import {
  generateSyntheticBuffer,
  runPulseLensPipeline,
} from './demoSignal';
import {
  computeROIBoxesFromLandmarks,
  extractMeanRGBFromROIs,
  isSkinPixelYCrCb,
  NormalizedLandmark,
} from './faceRoi';

test('DSP: linear detrend removes slope and offset cleanly', () => {
  const signal = Array.from({ length: 100 }, (_, i) => 50 + 0.75 * i);
  const detrended = detrendLinear(signal);
  for (const val of detrended) {
    assert.ok(Math.abs(val) < 1e-9, `Expected ~0, got ${val}`);
  }
});

test('DSP: radix-2 FFT accurately resolves a pure 1.2 Hz (72 BPM) sinusoid', () => {
  const fs = 32;
  const n = 512;
  const fTarget = 1.25; // exact bin at k = 1.25 * 512 / 32 = 20
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = Math.sin((2 * Math.PI * fTarget * i) / fs);
  }
  fftRadix2(re, im);

  let maxBin = 0;
  let maxMag = 0;
  for (let k = 1; k < n / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    if (mag > maxMag) {
      maxMag = mag;
      maxBin = k;
    }
  }
  assert.equal(maxBin, 20);
});

test('DSP: zero-phase 3rd-order Butterworth bandpass (0.7-4.0 Hz) attenuates DC/drift and high-freq noise while preserving 1.2 Hz', () => {
  const fs = 30;
  const n = 30 * 15; // 15 seconds
  const signal = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const slowDrift = 5.0 * Math.sin(2 * Math.PI * 0.1 * t); // 0.1 Hz out-of-band
    const pulse = 1.0 * Math.sin(2 * Math.PI * 1.2 * t); // 1.2 Hz in-band (72 BPM)
    const highFreq = 2.0 * Math.sin(2 * Math.PI * 9.0 * t); // 9.0 Hz out-of-band
    signal[i] = slowDrift + pulse + highFreq;
  }

  const filtered = bandpassFilterZeroPhase(signal, fs, 0.7, 4.0);
  const hr = estimateHeartRateAndSqi(filtered, fs, 15, []);
  assert.ok(hr.instantBpm !== null);
  assert.ok(
    Math.abs(hr.instantBpm! - 72) < 1.0,
    `Expected ~72 BPM, got ${hr.instantBpm}`
  );
  assert.ok(hr.sqi >= 0.7, `Expected high SQI >= 0.7, got ${hr.sqi}`);
  assert.equal(hr.sqiLabel, 'Good');
});

test('rPPG: POS, CHROM, and GREEN all estimate ~72 BPM with Good SQI on synthetic RGB buffer', () => {
  const buffer = generateSyntheticBuffer(50_000, 36, 30);
  const { r, g, b, fs } = resampleRGBBuffer(buffer);

  for (const [name, fn] of [
    ['POS', () => extractPulsePOS(r, g, b, fs)],
    ['CHROM', () => extractPulseCHROM(r, g, b, fs)],
    ['GREEN', () => extractPulseGREEN(g)],
  ] as const) {
    const rawPulse = fn();
    const filtered = bandpassFilterZeroPhase(rawPulse, fs, 0.7, 4.0);
    const est = estimateHeartRateAndSqi(filtered, fs, 15, []);
    assert.ok(est.smoothedBpm !== null, `${name} should return a BPM`);
    assert.ok(
      Math.abs(est.smoothedBpm! - 72) < 2.0,
      `${name} expected ~72 BPM, got ${est.smoothedBpm}`
    );
    assert.ok(
      est.sqi >= 0.5,
      `${name} expected Good SQI >= 0.5, got ${est.sqi}`
    );
  }
});

test('Beats & HRV: detects clean beats, computes SDNN/RMSSD/pNN50/SD1/SD2 after 30s, and gates LF/HF on 120s', () => {
  // 1) 36s buffer: HRV time-domain ready, LF/HF shows "needs 2+ min"
  const buffer36s = generateSyntheticBuffer(60_000, 36, 30);
  const { result: res36 } = runPulseLensPipeline(buffer36s, 'POS', 15, true, {
    POS: [],
    CHROM: [],
    GREEN: [],
  });

  assert.ok(res36.bpm !== null && Math.abs(res36.bpm - 72) < 2.0);
  assert.equal(res36.hrv.isReady, true, 'HRV should be ready at 36s');
  assert.ok(res36.hrv.cleanBeatCount >= 15);
  assert.ok(res36.hrv.meanIbi !== null && Math.abs(res36.hrv.meanIbi - 833.3) < 35);
  assert.ok(res36.hrv.sdnn !== null && res36.hrv.sdnn > 5);
  assert.ok(res36.hrv.rmssd !== null && res36.hrv.rmssd > 5);
  assert.ok(res36.hrv.sd1 !== null && res36.hrv.sd2 !== null);
  assert.equal(res36.hrv.lfHf, null, 'LF/HF must be null before 120s');
  assert.equal(res36.hrv.lfHfStatus, 'needs 2+ min');
  assert.ok(
    res36.hrv.respirationBpm !== null &&
      Math.abs(res36.hrv.respirationBpm - 15) < 3.5,
    `Expected ~15 breaths/min respiration rate, got ${res36.hrv.respirationBpm}`
  );

  // 2) 120s buffer: LF/HF becomes ready
  const buffer120s = generateSyntheticBuffer(150_000, 120, 30);
  const { result: res120 } = runPulseLensPipeline(buffer120s, 'POS', 15, false, {
    POS: [],
    CHROM: [],
    GREEN: [],
  });
  assert.equal(res120.hrv.lfHfStatus, 'ready');
  assert.ok(res120.hrv.lfHf !== null && res120.hrv.lfHf > 0);
});

test('Face ROI & Skin Filter: computes 3 ROI boxes from landmarks and applies YCrCb 40% fallback rule', () => {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
  }));
  landmarks[10] = { x: 0.5, y: 0.2 };
  landmarks[9] = { x: 0.5, y: 0.35 };
  landmarks[66] = { x: 0.4, y: 0.25 };
  landmarks[296] = { x: 0.6, y: 0.25 };
  landmarks[234] = { x: 0.3, y: 0.5 };
  landmarks[454] = { x: 0.7, y: 0.5 };
  landmarks[50] = { x: 0.36, y: 0.52 };
  landmarks[205] = { x: 0.4, y: 0.56 };
  landmarks[280] = { x: 0.64, y: 0.52 };
  landmarks[425] = { x: 0.6, y: 0.56 };

  const boxes = computeROIBoxesFromLandmarks(landmarks);
  assert.equal(boxes.length, 3);
  assert.equal(boxes[0].label, 'Forehead');
  assert.equal(boxes[1].label, 'Left Cheek');
  assert.equal(boxes[2].label, 'Right Cheek');

  // Verify YCrCb skin pixel check on warm skin color (195, 145, 120) vs blue background (30, 80, 200)
  assert.equal(isSkinPixelYCrCb(195, 145, 120), true);
  assert.equal(isSkinPixelYCrCb(30, 80, 200), false);

  // Test 40% threshold fallback in extractMeanRGBFromROIs
  const w = 10;
  const h = 10;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    // Only 20% skin pixels (< 40% threshold) -> should average ALL pixels
    if (i < 20) {
      rgba[i * 4] = 195;
      rgba[i * 4 + 1] = 145;
      rgba[i * 4 + 2] = 120;
    } else {
      rgba[i * 4] = 50;
      rgba[i * 4 + 1] = 100;
      rgba[i * 4 + 2] = 150;
    }
    rgba[i * 4 + 3] = 255;
  }

  const fullBox = [{ label: 'Forehead' as const, x: 0, y: 0, width: 1, height: 1 }];
  const resLowSkin = extractMeanRGBFromROIs(rgba, w, h, fullBox);
  assert.ok(Math.abs(resLowSkin.skinRatio - 0.2) < 1e-6);
  // All-pixel mean R = 0.2*195 + 0.8*50 = 39 + 40 = 79
  assert.ok(Math.abs(resLowSkin.r - 79) < 1e-6);
});

test('Report Generator: compiles reference range comparisons, valid PDF 1.4 document, standalone HTML, and Markdown', async () => {
  const {
    generateFullReportData,
    buildClinicalPdfBytes,
    buildStandaloneHtmlReport,
    buildMarkdownReport,
  } = await import('./reportGenerator');

  const buffer = generateSyntheticBuffer(80_000, 36, 30);
  const { result } = runPulseLensPipeline(buffer, 'POS', 15, true, {
    POS: [],
    CHROM: [],
    GREEN: [],
  });

  const report = generateFullReportData({
    isDemoMode: true,
    algorithm: 'POS',
    windowSec: 15,
    latestRGB: { r: 185.2, g: 141.6, b: 117.8, skinRatio: 0.94 },
    analysis: result,
    readingsLog: [
      {
        isoTime: '2026-11-10T05:30:00.000Z',
        elapsedSec: 36,
        algorithm: 'POS',
        bpm: 72.1,
        sqi: 0.96,
        sqiLabel: 'Good',
        sdnn: 27.5,
        rmssd: 30.8,
        pnn50: 4.2,
      },
    ],
  });

  assert.ok(report.reportId.startsWith('PL-'));
  assert.equal(report.comparisonList.length, 3);
  assert.equal(report.referenceComparisons.length, 9);
  const hrComparison = report.referenceComparisons.find((r) => r.id === 'bpm');
  assert.ok(hrComparison);
  assert.equal(hrComparison.normalRangeFormatted, '60.0 – 100.0 BPM');
  assert.equal(hrComparison.statusLabel, 'Normal Range');

  const pdfBytes = buildClinicalPdfBytes(report);
  const pdfText = new TextDecoder('latin1').decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4\n'), 'PDF must start with %PDF-1.4 header');
  assert.ok(pdfText.includes('CURRENT READING VS. NORMAL REFERENCE RANGE COMPARISON'));
  assert.ok(pdfText.includes('60.0 - 100.0 BPM'));
  assert.ok(pdfText.trimEnd().endsWith('%%EOF'), 'PDF must end with %%EOF');

  const html = buildStandaloneHtmlReport(report);
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes(report.reportId));
  assert.ok(html.includes('Current Reading vs. Normal Reference Range Comparison'));
  assert.ok(html.includes('<svg'));

  const md = buildMarkdownReport(report);
  assert.ok(md.includes('# PulseLens — Contactless Vital-Signs & HRV Report'));
  assert.ok(md.includes('## 1. Current Reading vs. Normal Reference Range Comparison'));
});

test('Face Biometrics: estimates live facial expressions and approximate age from landmarks, blendshapes, and Demo presets', async () => {
  const {
    analyzeFaceBiometricsFromLandmarks,
    classifyExpressionFromMetrics,
    generateDemoFaceBiometrics,
  } = await import('./faceAttributes');

  // Verify Demo Mode presets
  const demoSmile = generateDemoFaceBiometrics(10_000, 'Happy / Smiling');
  assert.equal(demoSmile.isTracking, true);
  assert.equal(demoSmile.expression, 'Happy / Smiling');
  assert.equal(demoSmile.estimatedAge, 28);
  assert.equal(demoSmile.ageRange, '25 – 31 yrs');
  assert.ok(demoSmile.metrics.smileScore >= 65);

  const demoSurprise = generateDemoFaceBiometrics(10_000, 'Surprised / Alert');
  assert.equal(demoSurprise.expression, 'Surprised / Alert');
  assert.ok(demoSurprise.metrics.browLiftScore >= 70);

  // Verify landmark + blendshape analysis
  const landmarks: NormalizedLandmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
  }));
  landmarks[10] = { x: 0.5, y: 0.2 };
  landmarks[152] = { x: 0.5, y: 0.78 };
  landmarks[234] = { x: 0.29, y: 0.5 };
  landmarks[454] = { x: 0.71, y: 0.5 };
  landmarks[9] = { x: 0.5, y: 0.34 };
  landmarks[2] = { x: 0.5, y: 0.54 };
  landmarks[61] = { x: 0.41, y: 0.63 };
  landmarks[291] = { x: 0.59, y: 0.63 };
  landmarks[13] = { x: 0.5, y: 0.65 };
  landmarks[14] = { x: 0.5, y: 0.66 };
  landmarks[33] = { x: 0.37, y: 0.4 };
  landmarks[133] = { x: 0.45, y: 0.4 };
  landmarks[159] = { x: 0.41, y: 0.385 };
  landmarks[145] = { x: 0.41, y: 0.415 };
  landmarks[362] = { x: 0.55, y: 0.4 };
  landmarks[263] = { x: 0.63, y: 0.4 };
  landmarks[386] = { x: 0.59, y: 0.385 };
  landmarks[374] = { x: 0.59, y: 0.415 };
  landmarks[66] = { x: 0.41, y: 0.33 };
  landmarks[296] = { x: 0.59, y: 0.33 };

  const { biometrics, updatedAgeHistory } = analyzeFaceBiometricsFromLandmarks(
    landmarks,
    [
      { categoryName: 'mouthSmileLeft', score: 0.85 },
      { categoryName: 'mouthSmileRight', score: 0.82 },
    ],
    8.5,
    0.92,
    []
  );

  assert.equal(biometrics.isTracking, true);
  assert.equal(biometrics.expression, 'Happy / Smiling');
  assert.ok(
    biometrics.estimatedAge !== null &&
      biometrics.estimatedAge >= 18 &&
      biometrics.estimatedAge <= 76
  );
  assert.equal(updatedAgeHistory.length, 1);

  const speakingClass = classifyExpressionFromMetrics({
    smileScore: 20,
    browLiftScore: 45,
    eyeOpennessScore: 65,
    jawActivityScore: 68,
    symmetryScore: 92,
  });
  assert.equal(speakingClass.expression, 'Speaking / Active');
});



