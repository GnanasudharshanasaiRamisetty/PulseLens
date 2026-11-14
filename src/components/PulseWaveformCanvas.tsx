import React, { useEffect, useRef } from 'react';
import { DetectedBeat, RppgAlgorithm } from '../types/rppg';

interface PulseWaveformCanvasProps {
  timestamps: number[];
  values: number[];
  beats: DetectedBeat[];
  algorithm: RppgAlgorithm;
  isActive: boolean;
  theme?: 'dark' | 'light';
}

export const PulseWaveformCanvas: React.FC<PulseWaveformCanvasProps> = ({
  timestamps,
  values,
  beats,
  algorithm,
  isActive,
  theme = 'dark',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = theme === 'dark';
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    const height = Math.max(170, rect.height);

    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Theme-aware background (Deep Velvet Onyx in dark mode)
    ctx.fillStyle = isDark ? '#14111D' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 42;
    const padRight = 16;
    const padTop = 18;
    const padBottom = 26;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Subtle scientific grid lines
    ctx.strokeStyle = isDark
      ? 'rgba(139, 92, 246, 0.16)'
      : 'rgba(203, 213, 225, 0.85)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    // Vertical 1-second grid lines (10s window)
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = isDark ? '#A78BFA' : '#475569';
    ctx.textAlign = 'center';
    for (let sec = 0; sec <= 10; sec += 2) {
      const x = padLeft + (plotW * sec) / 10;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.fillText(`-${10 - sec}s`, x, height - 8);
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    ctx.fillText('+2σ', padLeft - 6, padTop + 4);
    ctx.fillText('0', padLeft - 6, padTop + plotH / 2 + 3);
    ctx.fillText('-2σ', padLeft - 6, padTop + plotH);

    if (values.length < 4 || timestamps.length !== values.length) {
      ctx.fillStyle = isDark ? '#C4B5FD' : '#475569';
      ctx.textAlign = 'center';
      ctx.font = '500 12px "IBM Plex Sans", sans-serif';
      ctx.fillText(
        isActive
          ? 'Acquiring optical pulse waveform...'
          : 'Start Camera or Demo Mode to view real-time 10 s rPPG pulse waveform',
        padLeft + plotW / 2,
        padTop + plotH / 2
      );
      ctx.restore();
      return;
    }

    const tMax = timestamps[timestamps.length - 1];
    const tMin = tMax - 10_000;

    // Determine dynamic amplitude range
    let maxAbs = 0.5;
    for (let i = 0; i < values.length; i++) {
      const a = Math.abs(values[i]);
      if (a > maxAbs) maxAbs = a;
    }
    maxAbs *= 1.18;

    const mapX = (t: number) =>
      padLeft + Math.max(0, Math.min(1, (t - tMin) / 10_000)) * plotW;
    const mapY = (v: number) =>
      padTop + plotH / 2 - (v / maxAbs) * (plotH / 2);

    // Draw vertical beat fiduciary lines and markers
    for (const beat of beats) {
      if (beat.timestamp < tMin || beat.timestamp > tMax) continue;
      const bx = mapX(beat.timestamp);
      const by = mapY(beat.amplitude);

      ctx.strokeStyle = isDark
        ? 'rgba(251, 191, 36, 0.35)'
        : 'rgba(225, 29, 72, 0.32)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, padTop);
      ctx.lineTo(bx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Beat peak circle (Warm Amber-Gold in dark mode, Coral Rose in light mode)
      ctx.fillStyle = isDark ? '#FBBF24' : '#E11D48';
      ctx.beginPath();
      ctx.arc(bx, by, 3.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDark ? '#14111D' : '#FFFFFF';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Subtle area fill under waveform
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = mapX(timestamps[i]);
      const y = mapY(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(mapX(timestamps[timestamps.length - 1]), padTop + plotH / 2);
    ctx.lineTo(mapX(timestamps[0]), padTop + plotH / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    if (isDark) {
      grad.addColorStop(0, 'rgba(192, 132, 252, 0.28)');
      grad.addColorStop(0.5, 'rgba(192, 132, 252, 0.05)');
      grad.addColorStop(1, 'rgba(192, 132, 252, 0.0)');
    } else {
      grad.addColorStop(0, 'rgba(124, 58, 237, 0.22)');
      grad.addColorStop(0.5, 'rgba(124, 58, 237, 0.04)');
      grad.addColorStop(1, 'rgba(124, 58, 237, 0.0)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Main pulse waveform line (Electric Bio-Violet in dark mode)
    ctx.strokeStyle = isDark ? '#C084FC' : '#6D28D9';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = mapX(timestamps[i]);
      const y = mapY(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
  }, [timestamps, values, beats, algorithm, isActive, theme]);

  return (
    <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 shadow-xs transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Filtered rPPG Pulse Waveform (10 s Rolling Window)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Zero-phase 3rd-order Butterworth bandpass (0.7–4.0 Hz) · Algorithm: {algorithm}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-violet-700 dark:bg-violet-400" />
            Pulse ({algorithm})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-600 dark:bg-amber-400" />
            Systolic Peaks ({beats.length})
          </span>
        </div>
      </div>
      <div className="relative w-full h-44">
        <canvas
          ref={canvasRef}
          data-testid="pulse-waveform-canvas"
          className="w-full h-full block rounded border border-slate-200 dark:border-[#2E2740]"
        />
      </div>
    </div>
  );
};
