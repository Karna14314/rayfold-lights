import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ClientPuzzle } from '../../shared/api.ts';
import {
  cellCol,
  cellIndex,
  cellRow,
  traceRays,
} from '../../shared/rayfold/raycaster.ts';
import { GRID_SIZE } from '../../shared/rayfold/types.ts';
import type {
  BeamColor,
  MirrorMap,
  MirrorPlacement,
  MirrorType,
  Segment,
  TraceResult,
} from '../../shared/rayfold/types.ts';

export type OpticalCanvasProps = {
  puzzle: ClientPuzzle;
  mirrors: MirrorMap;
  interactive?: boolean | undefined;
  solvedToday?: boolean | undefined;
  showParGhost?: boolean | undefined;
  showHeatmap?: boolean | undefined;
  showOnboarding?: boolean | undefined;
  celebrating?: boolean | undefined;
  parSolution?: readonly MirrorPlacement[] | undefined;
  heatmap?: Record<number, number> | undefined;
  hintIndex?: number | null | undefined;
  className?: string | undefined;
  onCellTap?: ((index: number, next: MirrorType | null) => void) | undefined;
  onBudgetExceeded?: (() => void) | undefined;
  onReady?: (() => void) | undefined;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type FrameState = {
  puzzle: ClientPuzzle;
  mirrors: MirrorMap;
  trace: TraceResult;
  showParGhost: boolean;
  showHeatmap: boolean;
  showOnboarding: boolean;
  celebrating: boolean;
  parSolution: readonly MirrorPlacement[];
  heatmap: Record<number, number>;
  hintIndex: number | null;
};

const BOARD_BG = '#0B1018';
const CELL_BG = '#131B29';

const EMPTY_PLACEMENTS: readonly MirrorPlacement[] = [];
const EMPTY_HEATMAP: Record<number, number> = {};
const BEAM_COLORS: Record<BeamColor, string> = {
  amber: '#F5A623',
  cyan: '#22D3EE',
  magenta: '#F472B6',
};

const BEAM_CORES: Record<BeamColor, string> = {
  amber: '#FFE7B5',
  cyan: '#CFFAFE',
  magenta: '#FCE7F3',
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function chamferPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): void {
  const half = size / 2;
  const cut = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - half + cut, cy - half);
  ctx.lineTo(cx + half - cut, cy - half);
  ctx.lineTo(cx + half, cy - half + cut);
  ctx.lineTo(cx + half, cy + half - cut);
  ctx.lineTo(cx + half - cut, cy + half);
  ctx.lineTo(cx - half + cut, cy + half);
  ctx.lineTo(cx - half, cy + half - cut);
  ctx.lineTo(cx - half, cy - half + cut);
  ctx.closePath();
}

function centerOf(index: number, cell: number): { x: number; y: number } {
  return {
    x: (cellCol(index) + 0.5) * cell,
    y: (cellRow(index) + 0.5) * cell,
  };
}

