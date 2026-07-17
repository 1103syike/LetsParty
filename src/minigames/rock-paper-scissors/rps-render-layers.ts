import type { Scene } from '@babylonjs/core';

/** 分鏡時：場景 bit0 + 各玩家 bit1～4 */
export const RPS_ENV_LAYER = 0x1;

export function getRpsActorLayer(slotIndex: number): number {
  return 0x1 << (slotIndex + 1);
}

/** 分鏡 bust：該格 actor + 同色 3D 色板 */
export function getRpsPanelCameraLayer(slotIndex: number): number {
  return getRpsActorLayer(slotIndex);
}

export const RPS_ALL_LAYERS = 0x0fffffff;

export function tagRpsEnvironmentLayers(scene: Scene): void {
  for (const mesh of scene.meshes) {
    if (mesh.name.startsWith('rps-')) {
      mesh.layerMask = RPS_ENV_LAYER;
    }

    let parent = mesh.parent;

    while (parent) {
      if (parent.name.startsWith('rps-quat-')) {
        mesh.layerMask = RPS_ENV_LAYER;
        break;
      }

      parent = parent.parent;
    }
  }
}
