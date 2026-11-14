export type RppgAlgorithm = 'POS' | 'CHROM' | 'GREEN';

export type SignalQualityLabel = 'Good' | 'Fair' | 'Poor';

export type TrackingStatus = 'idle' | 'no_face' | 'collecting' | 'tracking' | 'demo';

export interface RGBSample {
  /** Timestamp in milliseconds from performance.now() */
  timestamp: number;
  /** Mean red channel in skin ROI (0-255) */
  r: number;
  /** Mean green channel in skin ROI (0-255) */
  g: number;
  /** Mean blue channel in skin ROI (0-255) */
  b: number;
  /** Fraction of ROI pixels passing YCrCb skin filter (0-1) */
  skinRatio?: number;
}

export interface ROIBox {
  label: 'Forehead' | 'Left Cheek' | 'Right Cheek';
  /** Normalized coordinates [0, 1] in video frame space */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedBeat {
  /** Refined sample index (fractional via parabolic interpolation) */
  index: number;
  /** Refined timestamp in milliseconds */
  timestamp: number;
  /** Refined amplitude value */
  amplitude: number;
}

export interface IBIPoint {
  /** Timestamp of the beat (ms) */
  timestamp: number;
  /** Relative time from buffer start (seconds) */
  relativeSec: number;
  /** Inter-beat interval (ms) */
  ibiMs: number;
}

export interface HRVMetrics {
  isReady: boolean;
  reason?: string;
  cleanBeatCount: number;
  durationSec: number;
  meanIbi: number | null;
  sdnn: number | null;
  rmssd: number | null;
  pnn50: number | null;
  sd1: number | null;
  sd2: number | null;
  lfHf: number | null;
  lfHfStatus: 'ready' | 'needs 2+ min';
  respirationBpm: number | null;
}

export interface AlgorithmComparisonItem {
  algorithm: RppgAlgorithm;
  bpm: number | null;
  rawBpm: number | null;
  sqi: number;
  sqiLabel: SignalQualityLabel;
}

export interface PipelineAnalysisResult {
  timestamp: number;
  bufferDurationSec: number;
  measuredFps: number;
  sampleCount: number;
  /** Smoothed BPM (median of last 5 estimates) */
  bpm: number | null;
  /** Instantaneous spectral peak BPM */
  instantBpm: number | null;
  /** Signal Quality Index in [0, 1] */
  sqi: number;
  sqiLabel: SignalQualityLabel;
  /** Last 10 seconds of uniform timestamps (ms) for waveform plotting */
  waveformTimestamps: number[];
  /** Last 10 seconds of filtered pulse values */
  waveformValues: number[];
  /** Detected beats within the last 10 seconds */
  waveformBeats: DetectedBeat[];
  /** Clean IBI series across the buffer */
  ibiSeries: IBIPoint[];
  /** HRV metrics */
  hrv: HRVMetrics;
  /** Optional comparison across POS, CHROM, GREEN */
  comparison?: Record<RppgAlgorithm, AlgorithmComparisonItem>;
}

export interface ReadingLogEntry {
  isoTime: string;
  elapsedSec: number;
  algorithm: RppgAlgorithm;
  bpm: number;
  sqi: number;
  sqiLabel: SignalQualityLabel;
  sdnn: number | null;
  rmssd: number | null;
  pnn50: number | null;
}

export type FacialExpressionLabel =
  | 'Neutral / Calm'
  | 'Happy / Smiling'
  | 'Focused / Concentrating'
  | 'Surprised / Alert'
  | 'Speaking / Active'
  | 'Relaxed / Resting';

export type DemoExpressionPreset = 'Auto' | FacialExpressionLabel;

export interface FaceExpressionMetrics {
  /** Smile / lip corner pull (AU12) in [0, 100] */
  smileScore: number;
  /** Eyebrow raise / inner-outer brow lift (AU1+2) in [0, 100] */
  browLiftScore: number;
  /** Eye aspect ratio openness (EAR) in [0, 100] */
  eyeOpennessScore: number;
  /** Jaw drop / mouth aperture activity (AU25/26) in [0, 100] */
  jawActivityScore: number;
  /** Bilateral left-right facial landmark symmetry in [0, 100] */
  symmetryScore: number;
}

export interface FaceBiometricsResult {
  isTracking: boolean;
  expression: FacialExpressionLabel;
  expressionConfidence: number;
  expressionSummary: string;
  motionArtifactRisk: 'Low' | 'Moderate' | 'Elevated';
  metrics: FaceExpressionMetrics;
  estimatedAge: number | null;
  ageRange: string;
  lifeStage: string;
  ageConfidence: number;
  skinTextureIndex: number | null;
  craniofacialRatio: number | null;
}

