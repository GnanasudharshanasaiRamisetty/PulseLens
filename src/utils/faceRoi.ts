import { ROIBox } from '../types/rppg';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

const MEDIAPIPE_CDN_ESM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
const MEDIAPIPE_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Step 3: Compute the 3 ROI boxes from MediaPipe Face Mesh 478 normalized landmarks:
 * - Forehead: x between landmarks 66 and 296, y from 15% to 75% of the distance between landmark 10 and landmark 9.
 * - Cheeks: centred on the midpoint of landmarks (50, 205) and (280, 425),
 *   half-width 8.5% of face width (landmark 234 to 454), half-height 0.8x that.
 */
export function computeROIBoxesFromLandmarks(
  landmarks: NormalizedLandmark[]
): ROIBox[] {
  if (!landmarks || landmarks.length < 455) {
    return [];
  }

  const lm9 = landmarks[9];
  const lm10 = landmarks[10];
  const lm66 = landmarks[66];
  const lm296 = landmarks[296];
  const lm50 = landmarks[50];
  const lm205 = landmarks[205];
  const lm280 = landmarks[280];
  const lm425 = landmarks[425];
  const lm234 = landmarks[234];
  const lm454 = landmarks[454];

  // Forehead box: x between 66 and 296, y from 15% to 75% of distance between 10 and 9
  const fhXMin = Math.min(lm66.x, lm296.x);
  const fhXMax = Math.max(lm66.x, lm296.x);
  const dist10To9 = Math.hypot(lm9.x - lm10.x, lm9.y - lm10.y);
  const yTop = Math.min(lm10.y, lm9.y);
  const fhY1 = yTop + 0.15 * dist10To9;
  const fhY2 = yTop + 0.75 * dist10To9;

  // Face width: distance between landmark 234 and landmark 454
  const faceWidth = Math.hypot(lm454.x - lm234.x, lm454.y - lm234.y);
  const halfW = 0.085 * faceWidth;
  const halfH = 0.8 * halfW;

  // Left cheek midpoint (50, 205)
  const lcCenterX = 0.5 * (lm50.x + lm205.x);
  const lcCenterY = 0.5 * (lm50.y + lm205.y);

  // Right cheek midpoint (280, 425)
  const rcCenterX = 0.5 * (lm280.x + lm425.x);
  const rcCenterY = 0.5 * (lm280.y + lm425.y);

  const clampBox = (
    label: ROIBox['label'],
    x: number,
    y: number,
    w: number,
    h: number
  ): ROIBox => {
    const cx = Math.max(0, Math.min(0.98, x));
    const cy = Math.max(0, Math.min(0.98, y));
    const cw = Math.max(0.01, Math.min(1 - cx, w));
    const ch = Math.max(0.01, Math.min(1 - cy, h));
    return { label, x: cx, y: cy, width: cw, height: ch };
  };

  return [
    clampBox(
      'Forehead',
      fhXMin,
      Math.min(fhY1, fhY2),
      Math.max(0.02, fhXMax - fhXMin),
      Math.max(0.015, Math.abs(fhY2 - fhY1))
    ),
    clampBox(
      'Left Cheek',
      lcCenterX - halfW,
      lcCenterY - halfH,
      2 * halfW,
      2 * halfH
    ),
    clampBox(
      'Right Cheek',
      rcCenterX - halfW,
      rcCenterY - halfH,
      2 * halfW,
      2 * halfH
    ),
  ];
}

/**
 * Step 4: Converts an RGB pixel (0-255) to YCrCb and checks if it lies in the skin-colour cluster:
 * Cr in [133, 173] and Cb in [77, 127].
 */
export function isSkinPixelYCrCb(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cr = 128 + 0.713 * (r - y);
  const cb = 128 + 0.564 * (b - y);
  return cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127;
}

/**
 * Step 4: Extract mean R, G, B across the ROI boxes from RGBA pixel buffer.
 * Keeps only skin-coloured pixels (YCrCb: Cr 133-173, Cb 77-127).
 * If fewer than 40% of ROI pixels pass, falls back to using all ROI pixels.
 */
