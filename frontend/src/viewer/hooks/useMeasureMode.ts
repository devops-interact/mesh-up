import { useEffect, useRef, type RefObject } from 'react';
import { Vector3 } from '@babylonjs/core';
import { pickMeshMeasureVertex } from '@/lib/vertexPick';
import type { PickResult } from '@/lib/meshPick';
import { refreshPickableMeshes } from '@/lib/meshPick';
import type {
  BabylonViewerCtx,
  CalibrationState,
  LoadPhase,
  MeasurePhase,
  MeasurePoint,
  ViewerMode,
} from '../types';
import { MeasurePreviewGizmo } from '../measure/MeasurePreviewGizmo';
import { MeasureOverlay } from '../measure/MeasureOverlay';
import { buildMeasurePickHint } from '../measure/measureHint';
import { MEASURE_PICK_HINT_IDLE } from '../measure/colors';
import {
  canvasCoordsFromPointerEvent,
  MEASURE_CLICK_MAX_PX,
  shouldCommitMeasurePick,
  type MeasureCameraPose,
} from '../measure/measurePointer';
import { isMeasureDebugEnabled } from '../dev/inspector';

export interface UseMeasureModeOptions {
  viewerRef: RefObject<BabylonViewerCtx | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: ViewerMode;
  loadPhase: LoadPhase;
  measurePhase: MeasurePhase;
  calibPoints: MeasurePoint[];
  measurePoints: MeasurePoint[];
  calibration: CalibrationState | null;
  visibleMeasurePoints: MeasurePoint[];
  worldUnitRef: RefObject<number>;
  onPickHint: (hint: string) => void;
  onAddPoint: (point: Vector3) => void;
  onReleaseSelection: () => void;
}

function collectPickableMeshes(ctx: BabylonViewerCtx) {
  return [...ctx.geometryMeshes, ...ctx.shellMeshes];
}

