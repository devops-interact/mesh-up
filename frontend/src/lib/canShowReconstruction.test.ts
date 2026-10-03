import { describe, expect, it } from 'vitest';
import { canShowReconstruction } from './canShowReconstruction';

describe('canShowReconstruction', () => {
  it('shows a single mesh url', () => {
    expect(canShowReconstruction({ modelUrl: '/api/jobs/1/model.glb' })).toBe(true);
  });

  it('shows a shell-only room', () => {
    expect(canShowReconstruction({
      modelUrl: '',
      sceneManifest: { zones: [], shell_url: '/api/jobs/1/shell.glb' },
    })).toBe(true);
  });

  it('shows a room that only has zones', () => {
    expect(canShowReconstruction({
      sceneManifest: { zones: [{ id: 1 }], shell_url: null },
    })).toBe(true);
  });

  it('hides a job with nothing to draw', () => {
    expect(canShowReconstruction({
      modelUrl: null,
      sceneManifest: { zones: [], shell_url: null },
    })).toBe(false);
    expect(canShowReconstruction({})).toBe(false);
  });
});
