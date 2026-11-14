import {
  DemoExpressionPreset,
  FaceBiometricsResult,
  FaceExpressionMetrics,
  FacialExpressionLabel,
} from '../types/rppg';
import { BlendshapeCategory, NormalizedLandmark } from './faceRoi';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getLifeStageLabel(age: number): string {
  if (age < 25) return 'Young Adult (18–24)';
  if (age < 35) return 'Young Adult (25–34)';
  if (age < 50) return 'Adult (35–49)';
  if (age < 65) return 'Middle Adult (50–64)';
  return 'Senior Adult (65+)';
}

export function getExpressionGuidance(label: FacialExpressionLabel): {
  summary: string;
  motionArtifactRisk: 'Low' | 'Moderate' | 'Elevated';
} {
  switch (label) {
    case 'Happy / Smiling':
      return {
        summary:
          'Zygomaticus major activation (AU12) detected — cheek ROI geometry is elevated; keep head steady for optimal rPPG SNR.',
        motionArtifactRisk: 'Low',
      };
    case 'Surprised / Alert':
      return {
        summary:
          'Frontalis brow lift (AU1+2) and widened palpebral aperture — forehead skin stretch can briefly shift baseline reflectance.',
        motionArtifactRisk: 'Moderate',
      };
    case 'Speaking / Active':
      return {
        summary:
          'Mandibular & perioral articulation (AU25/26) detected — avoid talking during measurement to prevent motion artifacts.',
        motionArtifactRisk: 'Elevated',
      };
    case 'Focused / Concentrating':
      return {
        summary:
          'Corrugator brow convergence (AU4) and steady gaze — low head movement provides high optical rPPG stability.',
        motionArtifactRisk: 'Low',
      };
    case 'Relaxed / Resting':
      return {
        summary:
          'Low periorbital and mandibular muscle tension — ideal resting baseline for autonomic HRV and pulse estimation.',
        motionArtifactRisk: 'Low',
      };
    case 'Neutral / Calm':
    default:
      return {
        summary:
          'Balanced facial muscle tone and symmetric ROI posture — optimal low-artifact state for contactless rPPG.',
        motionArtifactRisk: 'Low',
      };
  }
}

export function createIdleFaceBiometrics(): FaceBiometricsResult {
  return {
    isTracking: false,
    expression: 'Neutral / Calm',
    expressionConfidence: 0,
    expressionSummary:
      'Start Camera or Demo Mode to analyze live facial expressions and craniofacial/dermal approximate age.',
    motionArtifactRisk: 'Low',
    metrics: {
      smileScore: 0,
      browLiftScore: 0,
      eyeOpennessScore: 0,
      jawActivityScore: 0,
      symmetryScore: 0,
    },
    estimatedAge: null,
    ageRange: '—',
    lifeStage: 'Waiting for face lock',
    ageConfidence: 0,
    skinTextureIndex: null,
    craniofacialRatio: null,
  };
}

/**
 * Classifies the dominant facial expression from the 5 normalized [0..100] action-unit metrics.
 */
export function classifyExpressionFromMetrics(
  metrics: FaceExpressionMetrics
): {
  expression: FacialExpressionLabel;
  confidence: number;
} {
  const {
    smileScore,
    browLiftScore,
    eyeOpennessScore,
    jawActivityScore,
  } = metrics;

  if (jawActivityScore >= 46 && smileScore < 58) {
    const conf = clamp(Math.round(62 + (jawActivityScore - 46) * 0.7), 65, 98);
    return { expression: 'Speaking / Active', confidence: conf };
  }

  if (smileScore >= 42) {
    const conf = clamp(Math.round(64 + (smileScore - 42) * 0.62), 66, 99);
    return { expression: 'Happy / Smiling', confidence: conf };
  }

  if (browLiftScore >= 60 && eyeOpennessScore >= 65) {
    const conf = clamp(
      Math.round(60 + 0.35 * (browLiftScore - 55) + 0.35 * (eyeOpennessScore - 60)),
      65,
      97
    );
    return { expression: 'Surprised / Alert', confidence: conf };
  }

  if (browLiftScore <= 32 && eyeOpennessScore <= 56 && jawActivityScore < 25) {
    const conf = clamp(Math.round(72 + (32 - browLiftScore) * 0.65), 70, 96);
    return { expression: 'Focused / Concentrating', confidence: conf };
  }

  if (eyeOpennessScore <= 42 && smileScore < 25 && jawActivityScore < 18) {
    const conf = clamp(Math.round(74 + (42 - eyeOpennessScore) * 0.55), 72, 95);
    return { expression: 'Relaxed / Resting', confidence: conf };
  }

  const neutrality =
    100 -
    0.35 * Math.abs(smileScore - 14) -
    0.25 * Math.abs(browLiftScore - 44) -
    0.25 * jawActivityScore;
  const conf = clamp(Math.round(neutrality), 72, 98);
  return { expression: 'Neutral / Calm', confidence: conf };
}

