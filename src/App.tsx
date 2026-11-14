/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  CameraOff,
  Download,
  FileText,
  Heart,
  Moon,
  Play,
  RotateCcw,
  Smile,
  Sun,
  UserCheck,
} from 'lucide-react';
import { BottomTabsPanel } from './components/BottomTabsPanel';
import { HrvPanel } from './components/HrvPanel';
import { IbiChartCanvas } from './components/IbiChartCanvas';
import { PulseWaveformCanvas } from './components/PulseWaveformCanvas';
import { ReportModal } from './components/ReportModal';
import { usePulseMonitor } from './hooks/usePulseMonitor';
import { RppgAlgorithm, SignalQualityLabel } from './types/rppg';
import {
  downloadPdfReport,
  FullReportPayload,
  generateFullReportData,
} from './utils/reportGenerator';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('pulselens-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage access errors
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('pulselens-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const {
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
  } = usePulseMonitor();

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatedReport, setGeneratedReport] =
    useState<FullReportPayload | null>(null);

  const handleGenerateFullReport = () => {
    const payload = generateFullReportData({
      isDemoMode,
      algorithm,
      windowSec,
      latestRGB,
      analysis,
      readingsLog,
    });
    setGeneratedReport(payload);
    setIsReportModalOpen(true);
  };

  // If the modal was opened with empty readings and the user clicked "Load 72 BPM Demo & Generate",
  // update the snapshot once analysis.bpm becomes available.
  useEffect(() => {
    if (
      isReportModalOpen &&
      generatedReport &&
      generatedReport.analysis.bpm === null &&
      analysis.bpm !== null
    ) {
      setGeneratedReport(
        generateFullReportData({
          isDemoMode,
          algorithm,
          windowSec,
          latestRGB,
          analysis,
          readingsLog,
        })
      );
    }
  }, [
    isReportModalOpen,
    generatedReport,
    analysis,
    isDemoMode,
    algorithm,
    windowSec,
    latestRGB,
    readingsLog,
  ]);

  const isRunning = isCameraActive || isDemoMode;

  const formatStatusText = (): { text: string; toneClass: string } => {
    if (isLoadingModel) {
      return {
        text: '▲ Loading MediaPipe FaceLandmarker...',
        toneClass: 'text-amber-700 dark:text-amber-300',
      };
    }
    if (trackingStatus === 'demo') {
      return {
        text: '● Tracking (Demo)',
        toneClass: 'text-emerald-700 dark:text-emerald-300',
      };
    }
    if (!isCameraActive) {
      return {
        text: '○ Standby',
        toneClass: 'text-slate-600 dark:text-slate-400',
      };
    }
    if (trackingStatus === 'no_face' || !faceDetected) {
      return {
        text: '✖ No face',
        toneClass: 'text-rose-700 dark:text-rose-400',
      };
    }
    if (trackingStatus === 'collecting') {
      const sec = Math.min(8, Math.floor(analysis.bufferDurationSec));
      return {
        text: `▲ Collecting data ${sec}/8 s`,
        toneClass: 'text-amber-700 dark:text-amber-300',
      };
    }
    return {
      text: '● Tracking',
      toneClass: 'text-emerald-700 dark:text-emerald-300',
    };
  };

  const sqiTone = (label: SignalQualityLabel) => {
    if (label === 'Good') return 'text-emerald-700 dark:text-emerald-300';
    if (label === 'Fair') return 'text-amber-700 dark:text-amber-300';
    return 'text-rose-700 dark:text-rose-400';
  };

  const statusInfo = formatStatusText();

  // Compute dynamic pulse animation duration from BPM estimate
  const heartBeatDurationSec =
    analysis.bpm && analysis.bpm >= 40 && analysis.bpm <= 220
      ? 60 / analysis.bpm
      : 0.85;

  return (
    <div className="min-h-screen bg-[#F1F5F9] dark:bg-[#12101B] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-300 dark:border-[#2E2740] bg-white dark:bg-[#161320] transition-colors">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          PulseLens
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <a
            href="#monitor-workspace"
            className="hover:text-violet-700 dark:hover:text-violet-300 transition-colors whitespace-nowrap shrink-0"
          >
            Live Monitor
          </a>
          <a
            href="#waveform-section"
            className="hover:text-violet-700 dark:hover:text-violet-300 transition-colors whitespace-nowrap shrink-0"
          >
            Pulse Waveform
          </a>
          <a
            href="#hrv-section"
            className="hover:text-violet-700 dark:hover:text-violet-300 transition-colors whitespace-nowrap shrink-0"
          >
            HRV Metrics
          </a>
          <a
            href="#down-tab-section"
            className="hover:text-violet-700 dark:hover:text-violet-300 transition-colors whitespace-nowrap shrink-0"
          >
            Live Expressions
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark'
                ? 'Switch to High-Contrast Light Mode'
                : 'Switch to Dark Mode'
            }
            data-testid="theme-toggle-button"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#3B3252] bg-slate-100 dark:bg-[#221D30] text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-[#2C253E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>High-Contrast Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-violet-700" />
                <span>Obsidian Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main
        id="monitor-workspace"
        className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5"
      >
        {/* Title, Subtitle, Guidance, and Clinical Disclaimer */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-300 dark:border-[#2E2740]">
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-slate-400 mb-1">
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                Contactless heart rate and HRV from your webcam
              </span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">
                · Screening/demo tool, not a medical device.
              </span>
              <span>· 100% In-Browser DSP (Video Never Leaves Device)</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              Face the camera in even light, stay still, do not talk. BPM stabilises after about 15 s, HRV after 30 s.
            </p>
          </div>

          {/* Primary Instrumentation Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isCameraActive ? (
              <button
                type="button"
                onClick={stopAllStreams}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 rounded hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CameraOff className="w-3.5 h-3.5" />
                Stop Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                disabled={isLoadingModel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-violet-400 rounded hover:bg-violet-800 dark:hover:bg-violet-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                {isLoadingModel ? 'Loading Model...' : 'Start Camera'}
              </button>
            )}

            <button
              type="button"
              onClick={() => (isDemoMode ? stopAllStreams() : startDemoMode(36))}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isDemoMode
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-600 dark:border-emerald-500/70 text-emerald-800 dark:text-emerald-300'
                  : 'bg-white dark:bg-[#1B1726] border-slate-300 dark:border-[#3B3252] text-slate-800 dark:text-slate-200 hover:border-violet-600 dark:hover:border-violet-400 hover:text-violet-700 dark:hover:text-violet-300'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              {isDemoMode ? 'Stop Demo Mode' : 'Demo Mode (72 BPM)'}
            </button>

            <button
              type="button"
              onClick={resetReadings}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded hover:bg-slate-100 dark:hover:bg-[#251F33] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>

            <button
              type="button"
              onClick={handleGenerateFullReport}
              data-testid="generate-full-report-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-fuchsia-700 dark:bg-amber-400 border border-fuchsia-800 dark:border-amber-300 rounded hover:bg-fuchsia-800 dark:hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Generate Full Report (PDF)
            </button>

            <button
              type="button"
              onClick={() => {
                const payload = generateFullReportData({
                  isDemoMode,
                  algorithm,
                  windowSec,
                  latestRGB,
                  analysis,
                  readingsLog,
                });
                downloadPdfReport(payload);
              }}
              disabled={analysis.bpm === null}
              data-testid="toolbar-download-pdf-btn"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-violet-800 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/60 border border-violet-500/50 dark:border-violet-500/50 rounded hover:bg-violet-100 dark:hover:bg-violet-900/60 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report (PDF)
            </button>

            <button
              type="button"
              onClick={downloadReadingsCsv}
              disabled={readingsLog.length === 0 && analysis.bpm === null}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded hover:bg-slate-100 dark:hover:bg-[#251F33] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download readings (CSV)
            </button>
          </div>
        </div>

        {/* DSP Parameter Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-3 px-4 my-4 bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg items-center shadow-xs transition-colors">
          {/* Algorithm Selector */}
          <div className="flex items-center justify-between md:justify-start gap-3 min-w-0">
            <label
              htmlFor="algorithm-select"
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              rPPG Algorithm:
            </label>
            <select
              id="algorithm-select"
              aria-label="rPPG Algorithm"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as RppgAlgorithm)}
              className="bg-slate-50 dark:bg-[#14111D] border border-slate-300 dark:border-[#3B3252] text-slate-900 dark:text-slate-100 text-xs font-mono rounded px-3 py-1.5 min-w-0 flex-1 md:flex-initial max-w-full truncate focus:outline-none focus:border-violet-600 dark:focus:border-violet-400"
            >
              <option value="POS">POS (Plane-Orthogonal-to-Skin)</option>
              <option value="CHROM">CHROM (Chrominance Projection)</option>
              <option value="GREEN">GREEN (Inverted Green Baseline)</option>
            </select>
          </div>

          {/* BPM Window Slider (8-30 s) */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="bpm-window-slider"
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
            >
              FFT Window:
            </label>
            <input
              id="bpm-window-slider"
              aria-label="BPM Window Slider"
              type="range"
              min={8}
              max={30}
              step={1}
              value={windowSec}
              onChange={(e) => setWindowSec(Number(e.target.value))}
              className="w-full accent-violet-600 dark:accent-violet-400 cursor-pointer"
            />
            <span className="text-xs font-mono font-semibold text-violet-700 dark:text-violet-300 tabular-nums w-10 text-right shrink-0">
              {windowSec} s
            </span>
          </div>

          {/* Compare All Algorithms Toggle */}
          <div className="flex items-center justify-between md:justify-end gap-3">
            <label
              htmlFor="compare-all-toggle"
              className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap"
            >
              <input
                id="compare-all-toggle"
                type="checkbox"
                checked={compareAll}
                onChange={(e) => setCompareAll(e.target.checked)}
                className="w-4 h-4 accent-violet-600 dark:accent-violet-400 rounded cursor-pointer"
              />
              <span>Compare all algorithms</span>
            </label>
          </div>
        </div>

        {/* Error Alert Banner (Camera Permission / Missing Camera / Model Load Failure) */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                  Optical Sensor / Model Alert
                </h2>
                <p className="text-xs text-rose-800 dark:text-rose-300/90 mt-0.5">
                  {errorMessage}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => startDemoMode(36)}
                className="px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-violet-400 rounded hover:bg-violet-800 dark:hover:bg-violet-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                Launch 72 BPM Demo Mode
              </button>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Main Asymmetric 2-Column Split Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN (5 cols): Mirrored Video + ROI Overlay + Telemetry + Live Expression/Age Quick Card + Algorithm Comparison */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 shadow-xs transition-colors">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    Optical ROI Viewport (Mirrored)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    Forehead &amp; Malar Cheek ROIs · YCrCb Skin Filter
                  </p>
                </div>

                {/* Status Readout (No face / Collecting data x/8 s / Tracking) */}
                <div
                  data-testid="tracking-status"
                  className={`text-xs font-mono font-semibold whitespace-nowrap shrink-0 ${statusInfo.toneClass}`}
                >
                  {statusInfo.text}
                </div>
              </div>

              {/* Video + Mirrored ROI Overlay Canvas */}
              <div className="relative w-full aspect-[4/3] max-h-[340px] bg-slate-100 dark:bg-[#14111D] rounded border border-slate-300 dark:border-[#2E2740] overflow-hidden flex items-center justify-center">
                {/* Hidden underlying video element for MediaPipe & frame grab */}
                <video ref={videoRef} playsInline muted className="hidden" />

                {/* Mirrored Preview Canvas */}
                <canvas
                  ref={previewCanvasRef}
                  width={640}
                  height={480}
                  data-testid="roi-preview-canvas"
                  className={`w-full h-full object-cover ${
                    isRunning ? 'block' : 'hidden'
                  }`}
                />

                {!isRunning && (
                  <div className="flex flex-col items-center justify-center text-center p-6 max-w-sm">
                    <Camera className="w-8 h-8 text-violet-600 dark:text-violet-400 mb-3" />
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      Optical Viewport Standby
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                      Click &ldquo;Start Camera&rdquo; for live contactless webcam rPPG tracking, or run &ldquo;Demo Mode&rdquo; to inspect a calibrated 72 BPM synthetic signal.
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-violet-700 dark:bg-violet-400 rounded hover:bg-violet-800 dark:hover:bg-violet-300 transition-colors cursor-pointer"
                      >
                        Start Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => startDemoMode(36)}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-[#221D30] border border-slate-300 dark:border-[#3B3252] rounded hover:bg-slate-100 dark:hover:bg-[#2C253E] transition-colors cursor-pointer"
                      >
                        Run Demo Mode
                      </button>
                    </div>
                  </div>
                )}

                {/* HUD Overlay Scrim at bottom of video */}
                {isRunning && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#12101B]/90 via-[#12101B]/60 to-transparent px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-100">
                    <span>
                      FPS: {analysis.measuredFps.toFixed(1)} Hz · Buffer:{' '}
                      {analysis.bufferDurationSec.toFixed(1)}/120 s
                    </span>
                    <span>
                      {isDemoMode
                        ? 'Synthetic Phantom'
                        : `MediaPipe (${modelDelegate || 'GPU'})`}
                    </span>
                  </div>
                )}
              </div>

              {/* Raw RGB & Skin Pass Telemetry Bar */}
              <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-[#2E2740] text-xs font-mono">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    MEAN R
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                    {latestRGB ? latestRGB.r.toFixed(1) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    MEAN G
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                    {latestRGB ? latestRGB.g.toFixed(1) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    MEAN B
                  </span>
                  <span className="text-sky-700 dark:text-sky-400 font-semibold tabular-nums">
                    {latestRGB ? latestRGB.b.toFixed(1) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    SKIN PASS
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 font-semibold tabular-nums">
                    {latestRGB
                      ? `${Math.round(latestRGB.skinRatio * 100)}%`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Compact Live Facial Expression Strip below the camera */}
              <div
                data-testid="camera-face-biometrics-strip"
                className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-[#2E2740]"
              >
                <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-2.5 flex items-center gap-2.5">
                  <Smile className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
                      LIVE EXPRESSION
                    </span>
                    <span
                      data-testid="strip-expression-value"
                      className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 truncate block"
                    >
                      {faceBiometrics.isTracking
                        ? faceBiometrics.expression
                        : 'Standby'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-[#14111D] border border-slate-200 dark:border-[#2E2740] rounded p-2.5 flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
                      ARTIFACT RISK
                    </span>
                    <span
                      data-testid="strip-artifact-value"
                      className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate block"
                    >
                      {faceBiometrics.isTracking
                        ? `${faceBiometrics.motionArtifactRisk} (${faceBiometrics.expressionConfidence}% conf)`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Algorithm Comparison Table (Shown when "Compare all algorithms" toggle is active) */}
            {compareAll && (
              <div
                data-testid="algorithm-comparison-table"
                className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 shadow-xs transition-colors"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Multi-Algorithm Comparison (Same RGB Buffer)
                  </h2>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                    Window: {windowSec} s
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#2E2740] text-slate-600 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">Algorithm</th>
                        <th className="py-2 px-3 font-medium text-right">
                          Est. BPM
                        </th>
                        <th className="py-2 px-3 font-medium text-right">
                          SQI Score
                        </th>
                        <th className="py-2 pl-3 font-medium text-right">
                          Quality
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#2E2740]">
                      {(['POS', 'CHROM', 'GREEN'] as RppgAlgorithm[]).map(
                        (algo) => {
                          const item = analysis.comparison?.[algo];
                          const isSelected = algo === algorithm;
                          return (
                            <tr
                              key={algo}
                              className={
                                isSelected
                                  ? 'bg-violet-50/80 dark:bg-violet-950/35 text-slate-900 dark:text-slate-100'
                                  : 'text-slate-700 dark:text-slate-300'
                              }
                            >
                              <td className="py-2 pr-3 font-semibold">
                                {algo}
                                {isSelected && (
                                  <span className="ml-2 text-[10px] text-violet-700 dark:text-violet-300 font-normal">
                                    (active)
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                {item && item.bpm !== null
                                  ? `${item.bpm.toFixed(1)} BPM`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {item ? item.sqi.toFixed(2) : '0.00'}
                              </td>
                              <td
                                className={`py-2 pl-3 text-right font-semibold ${
                                  item
                                    ? sqiTone(item.sqiLabel)
                                    : 'text-slate-500'
                                }`}
                              >
                                {item ? item.sqiLabel : 'Poor'}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (7 cols): Primary BPM & SQI Readout + 10s Waveform + HRV Cards + IBI Chart */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Primary Vital Readout Panel */}
            <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center shadow-xs transition-colors">
              {/* Large BPM Value + Gently Pulsing Heart Icon */}
              <div className="sm:col-span-1 flex items-center gap-4 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-[#2E2740] pb-3 sm:pb-0 sm:pr-4">
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center">
                  <Heart
                    className={`w-7 h-7 text-rose-600 dark:text-rose-400 fill-rose-600/85 dark:fill-rose-400/80 transition-transform ${
                      analysis.bpm !== null ? 'animate-pulse' : 'opacity-40'
                    }`}
                    style={
                      analysis.bpm !== null
                        ? {
                            animationDuration: `${heartBeatDurationSec.toFixed(2)}s`,
                          }
                        : undefined
                    }
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    Heart Rate (Median of 5)
                  </div>
                  <div className="flex items-baseline mt-0.5">
                    <span
                      data-testid="bpm-value"
                      className="text-4xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight"
                    >
                      {analysis.bpm !== null ? Math.round(analysis.bpm) : '—'}
                    </span>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400 ml-1.5">
                      BPM
                    </span>
                  </div>
                  {analysis.bpm !== null && (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Exact: {analysis.bpm.toFixed(1)} BPM
                    </div>
                  )}
                </div>
              </div>

              {/* Signal Quality Index (SQI) Readout */}
              <div className="sm:col-span-1 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-[#2E2740] pb-3 sm:pb-0 sm:pr-4">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                  <span className="font-medium">Signal Quality Index</span>
                  <span
                    data-testid="sqi-label"
                    className={`font-mono font-semibold ${sqiTone(
                      analysis.sqiLabel
                    )}`}
                  >
                    ● {analysis.sqiLabel}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {(analysis.sqi * 100).toFixed(0)}
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                      %
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    SQI: {analysis.sqi.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-[#14111D] rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all duration-300 ${
                      analysis.sqiLabel === 'Good'
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : analysis.sqiLabel === 'Fair'
                        ? 'bg-amber-500 dark:bg-amber-400'
                        : 'bg-rose-600 dark:bg-rose-500'
                    }`}
                    style={{ width: `${Math.round(analysis.sqi * 100)}%` }}
                  />
                </div>
              </div>

              {/* Spectral & Window Summary */}
              <div className="sm:col-span-1 flex flex-col justify-between text-xs font-mono">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400">
                    Active Method:
                  </span>
                  <span className="text-violet-700 dark:text-violet-300 font-semibold">
                    {algorithm}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400">
                    Instant Peak:
                  </span>
                  <span className="text-slate-900 dark:text-slate-200 font-medium tabular-nums">
                    {analysis.instantBpm !== null
                      ? `${analysis.instantBpm.toFixed(1)} BPM`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600 dark:text-slate-400">
                    Logged Rows:
                  </span>
                  <span className="text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
                    {readingsLog.length}
                  </span>
                </div>
              </div>
            </div>

            {/* 10s Scrolling Pulse Waveform with Detected Beats Marked */}
            <div id="waveform-section">
              <PulseWaveformCanvas
                timestamps={analysis.waveformTimestamps}
                values={analysis.waveformValues}
                beats={analysis.waveformBeats}
                algorithm={algorithm}
                isActive={isRunning}
                theme={theme}
              />
            </div>

            {/* HRV Metrics Cards */}
            <div id="hrv-section">
              <HrvPanel
                hrv={analysis.hrv}
                isDemoMode={isDemoMode}
                onUnlock2MinDemo={fillDemo2MinBuffer}
              />
            </div>

            {/* IBI Line Chart */}
            <IbiChartCanvas
              ibiSeries={analysis.ibiSeries}
              meanIbi={analysis.hrv.meanIbi}
              theme={theme}
            />
          </div>
        </div>

        {/* Bottom Tabbed Panel ("Down Tab"): Live Facial Expressions, Approximate Age & How rPPG Works */}
        <BottomTabsPanel
          faceBiometrics={faceBiometrics}
          isDemoMode={isDemoMode}
          isRunning={isRunning}
          demoExpressionPreset={demoExpressionPreset}
          onSelectDemoPreset={setDemoExpressionPreset}
          onStartDemoMode={() => startDemoMode(36)}
        />
      </main>

      <footer className="border-t border-slate-300 dark:border-[#2E2740] bg-white dark:bg-[#161320] px-6 py-4 mt-8 transition-colors">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-violet-700 dark:text-violet-400" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              PulseLens — Client-side rPPG Photoplethysmography Monitor
            </span>
          </div>
          <div>
            Screening/demo tool, not a medical device. All video frames are processed locally in your browser.
          </div>
        </div>
      </footer>

      <ReportModal
        isOpen={isReportModalOpen}
        report={generatedReport}
        onClose={() => setIsReportModalOpen(false)}
        onDownloadCsv={downloadReadingsCsv}
        onStartDemoAndRegenerate={() => {
          startDemoMode(36);
        }}
      />
    </div>
  );
}
