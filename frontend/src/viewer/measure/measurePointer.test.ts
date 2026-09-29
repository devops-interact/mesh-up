import { describe, expect, it } from 'vitest';
import { canvasCoordsFromPointerEvent, shouldCommitMeasurePick, type MeasureCameraPose } from './measurePointer';

const pose = (patch: Partial<MeasureCameraPose> = {}): MeasureCameraPose => ({
  alpha: 1,
  beta: 1.2,
  radius: 6,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  ...patch,
});

describe('canvasCoordsFromPointerEvent', () => {
  it('maps client coords to CSS and buffer space with DPR', () => {
    const canvas = {
      width: 800,
      height: 600,
      clientWidth: 400,
      clientHeight: 300,
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 400,
        height: 300,
        right: 500,
        bottom: 350,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    const coords = canvasCoordsFromPointerEvent(canvas, { clientX: 300, clientY: 200 });
    expect(coords.cssX).toBe(200);
    expect(coords.cssY).toBe(150);
    expect(coords.bufferX).toBe(400);
    expect(coords.bufferY).toBe(300);
  });

  it('clamps coordinates to canvas bounds', () => {
    const canvas = {
      width: 100,
      height: 100,
      clientWidth: 100,
      clientHeight: 100,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    } as HTMLCanvasElement;

    const coords = canvasCoordsFromPointerEvent(canvas, { clientX: -50, clientY: 200 });
    expect(coords.cssX).toBe(0);
    expect(coords.cssY).toBe(100);
    expect(coords.bufferX).toBe(0);
    expect(coords.bufferY).toBe(100);
  });
});

describe('shouldCommitMeasurePick', () => {
  it('commits a stationary click that leaves the camera still', () => {
    const start = pose();
    expect(shouldCommitMeasurePick(0, start, pose())).toBe(true);
    expect(shouldCommitMeasurePick(7, start, pose())).toBe(true);
  });

  it('ignores a drag even if the pointer ends on a vertex', () => {
    const start = pose();
    expect(shouldCommitMeasurePick(9, start, pose())).toBe(false);
    expect(shouldCommitMeasurePick(40, start, pose({ alpha: start.alpha + 0.2 }))).toBe(false);
  });

  it('ignores a gesture that orbited, zoomed, or panned the camera', () => {
    const start = pose();
    expect(shouldCommitMeasurePick(1, start, pose({ alpha: start.alpha + 0.02 }))).toBe(false);
    expect(shouldCommitMeasurePick(1, start, pose({ beta: start.beta + 0.02 }))).toBe(false);
    expect(shouldCommitMeasurePick(1, start, pose({ radius: 8 }))).toBe(false);
    expect(shouldCommitMeasurePick(1, start, pose({ targetX: 1 }))).toBe(false);
  });
});
