import { AxesViewer, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';

export interface SceneOverlayHandles {
  gridMesh: AbstractMesh;
  axesViewer: AxesViewer;
}

export function addSceneOverlays(scene: Scene): SceneOverlayHandles {
  const half = 15;
  const ground = MeshBuilder.CreateGround('viewerGrid', { width: half * 2, height: half * 2, subdivisions: 1 }, scene);
  ground.position.y = -0.02;
  ground.isPickable = false;

  const gridMat = new GridMaterial('viewerGridMat', scene);
  gridMat.majorUnitFrequency = 5;
  gridMat.minorUnitVisibility = 0.35;
  gridMat.gridRatio = 1;
  gridMat.backFaceCulling = false;
  gridMat.mainColor.set(0.11, 0.1, 0.06);
  gridMat.lineColor.set(0.18, 0.16, 0.1);
  gridMat.opacity = 1;
  ground.material = gridMat;

  const axesViewer = new AxesViewer(scene, 1.5, 1);
  return { gridMesh: ground, axesViewer };
}

/** Align floor grid to mesh bottom (Meshy origin_at: bottom). */
export function alignGridToFloor(scene: Scene, floorY: number): void {
  const grid = scene.getMeshByName('viewerGrid');
  if (grid) grid.position.y = floorY - 0.02;
}

export { Vector3 };
