import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DemoExpressionPreset,
  FaceBiometricsResult,
  PipelineAnalysisResult,
  ReadingLogEntry,
  RGBSample,
  ROIBox,
  RppgAlgorithm,
  TrackingStatus,
} from '../types/rppg';
import {
  generateSyntheticBuffer,
  generateSyntheticRGBSample,
  runPulseLensPipeline,
} from '../utils/demoSignal';
import {
  analyzeFaceBiometricsFromLandmarks,
  createIdleFaceBiometrics,
  generateDemoFaceBiometrics,
} from '../utils/faceAttributes';
import {
  computeROIBoxesFromLandmarks,
  extractMeanRGBFromROIs,
  FaceLandmarkerInstance,
  getOrLoadFaceLandmarker,
} from '../utils/faceRoi';

const MAX_BUFFER_DURATION_MS = 120_000; // 120 seconds rolling buffer
const FACE_LOST_CLEAR_MS = 1_000; // Clear buffer if face lost > 1 s
const ANALYSIS_INTERVAL_MS = 1_000; // Run DSP analysis ~once per second
const BIOMETRICS_UPDATE_MS = 180; // Update live expression & age UI ~5-6 times/sec

const DEFAULT_DEMO_ROIS: ROIBox[] = [
  { label: 'Forehead', x: 0.36, y: 0.2, width: 0.28, height: 0.11 },
  { label: 'Left Cheek', x: 0.31, y: 0.48, width: 0.11, height: 0.09 },
  { label: 'Right Cheek', x: 0.58, y: 0.48, width: 0.11, height: 0.09 },
];

function createEmptyAnalysisResult(): PipelineAnalysisResult {
  return {
    timestamp: 0,
    bufferDurationSec: 0,
    measuredFps: 30,
    sampleCount: 0,
    bpm: null,
    instantBpm: null,
    sqi: 0,
    sqiLabel: 'Poor',
    waveformTimestamps: [],
    waveformValues: [],
    waveformBeats: [],
    ibiSeries: [],
    hrv: {
      isReady: false,
      reason: 'Waiting for optical signal...',
      cleanBeatCount: 0,
      durationSec: 0,
      meanIbi: null,
      sdnn: null,
      rmssd: null,
      pnn50: null,
      sd1: null,
      sd2: null,
      lfHf: null,
      lfHfStatus: 'needs 2+ min',
      respirationBpm: null,
    },
  };
}

