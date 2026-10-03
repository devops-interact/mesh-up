import type { ModelMetadataResponse, SceneManifestResponse } from '@/types/job';

/** Stable identity for a viewer load. Same assets must not remount the engine. */
export function viewerSceneKey(
  modelUrl: string | null | undefined,
  manifest: SceneManifestResponse | null | undefined,
  meta: ModelMetadataResponse | null | undefined,
): string {
  const zones = [...(manifest?.zones ?? [])]
    .map((zone) => `${zone.id}:${zone.mesh_url}`)
    .sort()
    .join('|');
  const box = meta?.bounding_box;
  const bbox = box ? `${box.min.join(',')}/${box.max.join(',')}` : '';
  return [
    modelUrl ?? '',
    manifest?.shell_url ?? '',
    manifest?.shell_textured ? 'textured' : '',
    manifest?.composition_mode ?? '',
    zones,
    String(meta?.vertex_count ?? ''),
    String(meta?.face_count ?? ''),
    bbox,
  ].join('\n');
}