/**
 * Extracts real-time facial expression action units and approximate biometric age
 * from 478 MediaPipe Face Mesh landmarks, optional 52 Face Blendshapes, and ROI dermal texture.
 */
export function analyzeFaceBiometricsFromLandmarks(
  landmarks: NormalizedLandmark[],
  blendshapes?: BlendshapeCategory[],
  skinLuminanceStd = 9.5,
  skinRatio = 0.9,
  ageHistory: number[] = []
): {
  biometrics: FaceBiometricsResult;
  updatedAgeHistory: number[];
} {
  if (!landmarks || landmarks.length < 455) {
    return {
      biometrics: createIdleFaceBiometrics(),
      updatedAgeHistory: ageHistory,
    };
  }

  // Craniofacial reference dimensions
  const foreheadTop = landmarks[10];
  const chinBottom = landmarks[152];
  const leftCheekEdge = landmarks[234];
  const rightCheekEdge = landmarks[454];
  const glabella = landmarks[9];
  const subnasale = landmarks[2];

  const faceHeight = Math.max(0.05, dist2D(foreheadTop, chinBottom));
  const faceWidth = Math.max(0.05, dist2D(leftCheekEdge, rightCheekEdge));
  const craniofacialRatio = Number((faceHeight / faceWidth).toFixed(2));

  // Geometric Mouth & Smile features (landmarks 61, 291 corners; 13, 14 inner lips)
  const mouthLeft = landmarks[61];
  const mouthRight = landmarks[291];
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];

  const mouthWidthRatio = dist2D(mouthLeft, mouthRight) / faceWidth;
  const mouthOpenRatio = dist2D(upperLip, lowerLip) / faceHeight;
  const lipCenterY = 0.5 * (upperLip.y + lowerLip.y);
  const cornerAvgY = 0.5 * (mouthLeft.y + mouthRight.y);
  // Positive when mouth corners pull upward relative to lip center
  const cornerLift = (lipCenterY - cornerAvgY) / faceHeight;

  const geoSmile = clamp(
    (mouthWidthRatio - 0.34) * 320 + cornerLift * 950 + 18,
    0,
    100
  );
  const geoJaw = clamp((mouthOpenRatio - 0.012) * 820, 0, 100);

  // Geometric Eye Openness (EAR) from landmarks (159,145 / 33,133) and (386,374 / 362,263)
  const leftEyeV = dist2D(landmarks[159], landmarks[145]);
  const leftEyeH = Math.max(0.01, dist2D(landmarks[33], landmarks[133]));
  const rightEyeV = dist2D(landmarks[386], landmarks[374]);
  const rightEyeH = Math.max(0.01, dist2D(landmarks[362], landmarks[263]));
  const ear = 0.5 * (leftEyeV / leftEyeH + rightEyeV / rightEyeH);
  const geoEyeOpenness = clamp(((ear - 0.14) / 0.22) * 100, 0, 100);

  // Geometric Eyebrow Lift (distance from brow 66/296 to upper eye 159/386 normalized by faceHeight)
  const leftBrowDist = dist2D(landmarks[66], landmarks[159]) / faceHeight;
  const rightBrowDist = dist2D(landmarks[296], landmarks[386]) / faceHeight;
  const browRatio = 0.5 * (leftBrowDist + rightBrowDist);
  const geoBrowLift = clamp(((browRatio - 0.065) / 0.065) * 100, 0, 100);

  // Bilateral Facial Symmetry (compare left vs right distances to midline)
  const midX = 0.5 * (foreheadTop.x + chinBottom.x);
  const leftSpan = Math.abs(midX - leftCheekEdge.x);
  const rightSpan = Math.abs(rightCheekEdge.x - midX);
  const cheekAsym = Math.abs(leftSpan - rightSpan) / Math.max(0.01, leftSpan + rightSpan);
  const mouthAsym = Math.abs(mouthLeft.y - mouthRight.y) / faceHeight;
  const symmetryScore = clamp(
    Math.round(100 - cheekAsym * 65 - mouthAsym * 180),
    68,
    99
  );

  // Fuse with MediaPipe 52 Face Blendshapes when available
  let smileScore = geoSmile;
  let browLiftScore = geoBrowLift;
  let eyeOpennessScore = geoEyeOpenness;
  let jawActivityScore = geoJaw;

  if (blendshapes && blendshapes.length > 0) {
    const map = new Map<string, number>();
    for (const b of blendshapes) {
      map.set(b.categoryName, b.score);
    }
    const bsSmile =
      50 * ((map.get('mouthSmileLeft') ?? 0) + (map.get('mouthSmileRight') ?? 0));
    const bsBrowUp =
      100 *
      (0.5 * (map.get('browInnerUp') ?? 0) +
        0.25 * (map.get('browOuterUpLeft') ?? 0) +
        0.25 * (map.get('browOuterUpRight') ?? 0));
    const bsBrowDown =
      50 * ((map.get('browDownLeft') ?? 0) + (map.get('browDownRight') ?? 0));
    const bsBlink =
      50 * ((map.get('eyeBlinkLeft') ?? 0) + (map.get('eyeBlinkRight') ?? 0));
    const bsWide =
      50 * ((map.get('eyeWideLeft') ?? 0) + (map.get('eyeWideRight') ?? 0));
    const bsJaw = 100 * (map.get('jawOpen') ?? 0);

    smileScore = clamp(0.65 * bsSmile + 0.35 * geoSmile, 0, 100);
    browLiftScore = clamp(
      0.6 * (42 + bsBrowUp * 0.85 - bsBrowDown * 0.65) + 0.4 * geoBrowLift,
      0,
      100
    );
    eyeOpennessScore = clamp(
      0.6 * (72 - bsBlink * 0.85 + bsWide * 0.45) + 0.4 * geoEyeOpenness,
      0,
      100
    );
    jawActivityScore = clamp(0.65 * bsJaw + 0.35 * geoJaw, 0, 100);
  }

  const metrics: FaceExpressionMetrics = {
    smileScore: Math.round(smileScore),
    browLiftScore: Math.round(browLiftScore),
    eyeOpennessScore: Math.round(eyeOpennessScore),
    jawActivityScore: Math.round(jawActivityScore),
    symmetryScore,
  };

  const { expression, confidence } = classifyExpressionFromMetrics(metrics);
  const { summary, motionArtifactRisk } = getExpressionGuidance(expression);

  // Approximate Age Estimation:
  // Combines craniofacial proportions (midface-to-height, lower-face elongation, eye-to-face ratio)
  // with optical dermal micro-contrast (skinLuminanceStd in ROI boxes).
  const midFaceRatio = dist2D(glabella, subnasale) / faceHeight;
  const lowerFaceRatio = dist2D(subnasale, chinBottom) / faceHeight;
  const eyeSpanRatio = (leftEyeH + rightEyeH) / (2 * faceWidth);

  // Dermal smoothness index [0..100]: lower luminance variance in uniform skin ROI -> higher smoothness
  const skinTextureIndex = clamp(
    Math.round(100 - (skinLuminanceStd - 4.0) * 2.4),
    38,
    96
  );

  // Anthropometric + dermal age model (calibrated around adult baseline 22-62 yrs)
  const rawAgeEstimate =
    21.5 +
    clamp((100 - skinTextureIndex) * 0.42, 0, 26) +
    clamp((lowerFaceRatio - 0.32) * 65, -4, 9) +
    clamp((midFaceRatio - 0.28) * 55, -3, 8) +
    clamp((0.23 - eyeSpanRatio) * 70, -3, 7);

  const clampedInstantAge = clamp(rawAgeEstimate, 18, 76);
  const updatedAgeHistory = [...ageHistory.slice(-29), clampedInstantAge];
  const sortedAges = [...updatedAgeHistory].sort((a, b) => a - b);
  const medianAge = sortedAges[Math.floor(sortedAges.length / 2)];
  const estimatedAge = Math.round(medianAge);
  const halfBracket = 3;
  const ageRange = `${Math.max(18, estimatedAge - halfBracket)} – ${
    estimatedAge + halfBracket
  } yrs`;
  const ageConfidence = clamp(
    Math.round(74 + skinRatio * 18 + Math.min(6, updatedAgeHistory.length * 0.2)),
    70,
    96
  );

  return {
    biometrics: {
      isTracking: true,
      expression,
      expressionConfidence: confidence,
      expressionSummary: summary,
      motionArtifactRisk,
      metrics,
      estimatedAge,
      ageRange,
      lifeStage: getLifeStageLabel(estimatedAge),
      ageConfidence,
      skinTextureIndex,
      craniofacialRatio,
    },
    updatedAgeHistory,
  };
}

