import {
  ArcRotateCamera,
  Color3,
  Scene,
  Vector3,
  Viewport,
} from '@babylonjs/core';

import {
  RPS_PANEL_CAMERA,
  getRpsPanelRadius,
} from '@/common/animals/animal-view-config';
import type { RpsAnimalActor } from '@/minigames/rock-paper-scissors/rps-animal-actor';
import { FOCUS_PANEL_POSITIONS } from '@/minigames/rock-paper-scissors/rps-chaos-roam';
import { computeComicPanelViewports } from '@/minigames/rock-paper-scissors/rps-comic-viewports';
import { getRpsPanelCameraLayer } from '@/minigames/rock-paper-scissors/rps-render-layers';
import {
  RPS_ROAMING_AMBIENT,
  RPS_ROAMING_EXPOSURE,
} from '@/minigames/rock-paper-scissors/rps-scene-environment';

/**
 * 動漫分鏡 bust：對準胸口、略拉遠，每格角度微差
 */
export interface PanelShotConfig {
  alphaOffset: number;
  beta: number;
  radiusScale: number;
  bodyYawOffset: number;
}

export const PANEL_SHOT_BY_SLOT: PanelShotConfig[] = [
  { alphaOffset: RPS_PANEL_CAMERA.alphaOffset, beta: RPS_PANEL_CAMERA.beta, radiusScale: 1, bodyYawOffset: RPS_PANEL_CAMERA.bodyYawOffset },
  { alphaOffset: -RPS_PANEL_CAMERA.alphaOffset, beta: RPS_PANEL_CAMERA.beta - 0.02, radiusScale: 0.98, bodyYawOffset: -RPS_PANEL_CAMERA.bodyYawOffset },
  { alphaOffset: RPS_PANEL_CAMERA.alphaOffset * 1.12, beta: RPS_PANEL_CAMERA.beta + 0.015, radiusScale: 1.01, bodyYawOffset: RPS_PANEL_CAMERA.bodyYawOffset * 0.85 },
  { alphaOffset: -RPS_PANEL_CAMERA.alphaOffset * 1.12, beta: RPS_PANEL_CAMERA.beta - 0.01, radiusScale: 0.99, bodyYawOffset: -RPS_PANEL_CAMERA.bodyYawOffset * 0.85 },
];

function getPanelAimTarget(
  actor: RpsAnimalActor | undefined,
  slot: { x: number; z: number },
  fallbackX: number,
  fallbackZ: number,
): Vector3 {
  if (!actor) {
    return new Vector3(fallbackX, 0.72, fallbackZ);
  }

  const aim = actor.getPanelAimTarget();
  const towardCenterX = -slot.x;
  const towardCenterZ = -slot.z;
  const length = Math.hypot(towardCenterX, towardCenterZ) || 1;

  return new Vector3(
    aim.x + (towardCenterX / length) * RPS_PANEL_CAMERA.aimForwardBias,
    aim.y - RPS_PANEL_CAMERA.aimLowerBias,
    aim.z + (towardCenterZ / length) * RPS_PANEL_CAMERA.aimForwardBias,
  );
}

function aimPanelCamera(
  camera: ArcRotateCamera,
  slotIndex: number,
  actor: RpsAnimalActor | undefined,
  x: number,
  z: number,
): void {
  const slot = FOCUS_PANEL_POSITIONS[slotIndex] ?? FOCUS_PANEL_POSITIONS[0];
  const shot = PANEL_SHOT_BY_SLOT[slotIndex] ?? PANEL_SHOT_BY_SLOT[0];
  const target = getPanelAimTarget(actor, slot, x, z);

  camera.setTarget(target);

  const towardCenter = Math.atan2(-slot.x, -slot.z);
  camera.alpha = towardCenter + shot.alphaOffset;
  camera.beta = shot.beta;

  const baseRadius = actor ? getRpsPanelRadius(actor.animalId) : RPS_PANEL_CAMERA.radius;
  camera.radius = baseRadius * shot.radiusScale;

  if (actor) {
    actor.applyPanelPose(camera, shot.bodyYawOffset);
  }
}

export class RpsComicPanels {
  readonly mainCamera: ArcRotateCamera;

  private readonly panelCameras: ArcRotateCamera[] = [];

  private splitEnabled = false;

