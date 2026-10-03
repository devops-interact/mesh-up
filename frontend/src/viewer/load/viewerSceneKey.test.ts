import { describe, expect, it } from 'vitest';
import type { ModelMetadataResponse, SceneManifestResponse } from '@/types/job';
import { viewerSceneKey } from './viewerSceneKey';

const manifest = (zones: { id: number; mesh_url: string }[]): SceneManifestResponse => ({
  composition_mode: 'room_shell',
  zones: zones.map((zone) => ({ ...zone, transform: [] })),
  shell_url: '/shell.glb',
  shell_textured: true,
});

const meta: ModelMetadataResponse = {
  vertex_count: 12,
  face_count: 8,
  bounding_box: { min: [0, 0, 0], max: [1, 1, 1] },
};

describe('viewerSceneKey', () => {
  it('is stable when the same assets are new objects', () => {
    const a = viewerSceneKey('/model.glb', manifest([{ id: 2, mesh_url: '/b.glb' }, { id: 1, mesh_url: '/a.glb' }]), meta);
    const b = viewerSceneKey('/model.glb', manifest([{ id: 1, mesh_url: '/a.glb' }, { id: 2, mesh_url: '/b.glb' }]), { ...meta });
    expect(a).toBe(b);
  });

  it('changes when a zone url changes', () => {
    const a = viewerSceneKey(null, manifest([{ id: 1, mesh_url: '/a.glb' }]), null);
    const b = viewerSceneKey(null, manifest([{ id: 1, mesh_url: '/b.glb' }]), null);
    expect(a).not.toBe(b);
  });
});
