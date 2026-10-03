/** A reconstruction can be shown when a single mesh, a zone, or a room shell exists. */
export function canShowReconstruction(input: {
  modelUrl?: string | null;
  sceneManifest?: {
    zones?: unknown[] | null;
    shell_url?: string | null;
  } | null;
}): boolean {
  if (input.modelUrl) return true;
  const manifest = input.sceneManifest;
  if (!manifest) return false;
  return (manifest.zones?.length ?? 0) > 0 || !!manifest.shell_url;
}
