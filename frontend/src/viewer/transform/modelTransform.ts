import { AbstractMesh, Quaternion, Space, TransformNode, Vector3 } from '@babylonjs/core';
import type { ArcRotateCamera } from '@babylonjs/core';
import { syncOrbitPanToRadius } from '../camera/setupCameras';

export type QuarterTurnAxis = 'x' | 'y' | 'z';

const QUARTER_TURN = Math.PI / 2;
const AXIS: Record<QuarterTurnAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/** Top imported mesh, including a GLB `__root__` that has no vertices of its own. */
export function importedHierarchyRoot(mesh: AbstractMesh): AbstractMesh {
  let node = mesh;
  while (node.parent instanceof AbstractMesh) {
    node = node.parent;
  }
  return node;
}

/** Node the move / rotate / scale gizmos should drive, including a transform-only parent. */
export function resolveTransformRoot(mesh: AbstractMesh): TransformNode {
  let node: TransformNode = importedHierarchyRoot(mesh);
  while (node.parent instanceof TransformNode) {
    node = node.parent;
  }
  return node;
}

export function hierarchyWorldCenter(meshes: AbstractMesh[]): Vector3 | null {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const mesh of meshes) {
    if (mesh.isDisposed()) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getHierarchyBoundingVectors(true);
    min = min ? Vector3.Minimize(min, bounds.min) : bounds.min.clone();
    max = max ? Vector3.Maximize(max, bounds.max) : bounds.max.clone();
  }
  if (!min || !max) return null;
  return min.add(max).scale(0.5);
}

/** Spin and scale around the model center without shifting the mesh at rest. */
export function centerPivotOnBounds(node: TransformNode, meshes: AbstractMesh[]): void {
  const center = hierarchyWorldCenter(meshes);
  if (!center) return;
  node.computeWorldMatrix(true);
  node.setPivotPoint(center, Space.WORLD);
}

/** World-axis quarter turn. Four calls on the same axis return to the start. */
export function applyQuarterTurn(node: TransformNode, axis: QuarterTurnAxis): void {
  const delta = Quaternion.RotationAxis(AXIS[axis], QUARTER_TURN);
  const current = node.rotationQuaternion
    ? node.rotationQuaternion.clone()
    : Quaternion.FromEulerVector(node.rotation);
  node.rotationQuaternion = delta.multiply(current);
  node.rotation.set(0, 0, 0);
}

export function recenterOrbitOnMeshes(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  const center = hierarchyWorldCenter(meshes);
  if (!center) return;
  camera.setTarget(center);
  syncOrbitPanToRadius(camera);
}