function drawBase(
  ctx: CanvasRenderingContext2D,
  size: number,
  puzzle: ClientPuzzle
): void {
  const cell = size / GRID_SIZE;
  const gap = Math.max(1, cell * 0.016);

  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, size, size);

  const wash = ctx.createRadialGradient(
    size * 0.5,
    size * 0.42,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.72
  );
  wash.addColorStop(0, 'rgba(27, 42, 67, 0.42)');
  wash.addColorStop(1, 'rgba(7, 11, 18, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = col * cell + gap;
      const y = row * cell + gap;
      const w = cell - gap * 2;
      const h = cell - gap * 2;
      const radius = Math.max(2, cell * 0.055);

      roundedRect(ctx, x, y, w, h, radius);
      ctx.fillStyle = CELL_BG;
      ctx.fill();
      ctx.lineWidth = Math.max(0.5, cell * 0.012);
      ctx.strokeStyle = 'rgba(34, 48, 71, 0.88)';
      ctx.stroke();

      const tick = Math.max(2, cell * 0.12);
      const tickInset = Math.max(3, cell * 0.12);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = Math.max(0.6, cell * 0.012);
      ctx.beginPath();
      ctx.moveTo(x + tickInset, y + tickInset + tick);
      ctx.lineTo(x + tickInset, y + tickInset);
      ctx.lineTo(x + tickInset + tick, y + tickInset);
      ctx.moveTo(x + w - tickInset - tick, y + tickInset);
      ctx.lineTo(x + w - tickInset, y + tickInset);
      ctx.lineTo(x + w - tickInset, y + tickInset + tick);
      ctx.moveTo(x + tickInset, y + h - tickInset - tick);
      ctx.lineTo(x + tickInset, y + h - tickInset);
      ctx.lineTo(x + tickInset + tick, y + h - tickInset);
      ctx.moveTo(x + w - tickInset - tick, y + h - tickInset);
      ctx.lineTo(x + w - tickInset, y + h - tickInset);
      ctx.lineTo(x + w - tickInset, y + h - tickInset - tick);
      ctx.stroke();
    }
  }

  for (const index of puzzle.blockers) {
    const center = centerOf(index, cell);
    const sizeOfBlocker = cell * 0.66;

    ctx.save();
    chamferPath(ctx, center.x, center.y, sizeOfBlocker);
    const graphite = ctx.createLinearGradient(
      center.x - sizeOfBlocker / 2,
      center.y - sizeOfBlocker / 2,
      center.x + sizeOfBlocker / 2,
      center.y + sizeOfBlocker / 2
    );
    graphite.addColorStop(0, '#263143');
    graphite.addColorStop(0.48, '#161E2C');
    graphite.addColorStop(1, '#0B111B');
    ctx.fillStyle = graphite;
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = Math.max(0.8, cell * 0.018);
    ctx.stroke();

    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = Math.max(0.7, cell * 0.016);
    const diagonal = sizeOfBlocker * 1.9;
    for (let offset = -diagonal; offset <= diagonal; offset += sizeOfBlocker * 0.18) {
      ctx.beginPath();
      ctx.moveTo(center.x - diagonal + offset, center.y - diagonal);
      ctx.lineTo(center.x + diagonal + offset, center.y + diagonal);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    chamferPath(ctx, center.x, center.y, sizeOfBlocker);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.08)';
    ctx.lineWidth = Math.max(0.6, cell * 0.012);
    ctx.beginPath();
    ctx.moveTo(center.x - sizeOfBlocker * 0.3, center.y - sizeOfBlocker * 0.3);
    ctx.lineTo(center.x + sizeOfBlocker * 0.16, center.y - sizeOfBlocker * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(34, 48, 71, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  size: number,
  heatmap: Record<number, number>
): void {
  const cell = size / GRID_SIZE;
  const counts = Object.values(heatmap);
  const max = Math.max(1, ...counts);
  const gap = Math.max(1, cell * 0.016);

  for (const [field, count] of Object.entries(heatmap)) {
    const index = Number(field);
    if (!Number.isInteger(index) || count <= 0) continue;
    const col = cellCol(index);
    const row = cellRow(index);
    const ratio = Math.min(1, count / max);
    const x = col * cell + gap;
    const y = row * cell + gap;
    const w = cell - gap * 2;
    const h = cell - gap * 2;

    roundedRect(ctx, x, y, w, h, Math.max(2, cell * 0.055));
    ctx.fillStyle = `rgba(34, 211, 238, ${0.05 + ratio * 0.2})`;
    ctx.fill();

    if (ratio >= 0.62 && cell >= 34) {
      const pct = Math.round(ratio * 100);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.66)';
      ctx.font = `600 ${Math.max(8, Math.round(cell * 0.16))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pct}%`, x + w / 2, y + h * 0.78);
    }
  }
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  size: number,
  segments: readonly Segment[],
  puzzle: ClientPuzzle,
  time: number
): void {
  if (segments.length === 0) return;
  const cell = size / GRID_SIZE;
  const lineCap = ctx.lineCap;
  const blockers = new Set(puzzle.blockers);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!segment) continue;

    const x1 = (segment.fromCol + 0.5) * cell;
    const y1 = (segment.fromRow + 0.5) * cell;
    let x2 = (segment.toCol + 0.5) * cell;
    let y2 = (segment.toRow + 0.5) * cell;

    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

    const stepRow = Math.sign(segment.toRow - segment.fromRow);
    const stepCol = Math.sign(segment.toCol - segment.fromCol);
    const nextRow = segment.toRow + stepRow;
    const nextCol = segment.toCol + stepCol;
    if (blockers.has(cellIndex(segment.toRow, segment.toCol))) {
      if (stepRow !== 0) y2 -= stepRow * cell * 0.5;
      if (stepCol !== 0) x2 -= stepCol * cell * 0.5;
    } else if (
      nextRow < 0 ||
      nextRow >= GRID_SIZE ||
      nextCol < 0 ||
      nextCol >= GRID_SIZE
    ) {
      if (stepRow !== 0) y2 += stepRow * cell * 0.5;
      if (stepCol !== 0) x2 += stepCol * cell * 0.5;
    }

    const color = BEAM_COLORS[segment.color];
    const core = BEAM_CORES[segment.color];

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = cell * 0.34;
    ctx.stroke();

    ctx.globalAlpha = 0.3;
    ctx.lineWidth = cell * 0.16;
    ctx.stroke();

    ctx.globalAlpha = 0.94;
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(1, cell * 0.045);
    ctx.stroke();

    const phase = (time * 0.00018 + index * 0.163) % 1;
    for (let pulse = 0; pulse < 2; pulse++) {
      const t = (phase + pulse * 0.53) % 1;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const radius = Math.max(1.4, cell * 0.045);
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.6);
      glow.addColorStop(0, core);
      glow.addColorStop(0.45, color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55 + Math.sin((t + phase) * Math.PI) * 0.18;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = lineCap;
  ctx.restore();
}

