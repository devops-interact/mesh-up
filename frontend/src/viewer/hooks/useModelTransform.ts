import { AbstractMesh, Quaternion, Vector3 } from '@babylonjs/core';
import type { Observer, TransformNode } from '@babylonjs/core';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { GizmoCoordinatesMode } from '@babylonjs/core/Gizmos/gizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { DragStartEndEvent } from '@babylonjs/core/Behaviors/Meshes/pointerDragEvents';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  ORBIT_POINTER_BUTTONS,
  TRANSFORM_POINTER_BUTTONS,
  setOrbitPointerButtons,
} from './useCameraMode';
import {
  applyQuarterTurn,
  centerPivotOnBounds,
  recenterOrbitOnMeshes,
  resolveTransformRoot,
  type QuarterTurnAxis,
} from '../transform/modelTransform';
import type { BabylonViewerCtx, LoadPhase, ViewerMode } from '../types';

export type { QuarterTurnAxis };
export type ModelTransformMode = 'none' | 'move' | 'rotate' | 'scale';

interface NodeRestPose {
  position: Vector3;
  rotation: Vector3;
  scaling: Vector3;
  quaternion: Quaternion | null;
}

interface DragGizmo {
  onDragEndObservable: {
    add: (cb: (event: DragStartEndEvent) => void) => Observer<DragStartEndEvent> | null;
    remove: (observer: Observer<DragStartEndEvent> | null) => boolean;
  };
}

function snapshotPose(node: TransformNode): NodeRestPose {
  return {
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    scaling: node.scaling.clone(),
    quaternion: node.rotationQuaternion?.clone() ?? null,
  };
}

function restorePose(node: TransformNode, rest: NodeRestPose): void {
  node.position.copyFrom(rest.position);
  node.scaling.copyFrom(rest.scaling);
  if (rest.quaternion) {
    if (!node.rotationQuaternion) node.rotationQuaternion = rest.quaternion.clone();
    else node.rotationQuaternion.copyFrom(rest.quaternion);
  } else {
    node.rotationQuaternion = null;
    node.rotation.copyFrom(rest.rotation);
  }
}

function geometryOf(ctx: BabylonViewerCtx): AbstractMesh[] {
  if (ctx.geometryMeshes.length > 0) return ctx.geometryMeshes;
  return ctx.rootMesh ? [ctx.rootMesh] : [];
}

export interface ModelTransformApi {
  restoreMeshTransform: () => void;
  quarterTurn: (axis: QuarterTurnAxis) => void;
}

/** Orbit-only move / rotate / scale on the imported hierarchy, around its center. */
export function useModelTransform(
  viewerRef: RefObject<BabylonViewerCtx | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: ViewerMode,
  loadPhase: LoadPhase,
  transformMode: ModelTransformMode,
): ModelTransformApi {
  const restNodeRef = useRef<TransformNode | null>(null);
  const restPoseRef = useRef<NodeRestPose | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const ctx = viewerRef.current;
    const mesh = ctx?.rootMesh ?? null;
    if (!ctx || !mesh || loadPhase !== 'ready') return;
    const node = resolveTransformRoot(mesh);
    if (restNodeRef.current === node) return;
    centerPivotOnBounds(node, geometryOf(ctx));
    restNodeRef.current = node;
    restPoseRef.current = snapshotPose(node);
  }, [loadPhase, viewerRef]);

  const restoreMeshTransform = useCallback(() => {
    const node = restNodeRef.current;
    const rest = restPoseRef.current;
    if (!node || !rest) return;
    restorePose(node, rest);
  }, []);

  const quarterTurn = useCallback((axis: QuarterTurnAxis) => {
    const ctx = viewerRef.current;
    const node = restNodeRef.current;
    if (!ctx || !node) return;
    applyQuarterTurn(node, axis);
    recenterOrbitOnMeshes(ctx.orbitCamera, geometryOf(ctx));
  }, [viewerRef]);

  useEffect(() => {
    const ctx = viewerRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas || loadPhase !== 'ready') return;

    const mesh = ctx.rootMesh;
    const node = restNodeRef.current ?? (mesh ? resolveTransformRoot(mesh) : null);
    const active = mode === 'orbit' && transformMode !== 'none' && node;
    if (!active || !node) return;

    const { orbitCamera } = ctx;
    const gizmoLayer = new UtilityLayerRenderer(ctx.scene, true);
    gizmoLayer.setRenderCamera(orbitCamera);
    const manager = new GizmoManager(ctx.scene, 1, gizmoLayer);
    manager.usePointerToAttachGizmos = false;
    manager.clearGizmoOnEmptyPointerEvent = false;
    manager.enableAutoPicking = false;
    manager.scaleRatio = Math.max(0.6, ctx.effectiveDiagonal * 0.12);
    if (node instanceof AbstractMesh) manager.attachToMesh(node);
    else manager.attachToNode(node);
    manager.positionGizmoEnabled = transformMode === 'move';
    manager.rotationGizmoEnabled = transformMode === 'rotate';
    manager.scaleGizmoEnabled = transformMode === 'scale';
    manager.coordinatesMode = GizmoCoordinatesMode.World;
    setOrbitPointerButtons(orbitCamera, TRANSFORM_POINTER_BUTTONS);

    const unsubscribers: Array<() => void> = [];
    const bindDrag = (gizmo: DragGizmo | null) => {
      if (!gizmo) return;
      const end = gizmo.onDragEndObservable.add(() => {
        recenterOrbitOnMeshes(orbitCamera, geometryOf(ctx));
      });
      unsubscribers.push(() => {
        gizmo.onDragEndObservable.remove(end);
      });
    };

    bindDrag(manager.gizmos.positionGizmo);
    bindDrag(manager.gizmos.rotationGizmo);
    bindDrag(manager.gizmos.scaleGizmo);

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      manager.dispose();
      if (modeRef.current === 'orbit') {
        setOrbitPointerButtons(orbitCamera, ORBIT_POINTER_BUTTONS);
      }
    };
  }, [canvasRef, loadPhase, mode, transformMode, viewerRef]);

  return { restoreMeshTransform, quarterTurn };
}
