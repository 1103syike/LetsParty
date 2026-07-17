export const ANIMAL_IDS = ['pig', 'chicken', 'dog', 'sheep'] as const;

export type AnimalId = (typeof ANIMAL_IDS)[number];

/** 3D 模型來源：Quaternius，CC0 可商用 */
export const ANIMAL_MODEL_LICENSE = 'CC0 (Quaternius)' as const;

export interface AnimalDefinition {
  id: AnimalId;
  name: string;
  /** 放入 public 後的 glb 路徑（Babylon SceneLoader 用） */
  modelPath: string;
}
