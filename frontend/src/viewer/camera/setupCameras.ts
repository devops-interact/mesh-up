import { ArcRotateCamera, UniversalCamera, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { ORBIT_BETA_MAX, ORBIT_BETA_MIN, ORBIT_MAX_DIST_MULT, ORBIT_MIN_DIST_FRAC } from '../constants';

/** Pointer pixels that pan the orbit target by about one radius. */
export const ORBIT_PAN_PIXELS_PER_RADIUS = 600;
/** Lower than Babylon's 1000 default so a short drag turns the model. */
export const ORBIT_ANGULAR_SENSIBILITY = 450;
export const ORBIT_INERTIA = 0.65;
/** Fraction of the current radius applied per wheel notch (deltaY ≈ 100). */
export const ORBIT_WHEEL_DELTA_PERCENTAGE = 0.05;

/** Higher than 500 so look is not twitchy; near Babylon's 2000 default. */
export const WALK_ANGULAR_SENSIBILITY = 2500;
export const WALK_INERTIA = 0.2;
export const WALK_SPEED_MIN = 0.2;
export const WALK_SPEED_MAX = 4;
const WALK_SPEED_DIAGONAL_DIVISOR = 10;

export function orbitPanSensibility(radius: number): number {
  const safe = Number.isFinite(radius) && radius > 1e-4 ? radius : 1e-4;
  return ORBIT_PAN_PIXELS_PER_RADIUS / safe;
}

/** Cross the scene in about ten seconds, without the old diagonal × 0.5 sprint. */
export function walkSpeedForDiagonal(diagonal: number): number {
  const span = Number.isFinite(diagonal) && diagonal > 0 ? diagonal : 1;
  return Math.min(WALK_SPEED_MAX, Math.max(WALK_SPEED_MIN, span / WALK_SPEED_DIAGONAL_DIVISOR));
}

/** Pull the orbit in when a new pivot would leave the camera very far from the model. */
export function cappedOrbitRadius(radius: number, diagonal: number, lowerLimit: number | null): number {
  const lower = lowerLimit ?? 0;
  const cap = Math.max((diagonal > 0 ? diagonal : radius) * 0.85, lower);
  return radius > cap ? cap : radius;
}

export function applyOrbitZoomLimitsFromDiagonal(orbitCam: ArcRotateCamera, effectiveDiagonal: number): void {
  if (!(effectiveDiagonal > 0)) return;
  const minD = Math.max(1e-4, effectiveDiagonal * ORBIT_MIN_DIST_FRAC);
  const maxD = Math.max(minD * 2, effectiveDiagonal * ORBIT_MAX_DIST_MULT);
  orbitCam.lowerRadiusLimit = minD;
  orbitCam.upperRadiusLimit = maxD;
}

export function syncOrbitPanToRadius(orbitCamera: ArcRotateCamera): void {
  orbitCamera.panningSensibility = orbitPanSensibility(orbitCamera.radius);
}

export function applyOrbitNavigation(orbitCamera: ArcRotateCamera): void {
  orbitCamera.angularSensibilityX = ORBIT_ANGULAR_SENSIBILITY;
  orbitCamera.angularSensibilityY = ORBIT_ANGULAR_SENSIBILITY;
  orbitCamera.inertia = ORBIT_INERTIA;
  orbitCamera.panningInertia = ORBIT_INERTIA;
  orbitCamera.wheelDeltaPercentage = ORBIT_WHEEL_DELTA_PERCENTAGE;
  orbitCamera.panningAxis = new Vector3(1, 1, 0);
  orbitCamera.useNaturalPinchZoom = true;
  orbitCamera.zoomToMouseLocation = true;
  syncOrbitPanToRadius(orbitCamera);
}

export function configureOrbitControls(orbitCamera: ArcRotateCamera): void {
  orbitCamera.lowerBetaLimit = ORBIT_BETA_MIN;
  orbitCamera.upperBetaLimit = ORBIT_BETA_MAX;
  applyOrbitNavigation(orbitCamera);
}

/** First-person keys: WASD plus arrows, Space up, Shift down. No gravity or collision. */
export function configureWalkControls(walkCamera: UniversalCamera): void {
  walkCamera.angularSensibility = WALK_ANGULAR_SENSIBILITY;
  walkCamera.inertia = WALK_INERTIA;
  walkCamera.checkCollisions = false;
  walkCamera.applyGravity = false;
  walkCamera.keysUp = [38, 87];
  walkCamera.keysDown = [40, 83];
  walkCamera.keysLeft = [37, 65];
  walkCamera.keysRight = [39, 68];
  walkCamera.keysUpward = [33, 32];
  walkCamera.keysDownward = [34, 16];
}

export function setupCamerasFromPose(
  scene: Scene,
  canvas: HTMLCanvasElement,
  position: [number, number, number],
  lookAt: [number, number, number],
  cameraUp: [number, number, number],
  walkSpeed: number,
): { orbitCamera: ArcRotateCamera; walkCamera: UniversalCamera } {
  const target = new Vector3(lookAt[0], lookAt[1], lookAt[2]);
  const eye = new Vector3(position[0], position[1], position[2]);
  const up = new Vector3(cameraUp[0], cameraUp[1], cameraUp[2]);

  const orbitCamera = new ArcRotateCamera('orbit', -Math.PI / 2, Math.PI / 2.5, 5, target, scene);
  orbitCamera.upVector = up;
  orbitCamera.setPosition(eye);
  orbitCamera.setTarget(target);
  orbitCamera.attachControl(canvas, false);
  orbitCamera.minZ = 0.01;
  orbitCamera.maxZ = 10000;
  configureOrbitControls(orbitCamera);

  const walkCamera = new UniversalCamera('walk', eye.clone(), scene);
  walkCamera.setTarget(target);
  walkCamera.upVector = up.clone();
  walkCamera.minZ = 0.01;
  walkCamera.maxZ = 10000;
  walkCamera.speed = walkSpeed;
  configureWalkControls(walkCamera);

  scene.activeCamera = orbitCamera;
  return { orbitCamera, walkCamera };
}

export function scaleCameraPairFromOrigin(
  position: [number, number, number],
  lookAt: [number, number, number],
  scale: number,
): { position: [number, number, number]; lookAt: [number, number, number] } {
  if (scale === 1) {
    return { position: [...position] as [number, number, number], lookAt: [...lookAt] as [number, number, number] };
  }
  return {
    position: [
      lookAt[0] + (position[0] - lookAt[0]) * scale,
      lookAt[1] + (position[1] - lookAt[1]) * scale,
      lookAt[2] + (position[2] - lookAt[2]) * scale,
    ],
    lookAt: [...lookAt] as [number, number, number],
  };
}
