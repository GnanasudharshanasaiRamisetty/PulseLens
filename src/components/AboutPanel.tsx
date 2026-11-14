import React from 'react';

export const AboutPanel: React.FC = () => {
  const steps = [
    {
      num: '01. Optical Facial ROI & Skin Segmentation',
      desc: 'MediaPipe FaceLandmarker tracks 478 3D facial landmarks at 30 fps. Three vascularized regions of interest (Forehead and Left/Right Cheeks) are isolated and filtered in YCrCb color space (Cr 133–173, Cb 77–127, with a 40% fallback threshold) to reject hair, shadows, and non-skin background pixels.',
    },
    {
      num: '02. Subsurface Hemoglobin Chrominance Projection',
      desc: 'Each cardiac systole increases microvascular blood volume in the dermis, momentarily absorbing more green and blue light than red. Sliding 1.6 s windows project normalized RGB traces onto a plane orthogonal to specular skin reflection (POS) or chrominance difference axes (CHROM) to cancel motion and lighting drift.',
    },
    {
      num: '03. Zero-Phase Bandpass & Radix-2 Spectral Estimation',
      desc: 'Non-uniform webcam frame timestamps are linearly resampled to a uniform rate, linearly detrended, and passed forward-and-backward through 3 cascaded Butterworth biquad sections (0.7–4.0 Hz, 42–240 BPM). A Hann-windowed, zero-padded Radix-2 FFT extracts the dominant cardiac frequency and Signal Quality Index (SQI).',
    },
    {
      num: '04. Parabolic Peak Refinement & Autonomic HRV',
      desc: 'Systolic peaks are detected using adaptive prominence (0.25σ) and minimum refractory distance (60% of beat period), then refined to sub-frame precision via parabolic interpolation. Clean inter-beat intervals (IBIs) yield time-domain HRV (SDNN, RMSSD, pNN50), Poincaré SD1/SD2, and 4 Hz spectral respiratory & LF/HF metrics.',
    },
  ];

  return (
    <section
      id="about-rppg"
      className="bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-800 rounded-lg p-5 mt-6 shadow-xs transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            How Contactless Remote Photoplethysmography (rPPG) Works
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            100% client-side optical signal processing pipeline — video frames are processed in memory and never leave your device.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
          Passband: 0.7–4.0 Hz (42–240 BPM) · Buffer: 120 s rolling
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {steps.map((step) => (
          <div
            key={step.num}
            className="bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800/80 rounded p-4"
          >
            <h3 className="text-xs font-semibold text-teal-700 dark:text-teal-400 font-mono mb-2">
              {step.num}
            </h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
