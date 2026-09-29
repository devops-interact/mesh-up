import { describe, expect, it } from 'vitest';
import { cappedOrbitRadius, orbitPanSensibility, walkSpeedForDiagonal } from './setupCameras';

describe('orbitPanSensibility', () => {
  it('maps about 600 pixels of drag to one radius', () => {
    expect(orbitPanSensibility(6)).toBeCloseTo(100);
    expect(orbitPanSensibility(0.5)).toBeCloseTo(1200);
  });

  it('stays finite for a zero radius', () => {
    expect(orbitPanSensibility(0)).toBeGreaterThan(0);
    expect(Number.isFinite(orbitPanSensibility(0))).toBe(true);
  });
});

describe('walkSpeedForDiagonal', () => {
  it('crosses the scene in about ten seconds and stays in range', () => {
    expect(walkSpeedForDiagonal(10)).toBeCloseTo(1);
    expect(walkSpeedForDiagonal(100)).toBe(4);
    expect(walkSpeedForDiagonal(0.5)).toBe(0.2);
  });
});

describe('cappedOrbitRadius', () => {
  it('pulls a far pivot in to 85% of the diagonal', () => {
    expect(cappedOrbitRadius(20, 10, 0.2)).toBeCloseTo(8.5);
  });

  it('leaves a closer orbit unchanged', () => {
    expect(cappedOrbitRadius(4, 10, 0.2)).toBe(4);
  });
});