/**
 * Generates realistic, smoothly modulated facial expression & age telemetry for Demo Mode.
 * Supports 'Auto' (cycles naturally through expressions) or a specific preset selected by the user.
 */
export function generateDemoFaceBiometrics(
  timestampMs: number,
  preset: DemoExpressionPreset = 'Auto'
): FaceBiometricsResult {
  const tSec = timestampMs / 1000;
  // Natural subtle micro-movements
  const wave1 = Math.sin(2 * Math.PI * 0.18 * tSec);
  const wave2 = Math.cos(2 * Math.PI * 0.11 * tSec);

  let activeExpression: FacialExpressionLabel;
  if (preset === 'Auto') {
    // Smoothly showcase live expressions across a 24s cycle (starts in Neutral / Calm, then Happy / Smiling, Focused, etc.)
    const phase = Math.floor((tSec % 24) / 6);
    if (phase === 0) activeExpression = 'Neutral / Calm';
    else if (phase === 1) activeExpression = 'Happy / Smiling';
    else if (phase === 2) activeExpression = 'Focused / Concentrating';
    else activeExpression = 'Relaxed / Resting';
  } else {
    activeExpression = preset;
  }

  let metrics: FaceExpressionMetrics;
  switch (activeExpression) {
    case 'Happy / Smiling':
      metrics = {
        smileScore: Math.round(76 + 8 * wave1),
        browLiftScore: Math.round(52 + 4 * wave2),
        eyeOpennessScore: Math.round(64 + 4 * wave1),
        jawActivityScore: Math.round(18 + 5 * Math.abs(wave2)),
        symmetryScore: 95,
      };
      break;
    case 'Surprised / Alert':
      metrics = {
        smileScore: Math.round(18 + 4 * wave1),
        browLiftScore: Math.round(78 + 6 * wave1),
        eyeOpennessScore: Math.round(86 + 4 * wave2),
        jawActivityScore: Math.round(38 + 6 * Math.abs(wave1)),
        symmetryScore: 93,
      };
      break;
    case 'Focused / Concentrating':
      metrics = {
        smileScore: Math.round(10 + 3 * wave1),
        browLiftScore: Math.round(24 + 4 * wave2),
        eyeOpennessScore: Math.round(50 + 3 * wave1),
        jawActivityScore: Math.round(6 + 2 * Math.abs(wave2)),
        symmetryScore: 96,
      };
      break;
    case 'Speaking / Active':
      metrics = {
        smileScore: Math.round(28 + 6 * wave1),
        browLiftScore: Math.round(54 + 5 * wave2),
        eyeOpennessScore: Math.round(70 + 4 * wave1),
        jawActivityScore: Math.round(64 + 18 * Math.abs(Math.sin(2 * Math.PI * 1.6 * tSec))),
        symmetryScore: 91,
      };
      break;
    case 'Relaxed / Resting':
      metrics = {
        smileScore: Math.round(14 + 3 * wave1),
        browLiftScore: Math.round(38 + 3 * wave2),
        eyeOpennessScore: Math.round(38 + 3 * wave1),
        jawActivityScore: Math.round(5 + 2 * Math.abs(wave1)),
        symmetryScore: 97,
      };
      break;
    case 'Neutral / Calm':
    default:
      metrics = {
        smileScore: Math.round(16 + 4 * wave1),
        browLiftScore: Math.round(45 + 4 * wave2),
        eyeOpennessScore: Math.round(68 + 4 * wave1),
        jawActivityScore: Math.round(8 + 3 * Math.abs(wave2)),
        symmetryScore: 96,
      };
      break;
  }

  const { summary, motionArtifactRisk } = getExpressionGuidance(activeExpression);
  const estimatedAge = 28;

  return {
    isTracking: true,
    expression: activeExpression,
    expressionConfidence: 94,
    expressionSummary: summary,
    motionArtifactRisk,
    metrics,
    estimatedAge,
    ageRange: '25 – 31 yrs',
    lifeStage: getLifeStageLabel(estimatedAge),
    ageConfidence: 92,
    skinTextureIndex: 86,
    craniofacialRatio: 1.34,
  };
}
