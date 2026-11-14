import React from 'react';
import { HRVMetrics } from '../types/rppg';

interface HrvPanelProps {
  hrv: HRVMetrics;
  isDemoMode: boolean;
  onUnlock2MinDemo?: () => void;
}

export const HrvPanel: React.FC<HrvPanelProps> = ({
  hrv,
  isDemoMode,
  onUnlock2MinDemo,
}) => {
  const fmt = (val: number | null, digits = 1) =>
    val !== null && Number.isFinite(val) ? val.toFixed(digits) : '—';

  return (
    <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 shadow-xs transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Heart Rate Variability (HRV) &amp; Autonomic Metrics
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Requires ≥ 30 s buffer and ≥ 15 clean beats · Current:{' '}
            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
              {hrv.durationSec.toFixed(0)} s / {hrv.cleanBeatCount} clean beats
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDemoMode && hrv.lfHfStatus === 'needs 2+ min' && onUnlock2MinDemo && (
            <button
              type="button"
              onClick={onUnlock2MinDemo}
              className="px-2.5 py-1 text-xs font-medium text-violet-800 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/60 border border-violet-300 dark:border-violet-700/70 rounded hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Simulate 2+ Min Buffer (LF/HF)
            </button>
          )}
          <span
            className={`text-xs font-mono font-semibold ${
              hrv.isReady
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {hrv.isReady
              ? '● HRV Calibrated'
              : `▲ ${hrv.reason || 'Calibrating (needs 30 s)'}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Mean IBI */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Mean IBI
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {fmt(hrv.meanIbi, 0)}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
              ms
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            NN interval mean
          </div>
        </div>

        {/* Card 2: SDNN */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            SDNN
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-mono font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
              {fmt(hrv.sdnn, 1)}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
              ms
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            Global HRV std
          </div>
        </div>

        {/* Card 3: RMSSD */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            RMSSD
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-mono font-semibold text-fuchsia-700 dark:text-fuchsia-300 tabular-nums">
              {fmt(hrv.rmssd, 1)}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
              ms
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            Vagal tone index
          </div>
        </div>

        {/* Card 4: pNN50 */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            pNN50
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-mono font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
              {fmt(hrv.pnn50, 1)}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
              %
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            |ΔIBI| &gt; 50 ms
          </div>
        </div>

        {/* Card 5: LF/HF Ratio */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            LF / HF Ratio
          </div>
          <div className="flex items-baseline">
            {hrv.lfHfStatus === 'ready' && hrv.lfHf !== null ? (
              <>
                <span className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {hrv.lfHf.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
                  ratio
                </span>
              </>
            ) : (
              <span className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 py-1">
                needs 2+ min
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            0.04–0.15 / 0.15–0.4 Hz
          </div>
        </div>

        {/* Card 6: Experimental Respiration + Poincare SD1/SD2 */}
        <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Respiration (Exp.)
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {fmt(hrv.respirationBpm, 1)}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1">
              br/min
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            SD1/SD2: {fmt(hrv.sd1, 0)}/{fmt(hrv.sd2, 0)} ms
          </div>
        </div>
      </div>
    </div>
  );
};
