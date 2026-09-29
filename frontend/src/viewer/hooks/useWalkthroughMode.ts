import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { SceneManifestResponse } from '@/types/job';
import type { BabylonViewerCtx, LoadPhase, ViewerMode } from '../types';
import { applyWalkPathStart } from './useCameraMode';

function requestCanvasPointerLock(canvas: HTMLElement): void {
  if (typeof document !== 'undefined' && document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock?.();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch { /* ignore */ }
}

/** Walkthrough uses Babylon UniversalCamera — orbit→walk copies position in useCameraMode. */
export function useWalkthroughMode(
  viewerRef: RefObject<BabylonViewerCtx | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: ViewerMode,
  loadPhase: LoadPhase,
  sceneManifest: SceneManifestResponse | null,
  sceneScaleRef: RefObject<number>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = viewerRef.current;
    if (!canvas || loadPhase !== 'ready') return;

    if (mode !== 'walkthrough') {
      try {
        document.exitPointerLock?.();
      } catch { /* ignore */ }
      return;
    }

    if (ctx) {
      applyWalkPathStart(ctx, sceneManifest, sceneScaleRef.current ?? 1);
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      requestCanvasPointerLock(canvas);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [mode, loadPhase, canvasRef, viewerRef, sceneManifest, sceneScaleRef]);
}