function drawEmitter(
  ctx: CanvasRenderingContext2D,
  size: number,
  puzzle: ClientPuzzle,
  time: number
): void {
  const cell = size / GRID_SIZE;
  const center = centerOf(puzzle.emitter.index, cell);
  const pulse = 0.5 + Math.sin(time * 0.0035) * 0.5;
  const housing = cell * 0.64;

  const halo = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    cell * 0.7
  );
  halo.addColorStop(0, `rgba(245, 166, 35, ${0.18 + pulse * 0.12})`);
  halo.addColorStop(1, 'rgba(245, 166, 35, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(center.x - cell, center.y - cell, cell * 2, cell * 2);

  ctx.save();
  chamferPath(ctx, center.x, center.y, housing);
  const metal = ctx.createLinearGradient(
    center.x - housing / 2,
    center.y - housing / 2,
    center.x + housing / 2,
    center.y + housing / 2
  );
  metal.addColorStop(0, '#3B4557');
  metal.addColorStop(0.5, '#161F2D');
  metal.addColorStop(1, '#080D15');
  ctx.fillStyle = metal;
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.lineWidth = Math.max(1, cell * 0.02);
  ctx.stroke();
  ctx.restore();

  const angle =
    puzzle.emitter.dir === 'N'
      ? -Math.PI / 2
      : puzzle.emitter.dir === 'E'
        ? 0
        : puzzle.emitter.dir === 'S'
          ? Math.PI / 2
          : Math.PI;
  const apertureX = center.x + Math.cos(angle) * cell * 0.24;
  const apertureY = center.y + Math.sin(angle) * cell * 0.24;
  const tipX = center.x + Math.cos(angle) * cell * 0.37;
  const tipY = center.y + Math.sin(angle) * cell * 0.37;
  const normalX = Math.cos(angle + Math.PI / 2);
  const normalY = Math.sin(angle + Math.PI / 2);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const apertureGlow = ctx.createRadialGradient(
    tipX,
    tipY,
    0,
    tipX,
    tipY,
    cell * 0.35
  );
  apertureGlow.addColorStop(0, 'rgba(255, 230, 170, 0.9)');
  apertureGlow.addColorStop(0.45, 'rgba(245, 166, 35, 0.38)');
  apertureGlow.addColorStop(1, 'rgba(245, 166, 35, 0)');
  ctx.fillStyle = apertureGlow;
  ctx.beginPath();
  ctx.arc(tipX, tipY, cell * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFE7B5';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    apertureX + normalX * cell * 0.095,
    apertureY + normalY * cell * 0.095
  );
  ctx.lineTo(
    apertureX - normalX * cell * 0.095,
    apertureY - normalY * cell * 0.095
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(8, 13, 21, 0.9)';
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(245, 166, 35, 0.8)';
  ctx.lineWidth = Math.max(1, cell * 0.018);
  ctx.stroke();

  ctx.fillStyle = `rgba(245, 166, 35, ${0.5 + pulse * 0.45})`;
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * 0.042, 0, Math.PI * 2);
  ctx.fill();
}

