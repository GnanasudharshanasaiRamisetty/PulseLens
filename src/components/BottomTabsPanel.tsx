import React, { useState } from 'react';
import {
  DemoExpressionPreset,
  FaceBiometricsResult,
  FacialExpressionLabel,
} from '../types/rppg';

interface BottomTabsPanelProps {
  faceBiometrics: FaceBiometricsResult;
  isDemoMode: boolean;
  isRunning: boolean;
  demoExpressionPreset: DemoExpressionPreset;
  onSelectDemoPreset: (preset: DemoExpressionPreset) => void;
  onStartDemoMode: () => void;
}

const EXPRESSION_PRESETS: DemoExpressionPreset[] = [
  'Auto',
  'Neutral / Calm',
  'Happy / Smiling',
  'Focused / Concentrating',
  'Surprised / Alert',
  'Speaking / Active',
  'Relaxed / Resting',
];

const PIPELINE_STEPS = [
  {
    num: '01. Optical Facial ROI & Skin Segmentation',
    desc: 'MediaPipe FaceLandmarker tracks 478 3D facial landmarks and 52 blendshape action units at 30 fps. Three vascularized regions of interest (Forehead and Left/Right Cheeks) are isolated and filtered in YCrCb color space (Cr 133–173, Cb 77–127, with a 40% fallback threshold) to reject hair, shadows, and non-skin background pixels.',
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

export const BottomTabsPanel: React.FC<BottomTabsPanelProps> = ({
  faceBiometrics,
  isDemoMode,
  isRunning,
  demoExpressionPreset,
  onSelectDemoPreset,
  onStartDemoMode,
}) => {
  const [activeTab, setActiveTab] = useState<'expressions' | 'pipeline'>(
    'expressions'
  );

  const getExpressionTone = (expr: FacialExpressionLabel) => {
    switch (expr) {
      case 'Happy / Smiling':
        return 'text-emerald-700 dark:text-emerald-300';
      case 'Surprised / Alert':
        return 'text-amber-700 dark:text-amber-300';
      case 'Speaking / Active':
        return 'text-rose-700 dark:text-rose-300';
      case 'Focused / Concentrating':
        return 'text-violet-700 dark:text-violet-300';
      case 'Relaxed / Resting':
        return 'text-sky-700 dark:text-sky-300';
      case 'Neutral / Calm':
      default:
        return 'text-fuchsia-700 dark:text-fuchsia-300';
    }
  };

  const getArtifactTone = (risk: FaceBiometricsResult['motionArtifactRisk']) => {
    if (risk === 'Low') return 'text-emerald-700 dark:text-emerald-400';
    if (risk === 'Moderate') return 'text-amber-700 dark:text-amber-400';
    return 'text-rose-700 dark:text-rose-400';
  };

  const actionUnitRows = [
    {
      label: 'Smile / Lip Corner Pull (AU12)',
      value: faceBiometrics.metrics.smileScore,
      barClass: 'bg-emerald-600 dark:bg-emerald-400',
    },
    {
      label: 'Brow Lift / Alertness (AU1+2)',
      value: faceBiometrics.metrics.browLiftScore,
      barClass: 'bg-violet-600 dark:bg-violet-400',
    },
    {
      label: 'Eye Openness / Palpebral EAR',
      value: faceBiometrics.metrics.eyeOpennessScore,
      barClass: 'bg-amber-500 dark:bg-amber-400',
    },
    {
      label: 'Jaw / Perioral Activity (AU25/26)',
      value: faceBiometrics.metrics.jawActivityScore,
      barClass: 'bg-rose-600 dark:bg-rose-400',
    },
    {
      label: 'Bilateral Facial Symmetry',
      value: faceBiometrics.metrics.symmetryScore,
      barClass: 'bg-fuchsia-600 dark:bg-fuchsia-400',
    },
  ];

  return (
    <section
      id="down-tab-section"
      data-testid="bottom-tabs-panel"
      className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg mt-6 shadow-xs transition-colors overflow-hidden"
    >
      {/* Hidden anchor for legacy #about-rppg navigation */}
      <div id="about-rppg" className="sr-only" />

      {/* Down Tab Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 pt-3.5 pb-3 border-b border-slate-200 dark:border-[#2E2740] bg-slate-50/80 dark:bg-[#161320]">
        <div
          role="tablist"
          aria-label="Biometric & Pipeline Down Tabs"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'expressions'}
            data-testid="tab-live-expressions"
            onClick={() => setActiveTab('expressions')}
            className={`px-3.5 py-2 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'expressions'
                ? 'bg-violet-700 dark:bg-violet-500 text-white dark:text-slate-950 border-violet-700 dark:border-violet-400'
                : 'bg-white dark:bg-[#1B1726] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#2E2740] hover:border-violet-500 dark:hover:border-violet-400'
            }`}
          >
            Live Face Expressions
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pipeline'}
            data-testid="tab-about-rppg"
            onClick={() => setActiveTab('pipeline')}
            className={`px-3.5 py-2 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'pipeline'
                ? 'bg-violet-700 dark:bg-violet-500 text-white dark:text-slate-950 border-violet-700 dark:border-violet-400'
                : 'bg-white dark:bg-[#1B1726] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#2E2740] hover:border-violet-500 dark:hover:border-violet-400'
            }`}
          >
            How rPPG Works (4-Step Pipeline)
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-600 dark:text-slate-400">
          <span>
            {faceBiometrics.isTracking
              ? '● 478 Landmarks + FACS Active'
              : '○ Awaiting Face Lock'}
          </span>
          <span aria-hidden="true">·</span>
          <span>100% Local In-Browser Analysis</span>
        </div>
      </div>

      {/* TAB 1: LIVE FACIAL EXPRESSIONS */}
      {activeTab === 'expressions' && (
        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Column 1 (6 cols): Live Facial Expression State & Simulator */}
            <div className="lg:col-span-6 bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Live Facial Expression
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    Conf:{' '}
                    {faceBiometrics.isTracking
                      ? `${faceBiometrics.expressionConfidence}%`
                      : '—'}
                  </span>
                </div>

                <div
                  data-testid="live-expression-label"
                  className={`text-2xl font-mono font-bold tracking-tight mt-1 ${
                    faceBiometrics.isTracking
                      ? getExpressionTone(faceBiometrics.expression)
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {faceBiometrics.isTracking
                    ? faceBiometrics.expression
                    : 'Waiting for Face...'}
                </div>

                <div className="flex items-center justify-between text-xs font-mono mt-3 pt-2.5 border-t border-slate-200 dark:border-[#2E2740]">
                  <span className="text-slate-600 dark:text-slate-400">
                    rPPG Motion Artifact Risk:
                  </span>
                  <span
                    data-testid="expression-artifact-risk"
                    className={`font-semibold ${
                      faceBiometrics.isTracking
                        ? getArtifactTone(faceBiometrics.motionArtifactRisk)
                        : 'text-slate-500'
                    }`}
                  >
                    ●{' '}
                    {faceBiometrics.isTracking
                      ? faceBiometrics.motionArtifactRisk
                      : 'Standby'}
                  </span>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 mt-2.5 leading-relaxed">
                  {faceBiometrics.expressionSummary}
                </p>
              </div>

              {/* Interactive Expression Preset Tester for Demo Mode */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#2E2740]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400">
                    {isDemoMode
                      ? 'Demo Expression Simulator:'
                      : 'Expression Simulator (Demo Mode):'}
                  </span>
                  {!isRunning && (
                    <button
                      type="button"
                      onClick={onStartDemoMode}
                      className="text-[11px] font-mono font-semibold text-violet-700 dark:text-violet-300 hover:underline cursor-pointer"
                    >
                      Start Demo to Test
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXPRESSION_PRESETS.map((preset) => {
                    const isSelected = demoExpressionPreset === preset;
                    const shortLabel =
                      preset === 'Auto' ? 'Auto Cycle' : preset.split(' / ')[0];
                    return (
                      <button
                        key={preset}
                        type="button"
                        data-testid={`preset-expr-${shortLabel
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                        onClick={() => {
                          if (!isDemoMode && !isRunning) {
                            onStartDemoMode();
                          }
                          onSelectDemoPreset(preset);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                          isSelected && isDemoMode
                            ? 'bg-violet-700 dark:bg-violet-500 text-white dark:text-slate-950 border-violet-700 dark:border-violet-400 font-semibold'
                            : 'bg-white dark:bg-[#1B1726] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#2E2740] hover:border-violet-500 dark:hover:border-violet-400'
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Column 2 (6 cols): Real-Time Facial Action-Unit (FACS) Bars */}
            <div className="lg:col-span-6 bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded-lg p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Facial Action-Unit (FACS) Activation
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    0–100% Scale
                  </span>
                </div>

                <div className="space-y-2.5">
                  {actionUnitRows.map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-xs font-mono mb-1">
                        <span className="text-slate-700 dark:text-slate-300 truncate pr-2">
                          {row.label}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                          {faceBiometrics.isTracking ? `${row.value}%` : '0%'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-[#231E30] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${row.barClass}`}
                          style={{
                            width: `${
                              faceBiometrics.isTracking ? row.value : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-[#2E2740] flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span>Blendshapes + 3D Mesh Geometry</span>
                <span>Updated @ 6 Hz</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HOW RPPG WORKS (4 SHORT STEPS) */}
      {activeTab === 'pipeline' && (
        <div className="p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-[#2E2740]">
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
            {PIPELINE_STEPS.map((step) => (
              <div
                key={step.num}
                className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-4"
              >
                <h3 className="text-xs font-semibold text-violet-700 dark:text-violet-300 font-mono mb-2">
                  {step.num}
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
