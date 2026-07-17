import {
  Mesh,
  PBRMaterial,
  Scene,
} from '@babylonjs/core';

import {
  QUATERNius_PALETTE,
  createQuaterniusAtlasMaterial,
  createQuaterniusFlatMaterial,
} from '@/common/quaternius/quaternius-materials';

export function createStageTopMaterial(scene: Scene): PBRMaterial {
  return createQuaterniusFlatMaterial(scene, 'rps-stage-top-mat', QUATERNius_PALETTE.grass);
}

export function createStageSideMaterial(scene: Scene): PBRMaterial {
  return createQuaterniusFlatMaterial(scene, 'rps-stage-side-mat', QUATERNius_PALETTE.platformSide);
}

export function createSeaMaterial(scene: Scene): PBRMaterial {
  return createQuaterniusFlatMaterial(scene, 'rps-sea-mat', QUATERNius_PALETTE.water, 0.35);
}

export function createStageTrimMaterial(scene: Scene): PBRMaterial {
  return createQuaterniusFlatMaterial(scene, 'rps-stage-trim-mat', QUATERNius_PALETTE.trim);
}

export function createSkyMaterial(scene: Scene): PBRMaterial {
  return createQuaterniusFlatMaterial(scene, 'rps-sky-mat', QUATERNius_PALETTE.sky);
}

/** 需要 atlas 色盤時用（例如自訂幾何） */
export function createArenaAtlasMaterial(scene: Scene, name: string): PBRMaterial {
  return createQuaterniusAtlasMaterial(scene, name);
}

export function applyStageMaterial(mesh: Mesh, material: PBRMaterial): void {
  mesh.material = material;
}