export function usePulseMonitor() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [modelDelegate, setModelDelegate] = useState<'GPU' | 'CPU' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [algorithm, setAlgorithm] = useState<RppgAlgorithm>('POS');
  const [windowSec, setWindowSec] = useState<number>(15);
  const [compareAll, setCompareAll] = useState<boolean>(false);

  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [roiBoxes, setRoiBoxes] = useState<ROIBox[]>([]);
  const [latestRGB, setLatestRGB] = useState<{
    r: number;
    g: number;
    b: number;
    skinRatio: number;
  } | null>(null);

  const [faceBiometrics, setFaceBiometrics] = useState<FaceBiometricsResult>(
    createIdleFaceBiometrics
  );
  const [demoExpressionPreset, setDemoExpressionPreset] =
    useState<DemoExpressionPreset>('Auto');

  const [analysis, setAnalysis] = useState<PipelineAnalysisResult>(
    createEmptyAnalysisResult
  );
  const [readingsLog, setReadingsLog] = useState<ReadingLogEntry[]>([]);

  // Refs for real-time loop
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const rawBufferRef = useRef<RGBSample[]>([]);
  const lastFaceSeenMsRef = useRef<number | null>(null);
  const lastAnalysisMsRef = useRef<number>(0);
  const lastBiometricsMsRef = useRef<number>(0);
  const ageHistoryRef = useRef<number[]>([]);
  const demoPresetRef = useRef<DemoExpressionPreset>(demoExpressionPreset);
  const latestBiometricsRef = useRef<FaceBiometricsResult>(faceBiometrics);
  const lastBoxesRef = useRef<ROIBox[]>(DEFAULT_DEMO_ROIS);
  const sessionStartMsRef = useRef<number>(0);

  useEffect(() => {
    demoPresetRef.current = demoExpressionPreset;
    if (isDemoMode) {
      const updated = generateDemoFaceBiometrics(
        performance.now(),
        demoExpressionPreset
      );
      latestBiometricsRef.current = updated;
      setFaceBiometrics(updated);
    }
  }, [demoExpressionPreset, isDemoMode]);

  const bpmHistoryRef = useRef<Record<RppgAlgorithm, number[]>>({
    POS: [],
    CHROM: [],
    GREEN: [],
  });

  // Keep reactive settings accessible inside rAF / Worker without restarting camera
  const settingsRef = useRef({
    algorithm,
    windowSec,
    compareAll,
  });
  useEffect(() => {
    settingsRef.current = { algorithm, windowSec, compareAll };
  }, [algorithm, windowSec, compareAll]);

  // Initialize Web Worker for off-thread DSP analysis (with main-thread fallback)
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/rppgWorker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = (e) => {
        if (e.data && e.data.type === 'ANALYSIS_RESULT') {
          const res: PipelineAnalysisResult = e.data.result;
          bpmHistoryRef.current = e.data.updatedBpmHistory;
          setAnalysis(res);
          if (res.bpm !== null) {
            const validBpm = Number(res.bpm.toFixed(1));
            setReadingsLog((prev) => [
              ...prev.slice(-719), // keep up to 720 entries
              {
                isoTime: new Date().toISOString(),
                elapsedSec: Math.round(res.bufferDurationSec),
                algorithm: settingsRef.current.algorithm,
                bpm: validBpm,
                sqi: Number(res.sqi.toFixed(2)),
                sqiLabel: res.sqiLabel,
                sdnn: res.hrv.sdnn !== null ? Number(res.hrv.sdnn.toFixed(1)) : null,
                rmssd: res.hrv.rmssd !== null ? Number(res.hrv.rmssd.toFixed(1)) : null,
                pnn50: res.hrv.pnn50 !== null ? Number(res.hrv.pnn50.toFixed(1)) : null,
              },
            ]);
          }
        }
      };
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }
  }, []);

  const triggerAnalysisNow = useCallback(
    (overrideAlgo?: RppgAlgorithm, overrideWinSec?: number, overrideCompare?: boolean) => {
      const buf = rawBufferRef.current;
      const algo = overrideAlgo ?? settingsRef.current.algorithm;
      const winSec = overrideWinSec ?? settingsRef.current.windowSec;
      const comp = overrideCompare ?? settingsRef.current.compareAll;

      if (buf.length < 15) {
        setAnalysis(createEmptyAnalysisResult());
        return;
      }

      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'ANALYZE',
          requestId: Date.now(),
          rawBuffer: buf,
          algorithm: algo,
          windowSec: winSec,
          compareAll: comp,
          bpmHistoryByAlgo: bpmHistoryRef.current,
        });
      } else {
        const { result, updatedBpmHistory } = runPulseLensPipeline(
          buf,
          algo,
          winSec,
          comp,
          bpmHistoryRef.current
        );
        bpmHistoryRef.current = updatedBpmHistory;
        setAnalysis(result);
        if (result.bpm !== null) {
          const validBpm = Number(result.bpm.toFixed(1));
          setReadingsLog((prev) => [
            ...prev.slice(-719),
            {
              isoTime: new Date().toISOString(),
              elapsedSec: Math.round(result.bufferDurationSec),
              algorithm: algo,
              bpm: validBpm,
              sqi: Number(result.sqi.toFixed(2)),
              sqiLabel: result.sqiLabel,
              sdnn:
                result.hrv.sdnn !== null
                  ? Number(result.hrv.sdnn.toFixed(1))
                  : null,
              rmssd:
                result.hrv.rmssd !== null
                  ? Number(result.hrv.rmssd.toFixed(1))
                  : null,
              pnn50:
                result.hrv.pnn50 !== null
                  ? Number(result.hrv.pnn50.toFixed(1))
                  : null,
            },
          ]);
        }
      }
    },
    []
  );

  // Immediately re-evaluate when user changes algorithm, BPM window, or Compare toggle
  useEffect(() => {
    if (rawBufferRef.current.length >= 15) {
      triggerAnalysisNow(algorithm, windowSec, compareAll);
    }
  }, [algorithm, windowSec, compareAll, triggerAnalysisNow]);

  /**
   * Draws the mirrored video or synthetic Demo avatar along with ROI boxes
   * (green when tracking, red when face is lost) and live facial expression geometry.
   */
  const drawPreviewOverlay = useCallback(
    (
      isTrackingFace: boolean,
      boxes: ROIBox[],
      demoMode: boolean,
      sample?: RGBSample,
      biometrics?: FaceBiometricsResult
    ) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bio = biometrics ?? latestBiometricsRef.current;

      if (demoMode) {
        const isDark = document.documentElement.classList.contains('dark');
        // Render clean synthetic optical phantom preview in new Obsidian-Plum dark palette
        ctx.fillStyle = isDark ? '#14111D' : '#F1F5F9';
        ctx.fillRect(0, 0, w, h);

        // Subtle optical calibration grid
        ctx.strokeStyle = isDark
          ? 'rgba(139, 92, 246, 0.14)'
          : 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 40) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
          ctx.stroke();
        }
        for (let gy = 0; gy < h; gy += 40) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
          ctx.stroke();
        }

        // Draw stylized face silhouette modulated by synthetic RGB skin reflectance
        const r = sample ? Math.round(sample.r) : 186;
        const g = sample ? Math.round(sample.g) : 142;
        const b = sample ? Math.round(sample.b) : 118;

        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);

        // Head contour
        ctx.fillStyle = isDark
          ? `rgba(${r}, ${g}, ${b}, 0.24)`
          : `rgba(${r}, ${g}, ${b}, 0.35)`;
        ctx.strokeStyle = isDark
          ? `rgba(${r}, ${g}, ${b}, 0.72)`
          : `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}, 0.85)`;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.46, w * 0.21, h * 0.33, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw expressive synthetic facial features (eyebrows, eyes, mouth) driven by live biometrics
        const browLiftOffset = ((bio.metrics.browLiftScore - 45) / 100) * 14;
        const eyeOpenRadiusY = Math.max(
          1.5,
          (bio.metrics.eyeOpennessScore / 100) * 7.5
        );
        const smileCurve = ((bio.metrics.smileScore - 20) / 100) * 18;
        const jawOpen = (bio.metrics.jawActivityScore / 100) * 12;

        ctx.strokeStyle = isDark
          ? 'rgba(233, 213, 255, 0.75)'
          : 'rgba(51, 65, 85, 0.75)';
        ctx.lineWidth = 2;

        // Eyebrows
        ctx.beginPath();
        ctx.moveTo(w * 0.38, h * 0.37 - browLiftOffset * 0.5);
        ctx.quadraticCurveTo(
          w * 0.42,
          h * 0.34 - browLiftOffset,
          w * 0.46,
          h * 0.36 - browLiftOffset * 0.5
        );
        ctx.moveTo(w * 0.54, h * 0.36 - browLiftOffset * 0.5);
        ctx.quadraticCurveTo(
          w * 0.58,
          h * 0.34 - browLiftOffset,
          w * 0.62,
          h * 0.37 - browLiftOffset * 0.5
        );
        ctx.stroke();

        // Eyes
        ctx.beginPath();
        ctx.ellipse(w * 0.42, h * 0.4, 11, eyeOpenRadiusY, 0, 0, Math.PI * 2);
        ctx.ellipse(w * 0.58, h * 0.4, 11, eyeOpenRadiusY, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Mouth contour (animated by smileScore & jawActivityScore)
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h * 0.62 - smileCurve * 0.35);
        ctx.quadraticCurveTo(
          w * 0.5,
          h * 0.62 + smileCurve + jawOpen * 0.5,
          w * 0.57,
          h * 0.62 - smileCurve * 0.35
        );
        if (jawOpen > 2.5) {
          ctx.quadraticCurveTo(
            w * 0.5,
            h * 0.62 - jawOpen * 0.35,
            w * 0.43,
            h * 0.62 - smileCurve * 0.35
          );
        }
        ctx.stroke();

        const roiStroke = isDark ? '#C084FC' : '#7C3AED';

        // Draw ROI boxes in mirrored space
        for (const box of boxes) {
          const bx = box.x * w;
          const by = box.y * h;
          const bw = box.width * w;
          const bh = box.height * h;

          ctx.fillStyle = isDark
            ? `rgba(${r}, ${g}, ${b}, 0.45)`
            : `rgba(${r}, ${g}, ${b}, 0.55)`;
          ctx.fillRect(bx, by, bw, bh);

          ctx.strokeStyle = roiStroke;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);
        }
        ctx.restore();

        // Draw un-mirrored ROI labels
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = roiStroke;
        for (const box of boxes) {
          const mirroredX = (1 - (box.x + box.width)) * w;
          const by = box.y * h;
          ctx.fillText(box.label, mirroredX, Math.max(14, by - 6));
        }
        return;
      }

      // Live Camera mode: draw mirrored video frame
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);

        // Draw ROI boxes on mirrored video (green when tracking, red when lost)
        const strokeColor = isTrackingFace ? '#10B981' : '#F43F5E';
        const fillColor = isTrackingFace
          ? 'rgba(16, 185, 129, 0.14)'
          : 'rgba(244, 63, 94, 0.14)';

        for (const box of boxes) {
          const bx = box.x * w;
          const by = box.y * h;
          const bw = box.width * w;
          const bh = box.height * h;

          ctx.fillStyle = fillColor;
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);
        }
        ctx.restore();

        // Draw readable labels on top of mirrored boxes
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = isTrackingFace ? '#34D399' : '#FB7185';
        for (const box of boxes) {
          const mirroredX = (1 - (box.x + box.width)) * w;
          const by = box.y * h;
          ctx.fillText(box.label, mirroredX, Math.max(14, by - 5));
        }
      }
    },
    []
  );

  const stopAllStreams = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsDemoMode(false);
    setFaceDetected(false);
    setTrackingStatus('idle');
    const idleBio = createIdleFaceBiometrics();
    latestBiometricsRef.current = idleBio;
    setFaceBiometrics(idleBio);
  }, []);

  const resetReadings = useCallback(() => {
    rawBufferRef.current = [];
    bpmHistoryRef.current = { POS: [], CHROM: [], GREEN: [] };
    ageHistoryRef.current = [];
    lastAnalysisMsRef.current = 0;
    setAnalysis(createEmptyAnalysisResult());
    setReadingsLog([]);
    setLatestRGB(null);

    if (isDemoMode) {
      // Re-seed Demo Mode with 36s of synthetic signal so 72 BPM is immediately verifiable
      const now = performance.now();
      rawBufferRef.current = generateSyntheticBuffer(now, 36, 30);
      const last = rawBufferRef.current[rawBufferRef.current.length - 1];
      setLatestRGB({
        r: last.r,
        g: last.g,
        b: last.b,
        skinRatio: last.skinRatio ?? 0.94,
      });
      const demoBio = generateDemoFaceBiometrics(now, demoPresetRef.current);
      latestBiometricsRef.current = demoBio;
      setFaceBiometrics(demoBio);
      triggerAnalysisNow();
    } else {
      const idleBio = createIdleFaceBiometrics();
      latestBiometricsRef.current = idleBio;
      setFaceBiometrics(idleBio);
    }
  }, [isDemoMode, triggerAnalysisNow]);

  /**
   * Starts Demo Mode: runs the exact same rPPG pipeline on a synthetic 72 BPM RGB signal
   * with breathing modulation and slow ambient lighting drift.
   */
  const startDemoMode = useCallback(
    (initialDurationSec = 36) => {
      stopAllStreams();
      setErrorMessage(null);
      setIsDemoMode(true);
      setFaceDetected(true);
      setRoiBoxes(DEFAULT_DEMO_ROIS);
      setTrackingStatus('demo');

      const now = performance.now();
      sessionStartMsRef.current = now;
      bpmHistoryRef.current = { POS: [], CHROM: [], GREEN: [] };

      // Pre-populate synthetic buffer so 72 BPM & HRV are immediately live, then stream at 30 fps
      const initialBuffer = generateSyntheticBuffer(now, initialDurationSec, 30);
      rawBufferRef.current = initialBuffer;
      const latest = initialBuffer[initialBuffer.length - 1];
      setLatestRGB({
        r: latest.r,
        g: latest.g,
        b: latest.b,
        skinRatio: latest.skinRatio ?? 0.94,
      });

      const initialBio = generateDemoFaceBiometrics(now, demoPresetRef.current);
      latestBiometricsRef.current = initialBio;
      setFaceBiometrics(initialBio);

      drawPreviewOverlay(true, DEFAULT_DEMO_ROIS, true, latest, initialBio);
      triggerAnalysisNow();
      lastAnalysisMsRef.current = now;
      lastBiometricsMsRef.current = now;

      let lastFrameTime = now;
      const frameInterval = 1000 / 30; // 30 fps

      const demoLoop = () => {
        const currentNow = performance.now();
        if (currentNow - lastFrameTime >= frameInterval) {
          lastFrameTime = currentNow;
          const sample = generateSyntheticRGBSample(currentNow);
          const buf = rawBufferRef.current;
          buf.push(sample);

          // Keep rolling 120 s buffer
          const cutoff = currentNow - MAX_BUFFER_DURATION_MS;
          while (buf.length > 0 && buf[0].timestamp < cutoff) {
            buf.shift();
          }

          setLatestRGB({
            r: sample.r,
            g: sample.g,
            b: sample.b,
            skinRatio: sample.skinRatio ?? 0.94,
          });

          if (currentNow - lastBiometricsMsRef.current >= BIOMETRICS_UPDATE_MS) {
            lastBiometricsMsRef.current = currentNow;
            const updatedBio = generateDemoFaceBiometrics(
              currentNow,
              demoPresetRef.current
            );
            latestBiometricsRef.current = updatedBio;
            setFaceBiometrics(updatedBio);
          }

          drawPreviewOverlay(
            true,
            DEFAULT_DEMO_ROIS,
            true,
            sample,
            latestBiometricsRef.current
          );

          if (currentNow - lastAnalysisMsRef.current >= ANALYSIS_INTERVAL_MS) {
            lastAnalysisMsRef.current = currentNow;
            triggerAnalysisNow();
          }
        }
        rafIdRef.current = requestAnimationFrame(demoLoop);
      };

      rafIdRef.current = requestAnimationFrame(demoLoop);
    },
    [drawPreviewOverlay, stopAllStreams, triggerAnalysisNow]
  );

  /**
   * Fast-forwards Demo Mode buffer to full 120 seconds so LF/HF frequency-domain HRV
   * can be verified immediately without waiting 2 minutes.
   */
  const fillDemo2MinBuffer = useCallback(() => {
    if (!isDemoMode) {
      startDemoMode(122);
      return;
    }
    const now = performance.now();
    rawBufferRef.current = generateSyntheticBuffer(now, 122, 30);
    triggerAnalysisNow();
  }, [isDemoMode, startDemoMode, triggerAnalysisNow]);

  /**
   * Starts real webcam capture (640x480 @ 30fps, front camera) and MediaPipe FaceLandmarker.
   */
  const startCamera = useCallback(async () => {
    stopAllStreams();
    setErrorMessage(null);
    setIsLoadingModel(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsLoadingModel(false);
      setErrorMessage(
        'Webcam API (navigator.mediaDevices.getUserMedia) is unavailable in this browser context. Use Demo Mode to run the rPPG pipeline.'
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (err: any) {
      setIsLoadingModel(false);
      const name = err?.name || '';
      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        name === 'SecurityError'
      ) {
        setErrorMessage(
          'Camera permission denied. Please allow camera access in your browser settings, or click "Demo Mode" to run the pipeline on a synthetic 72 BPM signal.'
        );
      } else if (
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError' ||
        name === 'OverconstrainedError'
      ) {
        setErrorMessage(
          'No compatible front camera found on this device. Click "Demo Mode" to verify the 72 BPM rPPG pipeline.'
        );
      } else {
        setErrorMessage(
          `Unable to access webcam (${err?.message || 'Camera error'}). Click "Demo Mode" to test the pipeline.`
        );
      }
      return;
    }

    streamRef.current = stream;

    // Load MediaPipe FaceLandmarker (GPU delegate with CPU fallback)
    try {
      const { landmarker, delegate } = await getOrLoadFaceLandmarker();
      landmarkerRef.current = landmarker;
      setModelDelegate(delegate);
    } catch (err: any) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsLoadingModel(false);
      setErrorMessage(
        `FaceLandmarker model failed to load (${err?.message || 'CDN error'}). Please check your connection or use Demo Mode.`
      );
      return;
    }

    setIsLoadingModel(false);

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Ignore play interruption
    }

    // Create small hidden canvas (160x120) for fast pixel extraction
    if (!hiddenCanvasRef.current) {
      const hc = document.createElement('canvas');
      hc.width = 160;
      hc.height = 120;
      hiddenCanvasRef.current = hc;
    }

    rawBufferRef.current = [];
    bpmHistoryRef.current = { POS: [], CHROM: [], GREEN: [] };
    ageHistoryRef.current = [];
    lastFaceSeenMsRef.current = null;
    lastAnalysisMsRef.current = performance.now();
    lastBiometricsMsRef.current = 0;
    setIsCameraActive(true);
    setTrackingStatus('no_face');

    let lastVideoTime = -1;

    const processVideoFrame = () => {
      const v = videoRef.current;
      const lm = landmarkerRef.current;
      const hc = hiddenCanvasRef.current;

      if (!v || !lm || !hc || !streamRef.current) return;

      const nowMs = performance.now();

      if (v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;

        let detectionResult: {
          faceLandmarks?: any[][];
          faceBlendshapes?: Array<{ categories: any[] }>;
        } = {};
        try {
          detectionResult = lm.detectForVideo(v, nowMs);
        } catch {
          detectionResult = {};
        }

        const faces = detectionResult.faceLandmarks;
        if (faces && faces.length > 0 && faces[0].length >= 455) {
          lastFaceSeenMsRef.current = nowMs;
          setFaceDetected(true);

          const boxes = computeROIBoxesFromLandmarks(faces[0]);
          lastBoxesRef.current = boxes;
          setRoiBoxes(boxes);

          // Step 4: Draw video to small hidden canvas and read pixels in ROI boxes
          const hCtx = hc.getContext('2d', { willReadFrequently: true });
          let currentLumStd = 9.5;
          let currentSkinRatio = 0.9;
          if (hCtx) {
            hCtx.drawImage(v, 0, 0, hc.width, hc.height);
            const imgData = hCtx.getImageData(0, 0, hc.width, hc.height);
            const { r, g, b, skinRatio, skinLuminanceStd } =
              extractMeanRGBFromROIs(
                imgData.data,
                hc.width,
                hc.height,
                boxes
              );
            currentLumStd = skinLuminanceStd;
            currentSkinRatio = skinRatio;

            const sample: RGBSample = {
              timestamp: nowMs,
              r,
              g,
              b,
              skinRatio,
            };
            const buf = rawBufferRef.current;
            buf.push(sample);

            // Maintain rolling 120 s buffer
            const cutoff = nowMs - MAX_BUFFER_DURATION_MS;
            while (buf.length > 0 && buf[0].timestamp < cutoff) {
              buf.shift();
            }

            const durSec =
              buf.length >= 2
                ? (buf[buf.length - 1].timestamp - buf[0].timestamp) / 1000
                : 0;
            setTrackingStatus(durSec < 8 ? 'collecting' : 'tracking');
            setLatestRGB({ r, g, b, skinRatio });
          }

          // Live Facial Expression & Approximate Age update (~5-6 Hz)
          if (nowMs - lastBiometricsMsRef.current >= BIOMETRICS_UPDATE_MS) {
            lastBiometricsMsRef.current = nowMs;
            const blendshapeCategories =
              detectionResult.faceBlendshapes?.[0]?.categories;
            const { biometrics, updatedAgeHistory } =
              analyzeFaceBiometricsFromLandmarks(
                faces[0],
                blendshapeCategories,
                currentLumStd,
                currentSkinRatio,
                ageHistoryRef.current
              );
            ageHistoryRef.current = updatedAgeHistory;
            latestBiometricsRef.current = biometrics;
            setFaceBiometrics(biometrics);
          }

          drawPreviewOverlay(true, boxes, false);
        } else {
          // Face lost
          setFaceDetected(false);
          setTrackingStatus('no_face');
          drawPreviewOverlay(false, lastBoxesRef.current, false);

          // Step 4: If the face is lost for more than 1 s, clear the buffer
          if (
            lastFaceSeenMsRef.current !== null &&
            nowMs - lastFaceSeenMsRef.current > FACE_LOST_CLEAR_MS
          ) {
            if (rawBufferRef.current.length > 0) {
              rawBufferRef.current = [];
              bpmHistoryRef.current = { POS: [], CHROM: [], GREEN: [] };
              ageHistoryRef.current = [];
              setAnalysis(createEmptyAnalysisResult());
              setLatestRGB(null);
              const idleBio = createIdleFaceBiometrics();
              latestBiometricsRef.current = idleBio;
              setFaceBiometrics(idleBio);
            }
          }
        }

        // Run DSP analysis ~once per second
        if (nowMs - lastAnalysisMsRef.current >= ANALYSIS_INTERVAL_MS) {
          lastAnalysisMsRef.current = nowMs;
          triggerAnalysisNow();
        }
      }

      rafIdRef.current = requestAnimationFrame(processVideoFrame);
    };

    rafIdRef.current = requestAnimationFrame(processVideoFrame);
  }, [drawPreviewOverlay, stopAllStreams, triggerAnalysisNow]);

  /**
   * Exports collected readings to a CSV file: (time, bpm, sqi, sdnn, rmssd, pnn50).
   */
  const downloadReadingsCsv = useCallback(() => {
    const header = 'time,bpm,sqi,sdnn,rmssd,pnn50\n';
    const rows =
      readingsLog.length > 0
        ? readingsLog.map(
            (r) =>
              `${r.isoTime},${r.bpm.toFixed(1)},${r.sqi.toFixed(2)},${
                r.sdnn !== null ? r.sdnn.toFixed(1) : ''
              },${r.rmssd !== null ? r.rmssd.toFixed(1) : ''},${
                r.pnn50 !== null ? r.pnn50.toFixed(1) : ''
              }`
          )
        : analysis.bpm !== null
        ? [
            `${new Date().toISOString()},${analysis.bpm.toFixed(1)},${analysis.sqi.toFixed(
              2
            )},${
              analysis.hrv.sdnn !== null ? analysis.hrv.sdnn.toFixed(1) : ''
            },${
              analysis.hrv.rmssd !== null ? analysis.hrv.rmssd.toFixed(1) : ''
            },${
              analysis.hrv.pnn50 !== null ? analysis.hrv.pnn50.toFixed(1) : ''
            }`,
          ]
        : [];

    const csvContent = header + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `pulselens-readings-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [analysis, readingsLog]);

  // Support ?demo=1 or ?autostart=1 for instant automated testing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' || params.get('autostart') === '1') {
      startDemoMode(36);
    }
    return () => {
      stopAllStreams();
    };
  }, [startDemoMode, stopAllStreams]);

  return {
    isCameraActive,
    isDemoMode,
    isLoadingModel,
    modelDelegate,
    errorMessage,
    setErrorMessage,
    algorithm,
    setAlgorithm,
    windowSec,
    setWindowSec,
    compareAll,
    setCompareAll,
    trackingStatus,
    faceDetected,
    roiBoxes,
    latestRGB,
    faceBiometrics,
    demoExpressionPreset,
    setDemoExpressionPreset,
    analysis,
    readingsLog,
    videoRef,
    previewCanvasRef,
    startCamera,
    startDemoMode,
    fillDemo2MinBuffer,
    stopAllStreams,
    resetReadings,
    downloadReadingsCsv,
  };
}

