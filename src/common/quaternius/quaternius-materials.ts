import {
  Color3,
  PBRMaterial,
  Scene,
  Texture,
} from '@babylonjs/core';

import { QUATERNius_ATLAS_TEXTURE } from '@/common/quaternius/quaternius-assets';

/** 動物 Atlas 材質（pig / dog / sheep） */
export const QUATERNius_ATLAS_ROUGHNESS = 0.272;

/** 場景道具 flat 材質（platform / cloud 等） */
export const QUATERNius_FLAT_ROUGHNESS = 0.415;

/** 從 Quaternius Platform.glb 取樣的標準色 */
export const QUATERNius_PALETTE = {
  platformTop: Color3.FromHexString('#825C0B'),
  platformSide: Color3.FromHexString('#4D3607'),
  water: Color3.FromHexString('#5EB4C9'),
  sky: Color3.FromHexString('#B8DCE8'),
  cloud: Color3.FromHexString('#F5F5F5'),
  grass: Color3.FromHexString('#6B9E6B'),
  trim: Color3.FromHexString('#A07820'),
} as const;

const atlasTextureByScene = new WeakMap<Scene, Texture>();

export function getQuaterniusAtlasTexture(scene: Scene): Texture {
  const cached = atlasTextureByScene.get(scene);

  if (cached) {
    return cached;
  }

  const texture = new Texture(QUATERNius_ATLAS_TEXTURE, scene, false, false);
  texture.name = 'quaternius-atlas';

  atlasTextureByScene.set(scene, texture);

  return texture;
}

/** 與 Quaternius 動物相同的 AtlasMaterial 設定 */
export function createQuaterniusAtlasMaterial(scene: Scene, name: string): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoTexture = getQuaterniusAtlasTexture(scene);
  material.metallic = 0;
  material.roughness = QUATERNius_ATLAS_ROUGHNESS;
  material.emissiveColor = Color3.Black();

  return material;
}

/** 與 Quaternius 道具相同的 flat PBR（無 emissive、無貼圖） */
export function createQuaterniusFlatMaterial(
  scene: Scene,
  name: string,
  color: Color3,
  roughness = QUATERNius_FLAT_ROUGHNESS,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.metallic = 0;
  material.roughness = roughness;
  material.emissiveColor = Color3.Black();

  return material;
}