export function useMeasureMode(opts: UseMeasureModeOptions): void {
  const {
    viewerRef,
    canvasRef,
    mode,
    loadPhase,
    measurePhase,
    calibPoints,
    measurePoints,
    calibration,
    visibleMeasurePoints,
    worldUnitRef,
    onPickHint,
    onAddPoint,
    onReleaseSelection,
  } = opts;

  const measurePickCtxRef = useRef({ measurePhase, calibPoints, measurePoints, calibration });
  measurePickCtxRef.current = { measurePhase, calibPoints, measurePoints, calibration };

  const overlayRef = useRef<MeasureOverlay | null>(null);
  const overlaySceneRef = useRef<unknown>(null);

  useEffect(() => {
    const ctx = viewerRef.current;
    if (!ctx || loadPhase !== 'ready') return;

    const utilityScene = ctx.utilityLayer.utilityLayerScene;
    if (overlaySceneRef.current !== utilityScene) {
      overlayRef.current?.dispose();
      overlayRef.current = new MeasureOverlay(ctx.utilityLayer);
      overlaySceneRef.current = utilityScene;
    }

    return () => {
      overlayRef.current?.dispose();
      overlayRef.current = null;
      overlaySceneRef.current = null;
    };
  }, [loadPhase, viewerRef]);

  useEffect(() => {
    if (!overlayRef.current || loadPhase !== 'ready') return;
    overlayRef.current.setWorldUnit(worldUnitRef.current ?? 0.024);
    overlayRef.current.update(visibleMeasurePoints);
  }, [visibleMeasurePoints, worldUnitRef, loadPhase]);

  useEffect(() => {
    if (mode !== 'measure') {
      onPickHint(MEASURE_PICK_HINT_IDLE);
      return;
    }

    const ctx = viewerRef.current;
    const canvas = canvasRef.current;
    if (loadPhase !== 'ready' || !ctx || !canvas) return;

    const { scene, utilityLayer } = ctx;
    const camera = scene.activeCamera;
    if (!camera) return;

    refreshPickableMeshes(collectPickableMeshes(ctx));

    const worldUnit = worldUnitRef.current ?? 0.024;
    const gizmo = new MeasurePreviewGizmo(utilityLayer, {
      worldUnit,
      effectiveDiagonal: ctx.effectiveDiagonal,
    });

    let pointerDownOnCanvas = false;
    const downPos = { x: 0, y: 0 };
    let gestureTravelPx = 0;
    let poseAtDown: MeasureCameraPose | null = null;
    let pointerInside = true;
    let pendingMouse: MouseEvent | null = null;
    let hoverRafId = 0;

    const pickFromEvent = (e: MouseEvent | PointerEvent): PickResult | null => {
      const { cssX, cssY, bufferX, bufferY } = canvasCoordsFromPointerEvent(canvas, e);
      return pickMeshMeasureVertex(scene, cssX, cssY, bufferX, bufferY);
    };

    const buildSegmentText = (pick: PickResult | null, previousWorld: Vector3 | null): string | null => {
      const pickCtx = measurePickCtxRef.current;
      const visible = pickCtx.measurePhase === 'calibrate' ? pickCtx.calibPoints : pickCtx.measurePoints;
      if (!pick || !previousWorld || visible.length !== 1) return null;
      const raw = Vector3.Distance(previousWorld, pick.position);
      if (pickCtx.measurePhase === 'measure' && pickCtx.calibration) {
        return `A→B: ${(raw * pickCtx.calibration.scaleFactor).toFixed(3)} m`;
      }
      return `A→B: ${raw.toFixed(2)} u`;
    };

    const processHover = (e: MouseEvent) => {
      try {
        const pick = pickFromEvent(e);
        const pickCtx = measurePickCtxRef.current;
        const visible = pickCtx.measurePhase === 'calibrate' ? pickCtx.calibPoints : pickCtx.measurePoints;
        const previousWorld = visible.length > 0 ? visible[visible.length - 1].position : null;
        const segmentText = buildSegmentText(pick, previousWorld);

        if (isMeasureDebugEnabled()) {
          console.debug(
            '[Measure] hover pick',
            pick
              ? {
                  mesh: pick.mesh?.name ?? null,
                  snapped: pick.isSnapped,
                  position: pick.position.asArray(),
                }
              : null,
          );
        }

        if (pick) {
          try {
            gizmo.update(pick, camera.position, previousWorld);
          } catch (gizmoErr) {
            console.warn('[Babylon] Measure gizmo update failed:', gizmoErr);
            gizmo.hide();
          }
        } else {
          gizmo.hide();
        }

        onPickHint(
          buildMeasurePickHint(
            pickCtx.measurePhase,
            pickCtx.calibPoints.length,
            pickCtx.measurePoints.length,
            pick,
            segmentText,
          ),
        );
      } catch (pickErr) {
        console.warn('[Babylon] Measure hover pick failed:', pickErr);
        gizmo.hide();
        onPickHint(MEASURE_PICK_HINT_IDLE);
      }
    };

    const hoverLoop = () => {
      hoverRafId = 0;
      if (pendingMouse && pointerInside) {
        processHover(pendingMouse);
      }
    };

    const scheduleHover = (e: MouseEvent) => {
      pendingMouse = e;
      if (!hoverRafId) {
        hoverRafId = requestAnimationFrame(hoverLoop);
      }
    };

    const snapshotOrbit = (): MeasureCameraPose => {
      const orbit = ctx.orbitCamera;
      const target = orbit.getTarget();
      return {
        alpha: orbit.alpha,
        beta: orbit.beta,
        radius: orbit.radius,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDownOnCanvas = true;
      downPos.x = e.clientX;
      downPos.y = e.clientY;
      gestureTravelPx = 0;
      poseAtDown = snapshotOrbit();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!pointerDownOnCanvas || !poseAtDown) return;
      pointerDownOnCanvas = false;
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      const travelPx = Math.max(gestureTravelPx, Math.hypot(dx, dy));
      const commit = shouldCommitMeasurePick(travelPx, poseAtDown, snapshotOrbit());
      poseAtDown = null;
      gestureTravelPx = 0;
      if (!commit) return;
      try {
        const pick = pickFromEvent(e);
        if (pick) {
          if (isMeasureDebugEnabled()) {
            console.debug('[Measure] placed point', {
              mesh: pick.mesh?.name ?? null,
              snapped: pick.isSnapped,
              position: pick.position.asArray(),
            });
          }
          onAddPoint(pick.position);
        }
      } catch (err) {
        console.warn('[Babylon] Measure pick failed:', err);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      onReleaseSelection();
    };

    const onMove = (e: MouseEvent) => {
      if (pointerDownOnCanvas) {
        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        gestureTravelPx = Math.max(gestureTravelPx, Math.hypot(dx, dy));
        if (gestureTravelPx > MEASURE_CLICK_MAX_PX) {
          gizmo.hide();
          return;
        }
      }
      scheduleHover(e);
    };

    const onLeave = () => {
      pointerInside = false;
      pendingMouse = null;
      gizmo.hide();
    };

    const onEnter = (e: MouseEvent) => {
      pointerInside = true;
      if (gestureTravelPx > MEASURE_CLICK_MAX_PX) return;
      scheduleHover(e);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerenter', onEnter);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      if (hoverRafId) cancelAnimationFrame(hoverRafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerenter', onEnter);
      window.removeEventListener('keydown', onKeyDown);
      gizmo.dispose();
    };
  }, [
    mode,
    loadPhase,
    viewerRef,
    canvasRef,
    worldUnitRef,
    onPickHint,
    onAddPoint,
    onReleaseSelection,
  ]);
}
