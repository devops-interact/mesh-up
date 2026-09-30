import type { Camera, Scene } from '@babylonjs/core';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { BabylonViewerCtx } from '../types';
import { MEASURE_OVERLAY_RENDER_GROUP } from './colors';

/** Measure markers live on their own layer and never share it with transform gizmos. */
export function prepareMeasureUtilityLayer(layer: UtilityLayerRenderer, camera: Camera): void {
  layer.setRenderCamera(camera);
  layer.utilityLayerScene.setRenderingAutoClearDepthStencil(
    MEASURE_OVERLAY_RENDER_GROUP,
    false,
    true,
    false,
  );
}

export function createMeasureUtilityLayer(scene: Scene, camera: Camera): UtilityLayerRenderer {
  const layer = new UtilityLayerRenderer(scene, false);
  prepareMeasureUtilityLayer(layer, camera);
  return layer;
}

/** Replace the measure layer if a previous gizmo dispose destroyed it. */
export function ensureMeasureUtilityLayer(ctx: BabylonViewerCtx): UtilityLayerRenderer {
  const current = ctx.utilityLayer;
  const utilityScene = current?.utilityLayerScene;
  if (utilityScene && !utilityScene.isDisposed) {
    prepareMeasureUtilityLayer(current, ctx.orbitCamera);
    return current;
  }
  const layer = createMeasureUtilityLayer(ctx.scene, ctx.orbitCamera);
  ctx.utilityLayer = layer;
  return layer;
}