export function extractMeanRGBFromROIs(
  rgbaData: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  boxes: ROIBox[]
): {
  r: number;
  g: number;
  b: number;
  skinRatio: number;
  skinLuminanceStd: number;
} {
  let skinSumR = 0;
  let skinSumG = 0;
  let skinSumB = 0;
  let skinSumY = 0;
  let skinSumY2 = 0;
  let skinCount = 0;

  let allSumR = 0;
  let allSumG = 0;
  let allSumB = 0;
  let allSumY = 0;
  let allSumY2 = 0;
  let allCount = 0;

  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x * canvasWidth));
    const y0 = Math.max(0, Math.floor(box.y * canvasHeight));
    const x1 = Math.min(canvasWidth, Math.ceil((box.x + box.width) * canvasWidth));
    const y1 = Math.min(canvasHeight, Math.ceil((box.y + box.height) * canvasHeight));

    for (let y = y0; y < y1; y++) {
      const rowOffset = y * canvasWidth * 4;
      for (let x = x0; x < x1; x++) {
        const idx = rowOffset + x * 4;
        const r = rgbaData[idx];
        const g = rgbaData[idx + 1];
        const b = rgbaData[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        allSumR += r;
        allSumG += g;
        allSumB += b;
        allSumY += lum;
        allSumY2 += lum * lum;
        allCount++;

        if (isSkinPixelYCrCb(r, g, b)) {
          skinSumR += r;
          skinSumG += g;
          skinSumB += b;
          skinSumY += lum;
          skinSumY2 += lum * lum;
          skinCount++;
        }
      }
    }
  }

  if (allCount === 0) {
    return { r: 0, g: 0, b: 0, skinRatio: 0, skinLuminanceStd: 0 };
  }

  const skinRatio = skinCount / allCount;
  // If fewer than 40% pass, use all ROI pixels
  if (skinRatio >= 0.4 && skinCount > 0) {
    const meanY = skinSumY / skinCount;
    const varianceY = Math.max(0, skinSumY2 / skinCount - meanY * meanY);
    return {
      r: skinSumR / skinCount,
      g: skinSumG / skinCount,
      b: skinSumB / skinCount,
      skinRatio,
      skinLuminanceStd: Math.sqrt(varianceY),
    };
  }

  const meanY = allSumY / allCount;
  const varianceY = Math.max(0, allSumY2 / allCount - meanY * meanY);
  return {
    r: allSumR / allCount,
    g: allSumG / allCount,
    b: allSumB / allCount,
    skinRatio,
    skinLuminanceStd: Math.sqrt(varianceY),
  };
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export interface FaceLandmarkerInstance {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number
  ): {
    faceLandmarks?: NormalizedLandmark[][];
    faceBlendshapes?: Array<{ categories: BlendshapeCategory[] }>;
  };
  close?: () => void;
}

let cachedLandmarkerPromise: Promise<{
  landmarker: FaceLandmarkerInstance;
  delegate: 'GPU' | 'CPU';
}> | null = null;

/**
 * Step 2: Load MediaPipe Tasks Vision FaceLandmarker from jsDelivr CDN with GPU delegate
 * and automatic CPU fallback. Enables face blendshapes for live expression tracking.
 */
export async function getOrLoadFaceLandmarker(): Promise<{
  landmarker: FaceLandmarkerInstance;
  delegate: 'GPU' | 'CPU';
}> {
  if (cachedLandmarkerPromise) {
    return cachedLandmarkerPromise;
  }

  cachedLandmarkerPromise = (async () => {
    try {
      // Dynamic import from jsDelivr CDN
      const visionModule: any = await import(
        /* @vite-ignore */ MEDIAPIPE_CDN_ESM
      );
      const { FaceLandmarker, FilesetResolver } = visionModule;

      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

      try {
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        return { landmarker, delegate: 'GPU' as const };
      } catch {
        // Fallback to CPU delegate if WebGL/GPU delegate fails
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        return { landmarker, delegate: 'CPU' as const };
      }
    } catch (err) {
      cachedLandmarkerPromise = null;
      throw err;
    }
  })();

  return cachedLandmarkerPromise;
}