function drawPrisms(
  ctx: CanvasRenderingContext2D,
  size: number,
  puzzle: ClientPuzzle,
  trace: TraceResult,
  time: number
): void {
  if (puzzle.prisms.length === 0) return;
  const cell = size / GRID_SIZE;
  const prismSet = new Set(puzzle.prisms);
  const hitPrisms = new Set<number>();

  for (const segment of trace.segments) {
    const index = cellIndex(segment.toRow, segment.toCol);
    if (prismSet.has(index)) hitPrisms.add(index);
  }

  for (const index of puzzle.prisms) {
    const center = centerOf(index, cell);
    const radius = cell * 0.3;
    const hit = hitPrisms.has(index);
    const pulse = 0.5 + Math.sin(time * 0.004 + index) * 0.5;

    if (hit) {
      const glow = ctx.createRadialGradient(
        center.x,
        center.y,
        0,
        center.x,
        center.y,
        cell * 0.68
      );
      glow.addColorStop(0, `rgba(34, 211, 238, ${0.3 + pulse * 0.16})`);
      glow.addColorStop(0.5, 'rgba(244, 114, 182, 0.16)');
      glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.fillRect(center.x - cell, center.y - cell, cell * 2, cell * 2);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - radius);
    ctx.lineTo(center.x + radius * 0.72, center.y);
    ctx.lineTo(center.x, center.y + radius);
    ctx.lineTo(center.x - radius * 0.72, center.y);
    ctx.closePath();

    const glass = ctx.createLinearGradient(
      center.x - radius,
      center.y - radius,
      center.x + radius,
      center.y + radius
    );
    glass.addColorStop(0, hit ? 'rgba(207, 250, 254, 0.72)' : 'rgba(148, 163, 184, 0.26)');
    glass.addColorStop(0.5, hit ? 'rgba(34, 211, 238, 0.28)' : 'rgba(30, 41, 59, 0.6)');
    glass.addColorStop(1, hit ? 'rgba(244, 114, 182, 0.35)' : 'rgba(15, 23, 42, 0.8)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = hit ? 'rgba(207, 250, 254, 0.95)' : 'rgba(148, 163, 184, 0.46)';
    ctx.lineWidth = Math.max(1, cell * 0.024);
    ctx.stroke();

    ctx.strokeStyle = hit ? 'rgba(255, 255, 255, 0.5)' : 'rgba(226, 232, 240, 0.16)';
    ctx.lineWidth = Math.max(0.7, cell * 0.012);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - radius);
    ctx.lineTo(center.x, center.y + radius);
    ctx.moveTo(center.x - radius * 0.72, center.y);
    ctx.lineTo(center.x + radius * 0.72, center.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTargets(
  ctx: CanvasRenderingContext2D,
  size: number,
  puzzle: ClientPuzzle,
  trace: TraceResult,
  time: number
): void {
  const cell = size / GRID_SIZE;
  const lit = new Set(trace.litTargets);

  for (const index of puzzle.targets) {
    const center = centerOf(index, cell);
    const isLit = lit.has(index);
    const radius = cell * 0.27;
    const pulse = 0.5 + Math.sin(time * 0.0045 + index * 0.8) * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - radius);
    ctx.lineTo(center.x + radius * 0.72, center.y);
    ctx.lineTo(center.x, center.y + radius);
    ctx.lineTo(center.x - radius * 0.72, center.y);
    ctx.closePath();

    if (isLit) {
      const bloom = ctx.createRadialGradient(
        center.x,
        center.y,
        0,
        center.x,
        center.y,
        cell * 0.7
      );
      bloom.addColorStop(0, `rgba(255, 240, 200, ${0.64 + pulse * 0.2})`);
      bloom.addColorStop(0.35, 'rgba(245, 166, 35, 0.35)');
      bloom.addColorStop(1, 'rgba(245, 166, 35, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = bloom;
      ctx.fillRect(center.x - cell, center.y - cell, cell * 2, cell * 2);
      ctx.globalCompositeOperation = 'source-over';

      const crystal = ctx.createLinearGradient(
        center.x,
        center.y - radius,
        center.x,
        center.y + radius
      );
      crystal.addColorStop(0, '#FFFFFF');
      crystal.addColorStop(0.45, '#FFE7B5');
      crystal.addColorStop(1, '#F5A623');
      ctx.fillStyle = crystal;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = Math.max(1, cell * 0.022);
      ctx.stroke();

      ctx.strokeStyle = `rgba(245, 166, 35, ${0.4 + pulse * 0.45})`;
      ctx.lineWidth = Math.max(1, cell * 0.022);
      ctx.beginPath();
      ctx.arc(center.x, center.y, cell * (0.36 + pulse * 0.035), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
      ctx.lineWidth = Math.max(1, cell * 0.022);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center.x, center.y - radius * 0.46);
      ctx.lineTo(center.x + radius * 0.33, center.y);
      ctx.lineTo(center.x, center.y + radius * 0.46);
      ctx.lineTo(center.x - radius * 0.33, center.y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.2)';
      ctx.lineWidth = Math.max(0.7, cell * 0.012);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMirrors(
  ctx: CanvasRenderingContext2D,
  size: number,
  mirrors: MirrorMap
): void {
  const cell = size / GRID_SIZE;
  const inset = cell * 0.2;

  for (const [field, mirror] of Object.entries(mirrors)) {
    const index = Number(field);
    if (!mirror || !Number.isInteger(index)) continue;
    const center = centerOf(index, cell);
    const slash = mirror === '/';
    const x1 = center.x + (slash ? -inset : -inset);
    const y1 = center.y + (slash ? inset : -inset);
    const x2 = center.x + (slash ? inset : inset);
    const y2 = center.y + (slash ? -inset : inset);

    const metal = ctx.createLinearGradient(x1, y1, x2, y2);
    metal.addColorStop(0, '#64748B');
    metal.addColorStop(0.22, '#E2E8F0');
    metal.addColorStop(0.52, '#FFFFFF');
    metal.addColorStop(0.78, '#CBD5E1');
    metal.addColorStop(1, '#475569');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.lineWidth = cell * 0.18;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = metal;
    ctx.lineWidth = cell * 0.115;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(0.8, cell * 0.018);
    ctx.beginPath();
    ctx.moveTo(x1 - cell * 0.012, y1 - cell * 0.012);
    ctx.lineTo(x2 - cell * 0.012, y2 - cell * 0.012);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = Math.max(0.7, cell * 0.014);
    ctx.beginPath();
    ctx.arc(center.x, center.y, cell * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawParGhost(
  ctx: CanvasRenderingContext2D,
  size: number,
  parSolution: readonly MirrorPlacement[]
): void {
  if (parSolution.length === 0) return;
  const cell = size / GRID_SIZE;
  const inset = cell * 0.19;

  ctx.save();
  ctx.lineCap = 'round';
  for (const placement of parSolution) {
    const center = centerOf(placement.index, cell);
    const slash = placement.mirror === '/';
    const x1 = center.x - inset;
    const y1 = center.y + (slash ? inset : -inset);
    const x2 = center.x + inset;
    const y2 = center.y + (slash ? -inset : inset);

    ctx.setLineDash([Math.max(3, cell * 0.09), Math.max(3, cell * 0.07)]);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.62)';
    ctx.lineWidth = Math.max(1.2, cell * 0.035);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = Math.max(0.8, cell * 0.016);
    ctx.beginPath();
    ctx.arc(center.x, center.y, cell * 0.09, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOnboarding(
  ctx: CanvasRenderingContext2D,
  size: number,
  puzzle: ClientPuzzle,
  time: number
): void {
  const cell = size / GRID_SIZE;
  const center = centerOf(puzzle.firstHintIndex, cell);
  const pulse = 0.5 + Math.sin(time * 0.004) * 0.5;
  const radius = cell * (0.29 + pulse * 0.035);

  ctx.save();
  ctx.strokeStyle = `rgba(245, 166, 35, ${0.35 + pulse * 0.45})`;
  ctx.lineWidth = Math.max(1.2, cell * 0.025);
  ctx.setLineDash([cell * 0.09, cell * 0.11]);
  ctx.lineDashOffset = -time * 0.012;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(245, 166, 35, ${0.35 + pulse * 0.32})`;
  ctx.lineWidth = Math.max(1, cell * 0.018);
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * 0.4, 0, Math.PI * 2);
  ctx.stroke();

  const inset = cell * 0.17;
  ctx.strokeStyle = `rgba(248, 250, 252, ${0.14 + pulse * 0.22})`;
  ctx.lineWidth = Math.max(1.2, cell * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(center.x - inset, center.y + inset);
  ctx.lineTo(center.x + inset, center.y - inset);
  ctx.stroke();

  ctx.fillStyle = `rgba(245, 166, 35, ${0.55 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(1.6, cell * 0.035), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHintRing(
  ctx: CanvasRenderingContext2D,
  size: number,
  hintIndex: number,
  time: number
): void {
  const cell = size / GRID_SIZE;
  const center = centerOf(hintIndex, cell);
  const pulse = 0.5 + Math.sin(time * 0.008) * 0.5;

  ctx.save();
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.55 + pulse * 0.35})`;
  ctx.lineWidth = Math.max(1.4, cell * 0.028);
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * (0.34 + pulse * 0.025), 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(207, 250, 254, 0.55)';
  ctx.lineWidth = Math.max(1, cell * 0.016);
  ctx.beginPath();
  ctx.arc(center.x, center.y, cell * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function spawnSparks(
  sparks: Spark[],
  index: number,
  cell: number,
  colors: readonly string[],
  count: number,
  speed: number
): void {
  const center = centerOf(index, cell);
  for (let i = 0; i < count; i++) {
    if (sparks.length > 140) break;
    const angle = Math.random() * Math.PI * 2;
    const force = speed * (0.35 + Math.random() * 0.9);
    const life = 0.35 + Math.random() * 0.5;
    sparks.push({
      x: center.x,
      y: center.y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life,
      maxLife: life,
      size: Math.max(1, cell * (0.018 + Math.random() * 0.035)),
      color: colors[Math.floor(Math.random() * colors.length)] ?? '#FFFFFF',
    });
  }
}

function updateAndDrawSparks(
  ctx: CanvasRenderingContext2D,
  sparks: Spark[],
  deltaMs: number
): void {
  if (sparks.length === 0) return;
  const delta = Math.min(50, deltaMs) / 1000;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let index = sparks.length - 1; index >= 0; index--) {
    const spark = sparks[index];
    if (!spark) continue;
    spark.life -= delta;
    if (spark.life <= 0) {
      sparks.splice(index, 1);
      continue;
    }
    spark.x += spark.vx * delta;
    spark.y += spark.vy * delta;
    spark.vy += 52 * delta;
    spark.vx *= 0.985;
    const ratio = Math.max(0, spark.life / spark.maxLife);
    ctx.globalAlpha = ratio * 0.9;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size * (0.55 + ratio * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCelebration(
  ctx: CanvasRenderingContext2D,
  size: number,
  time: number
): void {
  const pulse = 0.5 + Math.sin(time * 0.02) * 0.5;
  const center = size / 2;
  const flash = ctx.createRadialGradient(center, center, 0, center, center, size * 0.62);
  flash.addColorStop(0, `rgba(255, 244, 214, ${0.16 + pulse * 0.1})`);
  flash.addColorStop(0.4, 'rgba(245, 166, 35, 0.08)');
  flash.addColorStop(1, 'rgba(245, 166, 35, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = flash;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `rgba(255, 231, 181, ${0.35 + pulse * 0.3})`;
  ctx.lineWidth = Math.max(1.5, size * 0.006);
  ctx.beginPath();
  ctx.arc(center, center, size * (0.36 + pulse * 0.02), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  size: number,
  dpr: number,
  base: HTMLCanvasElement | null,
  state: FrameState,
  sparks: Spark[],
  time: number,
  deltaMs: number
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (base) {
    ctx.drawImage(base, 0, 0, base.width, base.height, 0, 0, size, size);
  } else {
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, size, size);
  }

  if (state.showHeatmap) {
    drawHeatmap(ctx, size, state.heatmap);
  }

  drawBeams(ctx, size, state.trace.segments, state.puzzle, time);
  drawEmitter(ctx, size, state.puzzle, time);
  drawPrisms(ctx, size, state.puzzle, state.trace, time);
  drawTargets(ctx, size, state.puzzle, state.trace, time);
  drawMirrors(ctx, size, state.mirrors);

  if (state.showParGhost) {
    drawParGhost(ctx, size, state.parSolution);
  }

  if (state.showOnboarding) {
    drawOnboarding(ctx, size, state.puzzle, time);
  }

  if (state.hintIndex !== null) {
    drawHintRing(ctx, size, state.hintIndex, time);
  }

  updateAndDrawSparks(ctx, sparks, deltaMs);

  if (state.celebrating) {
    drawCelebration(ctx, size, time);
  }
}

export function OpticalCanvas({
  puzzle,
  mirrors,
  interactive = false,
  showParGhost = false,
  showHeatmap = false,
  showOnboarding = false,
  celebrating = false,
  parSolution = EMPTY_PLACEMENTS,
  heatmap = EMPTY_HEATMAP,
  hintIndex = null,
  className,
  onCellTap,
  onBudgetExceeded,
  onReady,
}: OpticalCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const previousMirrorsRef = useRef<MirrorMap>({});
  const previousLitRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const readyRef = useRef(false);

  const [size, setSize] = useState(0);
  const [dpr, setDpr] = useState(1);

  const trace = useMemo(() => traceRays(puzzle, mirrors), [puzzle, mirrors]);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;

    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      const available = Math.min(rect.width, rect.height);
      const next = Math.max(0, Math.floor(available));
      setSize(next);
      setDpr(Math.min(2, window.devicePixelRatio || 1));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (size <= 0) return;
    const base = document.createElement('canvas');
    base.width = Math.round(size * dpr);
    base.height = Math.round(size * dpr);
    const context = base.getContext('2d');
    if (!context) {
      baseRef.current = null;
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBase(context, size, puzzle);
    baseRef.current = base;
  }, [size, dpr, puzzle]);

  useEffect(() => {
    if (size <= 0) return;
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [size, onReady]);

  useEffect(() => {
    const cell = size / GRID_SIZE;
    if (cell <= 0) return;

    const previous = previousMirrorsRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousMirrorsRef.current = { ...mirrors };
      previousLitRef.current = new Set(trace.litTargets);
      return;
    }

    for (const [field, mirror] of Object.entries(mirrors)) {
      const index = Number(field);
      if (previous[index] === mirror) continue;
      spawnSparks(
        sparksRef.current,
        index,
        cell,
        ['#F8FAFC', '#CBD5E1', '#F5A623', '#FFFFFF'],
        12,
        cell * 2.6
      );
    }

    for (const field of Object.keys(previous)) {
      const index = Number(field);
      if (index in mirrors) continue;
      spawnSparks(
        sparksRef.current,
        index,
        cell,
        ['#94A3B8', '#64748B', '#E2E8F0'],
        7,
        cell * 1.7
      );
    }

    previousMirrorsRef.current = { ...mirrors };

    const previousLit = previousLitRef.current;
    for (const index of trace.litTargets) {
      if (previousLit.has(index)) continue;
      spawnSparks(
        sparksRef.current,
        index,
        cell,
        ['#FFF4D6', '#FFE7B5', '#F5A623', '#FFFFFF'],
        20,
        cell * 3.1
      );
    }
    previousLitRef.current = new Set(trace.litTargets);
  }, [mirrors, trace, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;

    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const context = canvas.getContext('2d');
    if (!context) return;

    const frameState: FrameState = {
      puzzle,
      mirrors,
      trace,
      showParGhost,
      showHeatmap,
      showOnboarding,
      celebrating,
      parSolution,
      heatmap,
      hintIndex,
    };

    let frame = 0;
    let previous = performance.now();

    const loop = (now: number): void => {
      const delta = now - previous;
      previous = now;
      drawScene(
        context,
        size,
        dpr,
        baseRef.current,
        frameState,
        sparksRef.current,
        now,
        delta
      );
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [
    size,
    dpr,
    puzzle,
    mirrors,
    trace,
    showParGhost,
    showHeatmap,
    showOnboarding,
    celebrating,
    parSolution,
    heatmap,
    hintIndex,
  ]);

  const handlePointerUp = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): void => {
    if (!interactive || !onCellTap) return;
    if (size <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const col = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_SIZE);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;

    const index = cellIndex(row, col);
    const current = mirrors[index];
    const next: MirrorType | null =
      current === '/' ? '\\' : current === '\\' ? null : '/';

    if (current === undefined && Object.keys(mirrors).length >= puzzle.budget) {
      onBudgetExceeded?.();
      return;
    }

    onCellTap(index, next);
  };

  return (
    <div
      ref={wrapperRef}
      className={className ?? 'flex h-full w-full items-center justify-center'}
    >
      <canvas
        ref={canvasRef}
        aria-label="RAYFOLD optical board"
        role="img"
        style={{
          width: size > 0 ? `${size}px` : '100%',
          height: size > 0 ? `${size}px` : '100%',
          touchAction: 'none',
          cursor: interactive ? 'pointer' : 'default',
          borderRadius: '10px',
        }}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
}
