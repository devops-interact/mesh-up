import { Quaternion, Vector3 } from '@babylonjs/core';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import type { AbstractMesh, Observer } from '@babylonjs/core';
import type { DragStartEndEvent } from '@babylonjs/core/Behaviors/Meshes/pointerDragEvents';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { applyOrbitNavigation } from '../camera/setupCameras';
import type { BabylonViewerCtx, LoadPhase, ViewerMode } from '../types';

export type ModelTransformMode = 'none' | 'move' | 'rotate' | 'scale';

interface MeshRestPose {
  position: Vector3;
  rotation: Vector3;
  scaling: Vector3;
  quaternion: Quaternion | null;
}

interface DragGizmo {
  onDragStartObservable: { add: (cb: (event: DragStartEndEvent) => void) => Observer<DragStartEndEvent> | null; remove: (observer: Observer<DragStartEndEvent> | null) => boolean };
  onDragEndObservable: { add: (cb: (event: DragStartEndEvent) => void) => Observer<DragStartEndEvent> | null; remove: (observer: Observer<DragStartEndEvent> | null) => boolean };
}

function snapshotPose(mesh: AbstractMesh): MeshRestPose {
  return {
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scaling: mesh.scaling.clone(),
    quaternion: mesh.rotationQuaternion?.clone() ?? null,
  };
}

function restorePose(mesh: AbstractMesh, rest: MeshRestPose): void {
  mesh.position.copyFrom(rest.position);
  mesh.scaling.copyFrom(rest.scaling);
  if (rest.quaternion) {
    if (!mesh.rotationQuaternion) mesh.rotationQuaternion = rest.quaternion.clone();
    else mesh.rotationQuaternion.copyFrom(rest.quaternion);
  } else {
    mesh.rotationQuaternion = null;
    mesh.rotation.copyFrom(rest.rotation);
  }
}

/** Orbit-only move / rotate / scale gizmos on the loaded root mesh. */
export function useModelTransform(
  viewerRef: RefObject<BabylonViewerCtx | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: ViewerMode,
  loadPhase: LoadPhase,
  transformMode: ModelTransformMode,
): () => void {
  const restMeshRef = useRef<AbstractMesh | null>(null);
  const restPoseRef = useRef<MeshRestPose | null>(null);

  useEffect(() => {
    const mesh = viewerRef.current?.rootMesh ?? null;
    if (!mesh || loadPhase !== 'ready' || restMeshRef.current === mesh) return;
    restMeshRef.current = mesh;
    restPoseRef.current = snapshotPose(mesh);
  }, [loadPhase, viewerRef]);

  const restoreMeshTransform = useCallback(() => {
    const mesh = restMeshRef.current;
    const rest = restPoseRef.current;
    if (!mesh || !rest) return;
    restorePose(mesh, rest);
  }, []);

  useEffect(() => {
    const ctx = viewerRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas || loadPhase !== 'ready') return;

    const mesh = ctx.rootMesh;
    const active = mode === 'orbit' && transformMode !== 'none' && mesh;
    if (!active) return;

    const manager = new GizmoManager(ctx.scene, 1, ctx.utilityLayer);
    manager.usePointerToAttachGizmos = false;
    manager.clearGizmoOnEmptyPointerEvent = false;
    manager.enableAutoPicking = false;
    manager.scaleRatio = Math.max(0.6, ctx.effectiveDiagonal * 0.12);
    manager.attachToMesh(mesh);
    manager.positionGizmoEnabled = transformMode === 'move';
    manager.rotationGizmoEnabled = transformMode === 'rotate';
    manager.scaleGizmoEnabled = transformMode === 'scale';

    const { orbitCamera } = ctx;
    const unsubscribers: Array<() => void> = [];
    const bindDrag = (gizmo: DragGizmo | null) => {
      if (!gizmo) return;
      const start = gizmo.onDragStartObservable.add(() => {
        orbitCamera.detachControl();
      });
      const end = gizmo.onDragEndObservable.add(() => {
        orbitCamera.attachControl(canvas, false);
        applyOrbitNavigation(orbitCamera);
      });
      unsubscribers.push(() => {
        gizmo.onDragStartObservable.remove(start);
        gizmo.onDragEndObservable.remove(end);
      });
    };

    bindDrag(manager.gizmos.positionGizmo);
    bindDrag(manager.gizmos.rotationGizmo);
    bindDrag(manager.gizmos.scaleGizmo);

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      manager.dispose();
      if (!orbitCamera.inputs.attachedToElement) {
        orbitCamera.attachControl(canvas, false);
        applyOrbitNavigation(orbitCamera);
      }
    };
  }, [canvasRef, loadPhase, mode, transformMode, viewerRef]);

  return restoreMeshTransform;
}