  constructor(scene: Scene, mainCamera: ArcRotateCamera) {
    this.mainCamera = mainCamera;
    this.mainCamera.layerMask = 0x0fffffff;

    for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
      const slot = FOCUS_PANEL_POSITIONS[slotIndex] ?? FOCUS_PANEL_POSITIONS[0];
      const shot = PANEL_SHOT_BY_SLOT[slotIndex] ?? PANEL_SHOT_BY_SLOT[0];
      const camera = new ArcRotateCamera(
        `rps-panel-cam-${slotIndex}`,
        Math.PI / 2,
        shot.beta,
        RPS_PANEL_CAMERA.radius,
        new Vector3(slot.x, 0.72, slot.z),
        scene,
      );

      camera.layerMask = getRpsPanelCameraLayer(slotIndex);
      camera.fov = RPS_PANEL_CAMERA.fov;
      camera.lowerRadiusLimit = 4.5;
      camera.upperRadiusLimit = 8.5;
      camera.minZ = 0.08;
      camera.attachControl = () => undefined;
      camera.setEnabled(false);

      aimPanelCamera(camera, slotIndex, undefined, slot.x, slot.z);
      this.panelCameras[slotIndex] = camera;
    }

    this.applyMainViewport(true);
  }

  syncViewports(canvas: HTMLCanvasElement): void {
    const viewports = computeComicPanelViewports(canvas.width, canvas.height);

    for (let slotIndex = 0; slotIndex < this.panelCameras.length; slotIndex += 1) {
      const camera = this.panelCameras[slotIndex];
      const viewport = viewports[slotIndex];

      if (camera && viewport) {
        camera.viewport = viewport;
      }
    }
  }

  setSplitEnabled(enabled: boolean): void {
    if (this.splitEnabled === enabled) {
      return;
    }

    this.splitEnabled = enabled;
    this.applyMainViewport(!enabled);

    for (const camera of this.panelCameras) {
      camera?.setEnabled(enabled);
    }
  }

  update(actors: RpsAnimalActor[]): void {
    if (!this.splitEnabled) {
      return;
    }

    for (let slotIndex = 0; slotIndex < this.panelCameras.length; slotIndex += 1) {
      const camera = this.panelCameras[slotIndex];
      const actor = actors[slotIndex];
      const fallback = FOCUS_PANEL_POSITIONS[slotIndex] ?? FOCUS_PANEL_POSITIONS[0];
      const x = actor?.root.position.x ?? fallback.x;
      const z = actor?.root.position.z ?? fallback.z;

      if (!camera) {
        continue;
      }

      aimPanelCamera(camera, slotIndex, actor, x, z);
    }
  }

  getPanelCamera(slotIndex: number): ArcRotateCamera | null {
    return this.panelCameras[slotIndex] ?? null;
  }

  dispose(): void {
    for (const camera of this.panelCameras) {
      camera?.dispose();
    }

    this.panelCameras.length = 0;
  }

  private applyMainViewport(useMain: boolean): void {
    this.mainCamera.setEnabled(useMain);

    if (useMain) {
      this.mainCamera.viewport = new Viewport(0, 0, 1, 1);
    }
  }

  applyToScene(scene: Scene): void {
    if (!this.splitEnabled) {
      this.mainCamera.setEnabled(true);
      scene.activeCameras = null;
      scene.activeCamera = this.mainCamera;
      return;
    }

    this.mainCamera.setEnabled(false);
    scene.activeCameras = this.panelCameras;
    scene.activeCamera = this.panelCameras[0] ?? this.mainCamera;
  }
}

export function tintSceneForSplit(scene: Scene, enabled: boolean): void {
  if (enabled) {
    scene.clearColor.set(0.1, 0.08, 0.14, 1);
    scene.ambientColor = new Color3(0.64, 0.62, 0.7);
    scene.imageProcessingConfiguration.exposure = 1.14;
    scene.imageProcessingConfiguration.contrast = 1.02;
    return;
  }

  scene.clearColor.set(0.72, 0.86, 0.91, 1);
  scene.ambientColor = RPS_ROAMING_AMBIENT.clone();
  scene.imageProcessingConfiguration.exposure = RPS_ROAMING_EXPOSURE;
}

export function tintSceneForCrownAward(scene: Scene, enabled: boolean): void {
  if (enabled) {
    scene.clearColor.set(0.58, 0.68, 0.78, 1);
    scene.ambientColor = new Color3(0.66, 0.64, 0.72);
    scene.imageProcessingConfiguration.exposure = 1.12;
    scene.imageProcessingConfiguration.contrast = 1.04;
    return;
  }

  scene.clearColor.set(0.72, 0.86, 0.91, 1);
  scene.ambientColor = RPS_ROAMING_AMBIENT.clone();
  scene.imageProcessingConfiguration.exposure = RPS_ROAMING_EXPOSURE;
}
