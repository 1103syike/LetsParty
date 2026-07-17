import type { AnimalId } from '@/types/animal';

/**
 * Quaternius glb 預設是「屁股朝 +Z、臉朝 -Z」
 * 載入後 Y 軸轉 180°，讓臉朝 +Z，鏡頭才能拍到正面
 */
export const ANIMAL_MODEL_YAW = Math.PI;

/** 雞 glb 根節點朝向與其他 Quaternius 動物相反（僅供文件參考，實際用 modelContainer YAW 統一處理） */
export const CHICKEN_IMPORT_ROOT_YAW = Math.PI;

export function getAnimalModelYaw(_animalId: AnimalId): number {
  return ANIMAL_MODEL_YAW;
}

/** import 根節點額外 yaw（目前皆 0；轉向統一走 modelContainer） */
export function getAnimalImportRootYaw(_animalId: AnimalId): number {
  return 0;
}

/** 不要對 import 根節點加 pitch（雞的直立問題已在 chicken.glb skin.skeleton 修正） */
export function getAnimalImportRootPitch(_animalId: AnimalId): number {
  return 0;
}

/**
 * 選角預覽：鏡頭在臉前方略偏，動物 face 鏡頭後再微調 → 左前 3/4 脸
 * ArcRotate alpha ≈ PI/2 時鏡頭在 +Z 側，可看到臉朝 -Z 的動物正面
 */
export const ANIMAL_PREVIEW_CAMERA = {
  alpha: Math.PI / 2 + Math.PI / 8,
  beta: 1.1,
  radius: 2.35,
  targetYRatio: 0.44,
  /** 對準鏡頭後再略轉（左前 3/4） */
  bodyYawOffset: Math.PI / 10,
} as const;

/** 某些模型較寬或較近，預覽鏡頭再拉遠避免破圖 */
export const ANIMAL_PREVIEW_RADIUS_BY_ID: Partial<Record<AnimalId, number>> = {
  sheep: 2.75,
  chicken: 2.45,
  pig: 2.4,
  dog: 2.35,
};

export function getAnimalPreviewRadius(animalId: AnimalId): number {
  return ANIMAL_PREVIEW_RADIUS_BY_ID[animalId] ?? ANIMAL_PREVIEW_CAMERA.radius;
}

/** 比賽主鏡頭：斜俯視擂台 */
export const RPS_MAIN_CAMERA = {
  alpha: (Math.PI * 5) / 4,
  beta: Math.PI / 2.85,
  radius: 24,
  targetY: 0.85,
} as const;

/**
 * 分鏡 bust：半身可愛構圖（头+肩+道具），不要贴脸 macro
 */
export const RPS_PANEL_CAMERA = {
  beta: 1.08,
  radius: 6.2,
  alphaOffset: Math.PI / 16,
  bodyYawOffset: Math.PI / 14,
  /** 略广 FOV → chibi 感、留白多一點 */
  fov: 0.62,
  aimForwardBias: 0.05,
  aimLowerBias: 0.02,
} as const;

/** 鏡頭對準高度（占模型高度比例）：胸口～上腹 */
export const RPS_PANEL_AIM_Y_RATIO_BY_ID: Partial<Record<AnimalId, number>> = {
  dog: 0.42,
  pig: 0.46,
  sheep: 0.4,
  chicken: 0.38,
};

export function getRpsPanelAimYRatio(animalId: AnimalId): number {
  return RPS_PANEL_AIM_Y_RATIO_BY_ID[animalId] ?? 0.42;
}

/** 依体型微调鏡頭距離 */
export const RPS_PANEL_RADIUS_BY_ID: Partial<Record<AnimalId, number>> = {
  dog: 6.55,
  sheep: 6.35,
  pig: 6.25,
  chicken: 6.45,
};

export function getRpsPanelRadius(animalId: AnimalId): number {
  return RPS_PANEL_RADIUS_BY_ID[animalId] ?? RPS_PANEL_CAMERA.radius;
}

export function getAnimalPreviewTargetY(animalId: AnimalId, headHeight: number): number {
  void animalId;
  return headHeight * ANIMAL_PREVIEW_CAMERA.targetYRatio;
}
