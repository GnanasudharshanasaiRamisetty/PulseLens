# PulseLens

**Contactless heart rate and HRV from your webcam, using remote photoplethysmography (rPPG).**
No sensors, no wearables, no backend: everything runs in your browser and your video never leaves your device.

**Live demo:** https://pulselens.ai.studio/

> Screening/demo tool, **not a medical device**. Do not use it for diagnosis.

## What it measures

- **Heart rate (BPM)**, median of the last 5 estimates
- **Pulse waveform** (10 s rolling view with detected beats)
- **Inter-beat intervals (IBI)** and an IBI tachogram
- **Heart rate variability:** mean IBI, SDNN, RMSSD, pNN50, Poincare SD1/SD2, LF/HF (needs 2+ minutes of data)
- **Respiration rate** (experimental, from respiratory sinus arrhythmia)
- **Signal Quality Index (SQI):** Good / Fair / Poor
- **Facial expression and approximate age** (experimental, see Limitations)
- Downloadable readings (CSV) and a measurement report (PDF/HTML/Markdown)

## How it works

```
Webcam frame -> MediaPipe FaceLandmarker (478 landmarks)
 -> skin ROI: forehead + both cheeks, YCrCb skin filter
 -> mean R, G, B per frame -> resample to a uniform rate
 -> rPPG algorithm (POS / CHROM / Green) -> zero-phase Butterworth band-pass 0.7-4 Hz
 -> FFT peak = BPM + SQI   -> peak detection = IBI -> HRV
```

Each heartbeat changes skin blood volume, which slightly changes how much green light the skin absorbs. The default **POS** (Plane-Orthogonal-to-Skin) algorithm cancels most lighting and motion noise and keeps the pulse. CHROM and a plain Green-channel baseline are included for comparison ("Compare all algorithms").

All signal processing (resampling, Butterworth filter, radix-2 FFT, peak detection, HRV) is written from scratch in TypeScript, with no DSP libraries.

## Tech stack

React 19, TypeScript, Vite, Tailwind CSS, MediaPipe Tasks Vision (loaded from a CDN), Web Worker for analysis.

## Project structure

```
src/
  App.tsx                      main UI
  hooks/usePulseMonitor.ts     camera, tracking loop, analysis scheduling
  workers/rppgWorker.ts        analysis in a Web Worker
  utils/rppg.ts                POS, CHROM, Green
  utils/dsp.ts                 resampling, Butterworth, FFT, SQI, peak detection
  utils/hrv.ts                 SDNN, RMSSD, pNN50, Poincare, LF/HF, respiration
  utils/faceRoi.ts             ROI boxes and skin filter, MediaPipe loader
  utils/faceAttributes.ts      expression and approximate age (experimental)
  utils/demoSignal.ts          synthetic 72 BPM signal for Demo Mode
  utils/reportGenerator.ts     PDF / HTML / Markdown report
  utils/pipeline.test.ts       tests
  components/                  waveform, IBI chart, HRV cards, report modal
```

## Run locally

Requires Node.js 18+.

```bash
npm install          # .npmrc already sets legacy-peer-deps
npm run dev          # http://localhost:3000
```

Press **Demo Mode** to verify the pipeline without a camera (it should show about 72 BPM, Good quality). Press **Start Camera** and allow access for live measurement; face the camera in even light, stay still and do not talk. BPM settles after about 15 s, HRV after 30 s.

Other commands:

```bash
npm run build        # production build in dist/
npm run preview      # serve the production build
npx tsx --test src/utils/pipeline.test.ts    # run the tests
```

## Deploy (free)

It is a static site, so any static host works: **Netlify** (drag the `dist` folder onto Netlify Drop), **Vercel**, **Cloudflare Pages**, **Firebase Hosting** or **GitHub Pages**. Use build command `npm run build` and output directory `dist`. HTTPS is required for camera access and is provided by these hosts.

## Accuracy

Tested on simulated RGB signals with known ground truth:

- Heart rate within about 0.5 BPM from 48 to 140 BPM, including timing jitter, dropped frames, 15 and 60 fps, lighting drift and head-motion bursts.
- The mean IBI is accurate to a few ms. SDNN and RMSSD read higher than the true values because 30 fps video limits beat-timing precision, so treat HRV as a trend, not an exact value.
- The band-pass filter matches SciPy's Butterworth response.

Results on a real webcam depend on lighting, motion, camera quality and skin tone. For real accuracy, compare against a pulse oximeter or smartwatch and report MAE/RMSE (public datasets: UBFC-rPPG, PURE).

## Limitations

- Needs steady, even lighting and a still face; motion, talking and webcam auto-exposure reduce accuracy. Darker skin tones give a weaker signal.
- HRV from video at 30 fps is much less reliable than ECG. LF/HF needs at least 2 minutes of clean data.
- When signal quality is Poor, readings can be wrong. Check the SQI before trusting a value.
- Respiration rate is experimental. SpO2 and blood pressure are not supported with a plain RGB webcam.
- **Age and expression are experimental estimates.** Expression comes from facial landmark and blendshape geometry. The age estimate is a hand-tuned formula based on facial proportions and skin texture, not a trained or validated model, so do not rely on it.

## Privacy

Video frames are processed in memory in your browser and are never uploaded or stored. The only network requests fetch the MediaPipe library and face model from CDNs.

## References

- Wang et al., "Algorithmic Principles of Remote PPG", IEEE TBME, 2017 (POS)
- de Haan and Jeanne, "Robust Pulse Rate from Chrominance-Based rPPG", IEEE TBME, 2013 (CHROM)
- Bobbia et al., "Unsupervised skin tissue segmentation for remote photoplethysmography", 2019 (UBFC-rPPG)

## License

MIT. See [LICENSE](LICENSE).

