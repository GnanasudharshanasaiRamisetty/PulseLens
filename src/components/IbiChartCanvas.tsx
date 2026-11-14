import React, { useEffect, useRef } from 'react';
import { IBIPoint } from '../types/rppg';

interface IbiChartCanvasProps {
  ibiSeries: IBIPoint[];
  meanIbi: number | null;
  theme?: 'dark' | 'light';
}

export const IbiChartCanvas: React.FC<IbiChartCanvasProps> = ({
  ibiSeries,
  meanIbi,
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
    const height = Math.max(150, rect.height);

    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = isDark ? '#14111D' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 48;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 24;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Grid lines
    ctx.strokeStyle = isDark
      ? 'rgba(139, 92, 246, 0.16)'
      : 'rgba(203, 213, 225, 0.85)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padTop + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    if (ibiSeries.length < 2) {
      ctx.fillStyle = isDark ? '#C4B5FD' : '#475569';
      ctx.textAlign = 'center';
      ctx.font = '500 12px "IBM Plex Sans", sans-serif';
      ctx.fillText(
        'Waiting for clean consecutive systolic peaks to plot IBI tachogram...',
        padLeft + plotW / 2,
        padTop + plotH / 2
      );
      ctx.restore();
      return;
    }

    const recentIbis = ibiSeries.slice(-60);
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const pt of recentIbis) {
      if (pt.ibiMs < minVal) minVal = pt.ibiMs;
      if (pt.ibiMs > maxVal) maxVal = pt.ibiMs;
    }

    const center = meanIbi ?? 0.5 * (minVal + maxVal);
    const halfSpan = Math.max(
      60,
      Math.max(center - minVal, maxVal - center) * 1.25
    );
    const yMin = Math.max(300, Math.round(center - halfSpan));
    const yMax = Math.min(1500, Math.round(center + halfSpan));

    const tMin = recentIbis[0].relativeSec;
    const tMax = Math.max(
      tMin + 1,
      recentIbis[recentIbis.length - 1].relativeSec
    );

    // Y-axis ticks (ms)
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = isDark ? '#A78BFA' : '#475569';
    ctx.textAlign = 'right';
    ctx.fillText(`${yMax}ms`, padLeft - 6, padTop + 4);
    ctx.fillText(
      `${Math.round(0.5 * (yMin + yMax))}ms`,
      padLeft - 6,
      padTop + plotH / 2 + 3
    );
    ctx.fillText(`${yMin}ms`, padLeft - 6, padTop + plotH);

    // X-axis time span
    ctx.textAlign = 'left';
    ctx.fillText(`${tMin.toFixed(0)}s`, padLeft, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${tMax.toFixed(0)}s`, padLeft + plotW, height - 6);

    const mapX = (sec: number) =>
      padLeft + ((sec - tMin) / (tMax - tMin)) * plotW;
    const mapY = (ms: number) =>
      padTop + plotH - ((ms - yMin) / Math.max(1, yMax - yMin)) * plotH;

    // Mean IBI reference line
    if (meanIbi !== null && meanIbi >= yMin && meanIbi <= yMax) {
      const my = mapY(meanIbi);
      ctx.strokeStyle = isDark
        ? 'rgba(251, 191, 36, 0.55)'
        : 'rgba(217, 119, 6, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, my);
      ctx.lineTo(padLeft + plotW, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // IBI line path (Emerald / Bio-Violet)
    ctx.strokeStyle = isDark ? '#34D399' : '#7C3AED';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < recentIbis.length; i++) {
      const x = mapX(recentIbis[i].relativeSec);
      const y = mapY(recentIbis[i].ibiMs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Individual beat points
    ctx.fillStyle = isDark ? '#FBBF24' : '#6D28D9';
    for (let i = 0; i < recentIbis.length; i++) {
      const x = mapX(recentIbis[i].relativeSec);
      const y = mapY(recentIbis[i].ibiMs);
      ctx.beginPath();
      ctx.arc(x, y, 2.75, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [ibiSeries, meanIbi, theme]);

  return (
    <div className="bg-white dark:bg-[#1B1726] border border-slate-300 dark:border-[#2E2740] rounded-lg p-4 shadow-xs transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Inter-Beat Interval (IBI) Tachogram
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Parabolically interpolated peak-to-peak intervals (300–1500 ms, ±25% median outlier rejection)
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
          Clean Intervals:{' '}
          <span className="text-violet-700 dark:text-violet-300 font-semibold">
            {ibiSeries.length}
          </span>
        </div>
      </div>
      <div className="relative w-full h-36">
        <canvas
          ref={canvasRef}
          data-testid="ibi-chart-canvas"
          className="w-full h-full block rounded border border-slate-200 dark:border-[#2E2740]"
        />
      </div>
    </div>
  );
};
