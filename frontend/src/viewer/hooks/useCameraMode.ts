import type { ArcRotateCameraPointersInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { pickMeshSurface } from '@/lib/meshPick';
import type { SceneManifestResponse } from '@/types/job';
import type { BabylonViewerCtx, LoadPhase, StoredCameraPose, ViewerMode } from '../types';
import { restoreCameraPose } from '../camera/poseStorage';
import { resetViewWithFraming } from '../camera/framing';
import { canvasCoordsFromPointerEvent } from '../measure/measurePointer';
import {
  applyOrbitNavigation,
  cappedOrbitRadius,
  configureWalkControls,
  syncOrbitPanToRadius,
} from '../camera/setupCameras';
import { AUTO_ROTATE_ALPHA_SPEED } from '../constants';
import { getWalkStartPoseFromRaw } from '../walk/walkPath';

function restoreOrbitInputs(orbitCamera: ArcRotateCamera): void {
  const pointers = orbitCamera.inputs.attached.pointers as ArcRotateCameraPointersInput | null;
  if (pointers) {
    pointers.buttons = [0, 1, 2];
  }
}

function detachMeasureInputs(orbitCamera: ArcRotateCamera): void {
  orbitCamera.detachControl();
}

/** Measure mode: LMB orbit + RMB pan + wheel zoom. */
export const MEASURE_POINTER_BUTTONS = [0, 2] as const;

/** Restrict arc-rotate pointer buttons after attachControl. */
export function attachMeasureInputs(orbitCamera: ArcRotateCamera): void {
  const pointers = orbitCamera.inputs.attached.pointers as ArcRotateCameraPointersInput | null;
  if (pointers) {
    pointers.buttons = [...MEASURE_POINTER_BUTTONS];
  }
}

export function useCameraMode(
  viewerRef: RefObject<BabylonViewerCtx | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: ViewerMode,
  loadPhase: LoadPhase,
  autoRotate: boolean,
): void {
  const beforeRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ctx = viewerRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas || loadPhase !== 'ready') return;

    const { scene, orbitCamera, walkCamera } = ctx;

    detachMeasureInputs(orbitCamera);

    if (mode === 'orbit') {
      restoreOrbitInputs(orbitCamera);
      scene.activeCamera = orbitCamera;
      orbitCamera.attachControl(canvas, false);
      applyOrbitNavigation(orbitCamera);
      walkCamera.detachControl();
    } else if (mode === 'walkthrough') {
      restoreOrbitInputs(orbitCamera);
      walkCamera.position.copyFrom(orbitCamera.position);
      const tgt = orbitCamera.getTarget();
      walkCamera.setTarget(tgt);
      configureWalkControls(walkCamera);
      if (ctx.collisionMesh) {
        ctx.collisionMesh.checkCollisions = false;
      }
      scene.gravity.set(0, 0, 0);
      scene.activeCamera = walkCamera;
      orbitCamera.detachControl();
      walkCamera.attachControl(canvas, false);
    } else {
      scene.activeCamera = orbitCamera;
      walkCamera.detachControl();
      orbitCamera.attachControl(canvas, false);
      applyOrbitNavigation(orbitCamera);
      attachMeasureInputs(orbitCamera);
    }

    if (mode !== 'orbit') return;

    const onDoubleClick = (event: MouseEvent) => {
      const { cssX, cssY } = canvasCoordsFromPointerEvent(canvas, event);
      const hit = pickMeshSurface(scene, cssX, cssY);
      if (!hit.hit || !hit.point) return;
      orbitCamera.setTarget(hit.point);
      orbitCamera.radius = cappedOrbitRadius(
        orbitCamera.radius,
        ctx.effectiveDiagonal,
        orbitCamera.lowerRadiusLimit,
      );
      syncOrbitPanToRadius(orbitCamera);
    };

    canvas.addEventListener('dblclick', onDoubleClick);
    return () => canvas.removeEventListener('dblclick', onDoubleClick);
  }, [mode, loadPhase, viewerRef, canvasRef]);

  useEffect(() => {
    const ctx = viewerRef.current;
    if (!ctx || loadPhase !== 'ready') return;

    const { scene, orbitCamera } = ctx;
    if (beforeRenderRef.current) {
      scene.onBeforeRenderObservable.removeCallback(beforeRenderRef.current);
      beforeRenderRef.current = null;
    }

    if (mode === 'orbit' || mode === 'measure') {
      let lastRadius = Number.NaN;
      const cb = () => {
        if (autoRotate && mode === 'orbit') {
          orbitCamera.alpha += AUTO_ROTATE_ALPHA_SPEED;
        }
        if (Math.abs(orbitCamera.radius - lastRadius) > 1e-4) {
          lastRadius = orbitCamera.radius;
          syncOrbitPanToRadius(orbitCamera);
        }
      };
      beforeRenderRef.current = cb;
      scene.onBeforeRenderObservable.add(cb);
    }

    return () => {
      if (beforeRenderRef.current) {
        scene.onBeforeRenderObservable.removeCallback(beforeRenderRef.current);
        beforeRenderRef.current = null;
      }
    };
  }, [autoRotate, mode, loadPhase, viewerRef]);
}

export function useResetView(
  viewerRef: RefObject<BabylonViewerCtx | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  initialPoseRef: RefObject<StoredCameraPose | null>,
): () => void {
  return () => {
    const ctx = viewerRef.current;
    const canvas = canvasRef.current;
    const pose = initialPoseRef.current;
    if (!ctx || !canvas) return;
    const { orbitCamera, walkCamera, scene, rootMesh, framingBehavior } = ctx;

    detachMeasureInputs(orbitCamera);

    if (pose) {
      restoreCameraPose(orbitCamera, pose);
    } else if (rootMesh) {
      resetViewWithFraming(orbitCamera, framingBehavior, rootMesh, true);
    }

    walkCamera.position.copyFrom(orbitCamera.position);
    walkCamera.setTarget(orbitCamera.getTarget());
    walkCamera.upVector.copyFrom(orbitCamera.upVector);
    restoreOrbitInputs(orbitCamera);
    scene.activeCamera = orbitCamera;
    orbitCamera.attachControl(canvas, false);
    applyOrbitNavigation(orbitCamera);
    walkCamera.detachControl();
  };
}

/** Place walk camera at walk_path start when entering walkthrough in room scenes. */
export function applyWalkPathStart(
  ctx: BabylonViewerCtx,
  sceneManifest: SceneManifestResponse | null,
  sceneScale: number,
): boolean {
  if (!sceneManifest?.walk_path?.length || !ctx.walkPath?.length) return false;

  const pose = getWalkStartPoseFromRaw(sceneManifest.walk_path, ctx.roomBounds, sceneScale);
  if (!pose) return false;

  ctx.walkCamera.position.copyFrom(pose.position);
  ctx.walkCamera.setTarget(pose.target);
  return true;
}
