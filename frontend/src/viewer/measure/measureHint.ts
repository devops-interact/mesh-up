import type { PickResult } from '@/lib/meshPick';
import type { MeasurePhase } from '../types';
import { MEASURE_PICK_HINT_IDLE } from './colors';

export function buildMeasurePickHint(
  measurePhase: MeasurePhase,
  calibLen: number,
  measureLen: number,
  pick: PickResult | null,
  segmentText?: string | null,
): string {
  const activeLen = measurePhase === 'calibrate' ? calibLen : measureLen;
  const label = measurePhase === 'calibrate' ? 'calibration' : 'measure';
  const seg = segmentText ? ` · ${segmentText}` : '';

  if (activeLen >= 2) {
    return 'Selection held. Esc or Soltar clears it.';
  }

  if (!pick) {
    if (activeLen === 1) {
      return `Point A is set. Drag to change the view, then click a vertex for B. Esc releases.${seg}`;
    }
    return 'Aim at visible mesh geometry to select a vertex.';
  }

  if (!pick.isSnapped) {
    if (activeLen === 0) return `Move closer to a vertex — click to place ${label} A${seg}`;
    return `Point A is set. Drag to orbit, then click a vertex for B${seg}`;
  }

  if (activeLen === 0) return `Vertex selected — click to place ${label} A${seg}`;
  return `Vertex selected — click without dragging to place ${label} B${seg}`;
}

export { MEASURE_PICK_HINT_IDLE };
