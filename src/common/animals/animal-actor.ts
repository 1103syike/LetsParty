import {
  AnimationGroup,
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  Skeleton,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import '@babylonjs/loaders/glTF';

import { getAnimalById, normalizeAnimalId } from '@/common/animals/animals';
import {
  ANIMAL_PREVIEW_CAMERA,
  getAnimalImportRootPitch,
  getAnimalImportRootYaw,
  getAnimalModelYaw,
} from '@/common/animals/animal-view-config';
import type { AnimalId } from '@/types/animal';
import type { PlayerColor } from '@/types/party';

/** 預設可見於一般相機（非分鏡 mask） */
export const ANIMAL_DEFAULT_LAYER_MASK = 0x0fffffff;

const TARGET_HEIGHT = 1.35;

const PLACEHOLDER_COLOR: Record<AnimalId, Color3> = {
  pig: Color3.FromHexString('#f4a6b8'),
  chicken: Color3.FromHexString('#f5e6a8'),
  dog: Color3.FromHexString('#c9a57a'),
  sheep: Color3.FromHexString('#f0f0f0'),
};

function getAnimationToken(name: string): string {
  return (name.split('|').pop() ?? name).toLowerCase();
}

function matchesAnimationKeyword(name: string, keyword: string): boolean {
  const token = getAnimationToken(name);
  const key = keyword.toLowerCase();

  switch (key) {
    case 'idle':
      return token === 'idle' || token === 'idle_2';
    case 'walk':
      return token === 'walk';
    case 'run':
      return token === 'run';
    case 'gallop':
      return token === 'gallop';
    case 'jump':
      return token.includes('jump');
    case 'attack':
    case 'action':
    case 'headbutt':
    case 'bite':
      return token === 'attack' || token === 'headbutt' || token === 'bite_front';
    case 'death':
      return token === 'death' || token.includes('death') || token.includes('die');
    default:
      return token.includes(key);
  }
}

/** Fox 等模型會有 short name + AnimalArmature| 重複動畫，只保留後者 */
function normalizeAnimationGroups(groups: AnimationGroup[]): AnimationGroup[] {
  const prefixed = groups.filter((group) => group.name.includes('AnimalArmature|'));
  const source = prefixed.length > 0 ? prefixed : groups;
  const seen = new Set<string>();

  return source.filter((group) => {
    const token = getAnimationToken(group.name);

    if (seen.has(token)) {
      return false;
    }

    seen.add(token);
    return true;
  });
}

function findAnimationGroup(
  groups: AnimationGroup[],
  keywords: string[],
): AnimationGroup | null {
  for (const keyword of keywords) {
    const matched = groups.find((group) =>
      matchesAnimationKeyword(group.name, keyword),
    );

    if (matched) {
      return matched;
    }
  }

  return null;
}

/** 優先 Jump_Start；Quaternius 的 jump 通常只有骨架、不含 root 位移 */
function findJumpAnimation(groups: AnimationGroup[]): AnimationGroup | null {
  const jumpStart = groups.find((group) =>
    getAnimationToken(group.name).includes('jump_start'),
  );

  if (jumpStart) {
    return jumpStart;
  }

  return groups.find((group) => {
    const token = getAnimationToken(group.name);

    return token.includes('jump') && !token.includes('gallop');
  }) ?? null;
}

const JUMP_DURATION_MS = 520;
const JUMP_PEAK_HEIGHT = 0.58;
const PANEL_POP_DURATION_MS = 420;
const PANEL_POP_START_SCALE = 0.82;
const PANEL_POP_PEAK_SCALE = 1.09;
/** 腳底 blob 陰影（世界座標貼地） */
const GROUND_SHADOW_Y = 0.02;
const GROUND_SHADOW_RADIUS = 0.48;

/** 掛在 root 下的橢圓陰影；每幀把 local y 抵銷跳躍高度，保持貼地 */
function createAnimalGroundShadow(scene: Scene, root: TransformNode): {
  mesh: Mesh;
  material: StandardMaterial;
} {
  const mesh = MeshBuilder.CreateDisc(
    `${root.name}-ground-shadow`,
    { radius: GROUND_SHADOW_RADIUS, tessellation: 24 },
    scene,
  );
  mesh.parent = root;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, GROUND_SHADOW_Y, 0);
  mesh.isPickable = false;

  const material = new StandardMaterial(`${root.name}-ground-shadow-mat`, scene);
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.alpha = 0.38;
  material.backFaceCulling = false;
  mesh.material = material;

  return { mesh, material };
}

function getPanelPopScale(progress: number): number {
  if (progress <= 0) {
    return PANEL_POP_START_SCALE;
  }

  if (progress < 0.55) {
    const t = progress / 0.55;
    const eased = 1 - (1 - t) ** 3;

    return PANEL_POP_START_SCALE + (PANEL_POP_PEAK_SCALE - PANEL_POP_START_SCALE) * eased;
  }

  const t = (progress - 0.55) / 0.45;
  const eased = 1 - (1 - t) ** 2;

  return PANEL_POP_PEAK_SCALE + (1 - PANEL_POP_PEAK_SCALE) * eased;
}

function collectRenderMeshes(importRoot: AbstractMesh): Mesh[] {
  const meshes = importRoot.getChildMeshes(false, (node) => node instanceof Mesh) as Mesh[];

  if (importRoot instanceof Mesh && importRoot.getTotalVertices() > 0) {
    return [importRoot, ...meshes];
  }

  return meshes.filter((mesh) => mesh.getTotalVertices() > 0);
}

function getNodeBounds(importRoot: AbstractMesh): { min: Vector3; max: Vector3 } {
  const meshes = collectRenderMeshes(importRoot);

  if (meshes.length === 0) {
    return {
      min: Vector3.Zero(),
      max: new Vector3(0, TARGET_HEIGHT, 0),
    };
  }

  let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getHierarchyBoundingVectors();

    min = Vector3.Minimize(min, bounds.min);
    max = Vector3.Maximize(max, bounds.max);
  }

  return { min, max };
}

/**
 * 舊版雞 glb 的 skin.skeleton 指到 Root，Body 卻在旁支 → 蒙皮壞掉。
 * 檔案已改為 skeleton=AnimalArmature；若遇到舊檔，執行期再掛正一次。
 */
function fixChickenBoneHierarchy(importRoot: AbstractMesh): void {
  const nodes = importRoot.getChildTransformNodes(true);
  const rootNode = nodes.find((node) => node.name === 'Root');
  const bodyNode = nodes.find((node) => node.name === 'Body');

  if (!rootNode || !bodyNode || bodyNode.parent === rootNode) {
    return;
  }

  bodyNode.setParent(rootNode, true);
}

/** 縮放到目標高度，腳踩地、幾何中心對齊原點（旋轉以自身中心轉） */
function normalizeToHeight(
  container: TransformNode,
  importRoot: AbstractMesh,
  targetHeight: number,
  importRootYaw = 0,
  importRootPitch = 0,
): number {
  container.scaling.set(1, 1, 1);
  container.position.set(0, 0, 0);
  container.rotationQuaternion = null;
  container.rotation.set(0, 0, 0);

  importRoot.position.set(0, 0, 0);
  importRoot.rotationQuaternion = null;
  importRoot.rotation.set(importRootPitch, importRootYaw, 0);
  importRoot.scaling.set(1, 1, 1);

  importRoot.computeWorldMatrix(true);
  const { min, max } = getNodeBounds(importRoot);
  const height = Math.max(max.y - min.y, 0.001);
  const scale = targetHeight / height;
  const centerX = (min.x + max.x) * 0.5;
  const centerZ = (min.z + max.z) * 0.5;

  importRoot.position.set(-centerX, -min.y, -centerZ);
  container.scaling.set(scale, scale, scale);

  return height * scale;
}

/** Quaternius glb 材質略偏暗，只加極少量 emissive 提轮廓 */
function brightenAnimalMaterials(meshes: Mesh[]): void {
  for (const mesh of meshes) {
    const material = mesh.material;

    if (material instanceof PBRMaterial) {
      const roughness = material.roughness ?? 1;
      material.roughness = Math.min(roughness, 0.95) * 0.9;
      material.emissiveColor = material.emissiveColor.add(new Color3(0.042, 0.042, 0.048));
      continue;
    }

    if (material instanceof StandardMaterial) {
      material.emissiveColor = new Color3(0.048, 0.048, 0.055);
    }
  }
}

function createPlaceholderMesh(
  scene: Scene,
  animalId: AnimalId,
): Mesh {
  const body = MeshBuilder.CreateBox(
    `${animalId}-body`,
    {
      width: 0.9,
      height: 0.75,
      depth: 1.1,
    },
    scene,
  );

  const head = MeshBuilder.CreateBox(
    `${animalId}-head`,
    {
      width: 0.55,
      height: 0.55,
      depth: 0.55,
    },
    scene,
  );

  head.parent = body;
  head.position.y = 0.65;

  const material = new StandardMaterial(`${animalId}-mat`, scene);
  material.diffuseColor = PLACEHOLDER_COLOR[animalId];
  material.emissiveColor = PLACEHOLDER_COLOR[animalId].scale(0.06);
  body.material = material;
  head.material = material;

  return body;
}

function createLabelAnchor(scene: Scene, root: TransformNode, headHeight: number): Mesh {
  const anchor = MeshBuilder.CreateBox(
    `${root.name}-label-anchor`,
    {
      size: 0.01,
    },
    scene,
  );

  anchor.isVisible = false;
  anchor.parent = root;
  // 略高一點，頭上對話框才不會貼臉
  anchor.position.y = headHeight + 0.55;

  return anchor;
}

export class AnimalActor {
  readonly root: TransformNode;

  readonly labelAnchor: Mesh;

  readonly animalId: AnimalId;

  private readonly walkAnimation: AnimationGroup | null;

  private readonly runAnimation: AnimationGroup | null;

  private readonly idleAnimation: AnimationGroup | null;

  private readonly jumpAnimation: AnimationGroup | null;

  private readonly attackAnimation: AnimationGroup | null;

  private readonly deathAnimation: AnimationGroup | null;

  /** 格擋架勢：Eating / HeadLow / Peck 等（沒有專用 block） */
  private readonly defendAnimation: AnimationGroup | null;

  private readonly allAnimationGroups: AnimationGroup[] = [];

  private readonly skeletons: Skeleton[] = [];

  private readonly loadedMeshes: Mesh[] = [];

  private readonly modelContainer: TransformNode;

  private readonly importRoot: AbstractMesh;

  private readonly importRootBindPitch: number;

  private readonly importRootBindYaw: number;

  private readonly modelYaw: number;

  private readonly groundShadow: Mesh;

  private readonly groundShadowMat: StandardMaterial;

  private jumpInProgress = false;

  private jumpElapsedMs = 0;

  private jumpOnFinished: (() => void) | null = null;

  private panelPopActive = false;

  private panelPopElapsedMs = 0;

  private panelPopDelayMs = 0;

  private constructor(
    animalId: AnimalId,
    root: TransformNode,
    modelContainer: TransformNode,
    importRoot: AbstractMesh,
    importRootBindPitch: number,
    importRootBindYaw: number,
    labelAnchor: Mesh,
    modelYaw: number,
    walkAnimation: AnimationGroup | null,
    runAnimation: AnimationGroup | null,
    idleAnimation: AnimationGroup | null,
    jumpAnimation: AnimationGroup | null,
    attackAnimation: AnimationGroup | null,
    deathAnimation: AnimationGroup | null,
    defendAnimation: AnimationGroup | null,
    allAnimationGroups: AnimationGroup[],
    skeletons: Skeleton[],
    loadedMeshes: Mesh[],
  ) {
    this.animalId = animalId;
    this.root = root;
    this.modelContainer = modelContainer;
    this.importRoot = importRoot;
    this.importRootBindPitch = importRootBindPitch;
    this.importRootBindYaw = importRootBindYaw;
    this.modelYaw = modelYaw;
    this.labelAnchor = labelAnchor;
    this.walkAnimation = walkAnimation;
    this.runAnimation = runAnimation;
    this.idleAnimation = idleAnimation;
    this.jumpAnimation = jumpAnimation;
    this.attackAnimation = attackAnimation;
    this.deathAnimation = deathAnimation;
    this.defendAnimation = defendAnimation;
    this.allAnimationGroups = allAnimationGroups;
    this.skeletons = skeletons;
    this.loadedMeshes = loadedMeshes;

    const shadow = createAnimalGroundShadow(root.getScene(), root);
    this.groundShadow = shadow.mesh;
    this.groundShadowMat = shadow.material;
    this.syncGroundShadow();
  }

  isJumping(): boolean {
    return this.jumpInProgress;
  }

  static async create(
    scene: Scene,
    animalId: AnimalId | 'fox',
    playerColor: PlayerColor,
  ): Promise<AnimalActor> {
    void playerColor;
    const resolvedId = normalizeAnimalId(animalId);
    const animal = getAnimalById(resolvedId);
    const root = new TransformNode(`${resolvedId}-root`, scene);
    const modelContainer = new TransformNode(`${resolvedId}-model`, scene);
    modelContainer.parent = root;

    const modelFile = animal.modelPath.split('/').pop() ?? `${animalId}.glb`;
    const modelFolder = animal.modelPath.slice(0, animal.modelPath.lastIndexOf('/') + 1);

    try {
      const result = await SceneLoader.ImportMeshAsync(
        '',
        modelFolder,
        modelFile,
        scene,
      );

      // Babylon 載入後常自動播全部動畫（含 Death）→ 一出場就趴地
      for (const group of result.animationGroups) {
        group.stop();
        group.reset();
      }

      const importRoot = result.meshes[0];

      if (!importRoot) {
        throw new Error(`[Animal] ${modelFile} 沒有根節點`);
      }

      /** 只移動 glb 根節點，保留骨架 hierarchy（拆 mesh 會導致動畫臉朝地板） */
      importRoot.parent = modelContainer;

      if (resolvedId === 'chicken') {
        fixChickenBoneHierarchy(importRoot);
      }

      for (const skeleton of result.skeletons) {
        skeleton.returnToRest();
        skeleton.prepare();
      }

      const renderMeshes = collectRenderMeshes(importRoot);
      brightenAnimalMaterials(renderMeshes);

      const importRootBindPitch = getAnimalImportRootPitch(resolvedId);
      const importRootBindYaw = getAnimalImportRootYaw(resolvedId);
      const headHeight = normalizeToHeight(
        modelContainer,
        importRoot,
        TARGET_HEIGHT,
        importRootBindYaw,
        importRootBindPitch,
      );
      modelContainer.rotation.y = getAnimalModelYaw(resolvedId);
      const labelAnchor = createLabelAnchor(scene, root, headHeight);

      const animationGroups = normalizeAnimationGroups(result.animationGroups);

      /** 雞沒有 Walk，用 Run；待機優先 Idle（不要先 peck，以免看起來像跌倒） */
      const idleKeywords = ['idle'];
      const walkAnimation = findAnimationGroup(animationGroups, ['walk', 'run']);
      const runAnimation = findAnimationGroup(animationGroups, ['run', 'gallop']);
      const idleAnimation = findAnimationGroup(animationGroups, idleKeywords);
      const jumpAnimation = findJumpAnimation(animationGroups);
      const attackAnimation = findAnimationGroup(animationGroups, ['attack', 'action', 'headbutt', 'bite']);
      const deathAnimation = findAnimationGroup(animationGroups, ['death']);
      const defendAnimation = findAnimationGroup(animationGroups, [
        'eating',
        'headlow',
        'peck',
        'hitreact',
      ]);

      return new AnimalActor(
        resolvedId,
        root,
        modelContainer,
        importRoot,
        importRootBindPitch,
        importRootBindYaw,
        labelAnchor,
        getAnimalModelYaw(resolvedId),
        walkAnimation ?? runAnimation,
        runAnimation ?? walkAnimation,
        idleAnimation,
        jumpAnimation,
        attackAnimation,
        deathAnimation,
        defendAnimation,
        animationGroups,
        result.skeletons,
        renderMeshes,
      );
    } catch (error) {
      console.warn(`[Animal] 無法載入 ${animal.modelPath}，改用佔位模型`, error);

      const placeholder = createPlaceholderMesh(scene, resolvedId);
      placeholder.parent = modelContainer;

      const headHeight = normalizeToHeight(modelContainer, placeholder, TARGET_HEIGHT);
      modelContainer.rotation.y = getAnimalModelYaw(resolvedId);
      const labelAnchor = createLabelAnchor(scene, root, headHeight);

      return new AnimalActor(
        resolvedId,
        root,
        modelContainer,
        placeholder,
        0,
        0,
        labelAnchor,
        getAnimalModelYaw(resolvedId),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        [],
        [],
        [placeholder],
      );
    }
  }

  /** 漫遊每幀更新：跳躍弧線 + 腳底陰影貼地 */
  update(deltaMs: number): void {
    if (this.jumpInProgress) {
      this.jumpElapsedMs += deltaMs;
      const progress = Math.min(1, this.jumpElapsedMs / JUMP_DURATION_MS);
      this.root.position.y = JUMP_PEAK_HEIGHT * 4 * progress * (1 - progress);

      if (progress >= 1) {
        this.finishJump();
      }
    }

    // 排球等會從外面改 root.y，每幀都要同步陰影
    this.syncGroundShadow();
  }

  /** 陰影貼在地面：抵銷 root 高度，跳越高越淡越大 */
  private syncGroundShadow(): void {
    const height = Math.max(0, this.root.position.y);
    this.groundShadow.position.y = -height + GROUND_SHADOW_Y;
    const t = Math.min(1, height / 2.2);
    const scale = 1 + t * 0.55;
    this.groundShadow.scaling.set(scale, 1, scale);
    this.groundShadowMat.alpha = 0.38 * (1 - t * 0.65);
  }

  /** 鏡頭對準的高度（約胸口） */
  getAimTarget(): Vector3 {
    return new Vector3(
      this.root.position.x,
      this.root.position.y + TARGET_HEIGHT * 0.42,
      this.root.position.z,
    );
  }

  /** 分鏡 bust 特寫：鏡頭對準胸口～脸（非头頂 macro） */
  getPanelAimTarget(): Vector3 {
    const bounds = this.getWorldBounds();
    const centerY = (bounds.min.y + bounds.max.y) * 0.5;

    return new Vector3(
      this.root.position.x,
      centerY,
      this.root.position.z,
    );
  }

  /** 分鏡 bust 特寫：對準頭部（供其他用途） */
  getHeadTarget(): Vector3 {
    return new Vector3(
      this.root.position.x,
      this.root.position.y + TARGET_HEIGHT * 0.74,
      this.root.position.z,
    );
  }

  /** 皇冠落點：模型實際最高點中央（不是臉中心，避免穿模） */
  getCrownSeatTarget(): Vector3 {
    this.root.computeWorldMatrix(true);
    const bounds = this.getWorldBounds();

    return new Vector3(
      (bounds.min.x + bounds.max.x) * 0.5,
      bounds.max.y,
      (bounds.min.z + bounds.max.z) * 0.5,
    );
  }

  /** 分鏡 pose：面向該格 panel 鏡頭 + 微側身 3/4 脸 */
  applyPanelPose(camera: ArcRotateCamera, bodyYawOffset: number): void {
    this.faceTowardWorldPoint(camera.position.x, camera.position.z);
    this.root.rotation.y += bodyYawOffset;
  }

  /** 進入分鏡：定格 bind pose，不播 idle（避免雞 peck 把頭埋到畫面外） */
  playPanelEntrance(): void {
    this.holdStandingPose();
  }

  /** Snapshot pop：1 → 1.08 → 1，可錯開 delay */
  playPanelPopEntrance(delayMs = 0): void {
    this.panelPopActive = true;
    this.panelPopElapsedMs = 0;
    this.panelPopDelayMs = delayMs;
    this.root.scaling.setAll(PANEL_POP_START_SCALE);
    this.playPanelEntrance();
  }

  updatePanelPop(deltaMs: number): void {
    if (!this.panelPopActive) {
      return;
    }

    this.panelPopElapsedMs += deltaMs;
    const localMs = this.panelPopElapsedMs - this.panelPopDelayMs;

    if (localMs < 0) {
      this.root.scaling.setAll(PANEL_POP_START_SCALE);
      return;
    }

    const progress = Math.min(1, localMs / PANEL_POP_DURATION_MS);
    this.root.scaling.setAll(getPanelPopScale(progress));

    if (progress >= 1) {
      this.panelPopActive = false;
      this.root.scaling.setAll(1);
    }
  }

  resetPanelPop(): void {
    this.panelPopActive = false;
    this.panelPopElapsedMs = 0;
    this.panelPopDelayMs = 0;
    this.root.scaling.setAll(1);
  }

  setPosition(x: number, z: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
  }

  /** Quaternius 模型轉正後，root 要扣掉 modelContainer 的 YAW 才是世界朝向 */
  faceWorldDirection(dirX: number, dirZ: number): void {
    if (Math.abs(dirX) < 0.001 && Math.abs(dirZ) < 0.001) {
      return;
    }

    this.root.rotation.y = Math.atan2(dirX, dirZ) - this.modelYaw;
  }

  faceTowardWorldPoint(worldX: number, worldZ: number): void {
    this.faceWorldDirection(
      worldX - this.root.position.x,
      worldZ - this.root.position.z,
    );
  }

  playWalk(): void {
    this.stopMovingAnimations();

    if (this.walkAnimation) {
      this.walkAnimation.start(true);
    }
  }

  playRun(): void {
    this.stopMovingAnimations();

    if (this.runAnimation) {
      this.runAnimation.start(true);
      return;
    }

    this.playWalk();
  }

  playIdle(): void {
    this.stopMovingAnimations();
    this.resetSkeletonPose();
    this.restoreModelBindOrientation();

    if (this.idleAnimation) {
      this.idleAnimation.start(true);
    }
  }

  /** 站立待機：先重置骨架，避免動畫中途停住變成跌倒 */
  playRestPose(): void {
    this.holdStandingPose();
    this.playIdle();
  }

  /** 頒冠慶祝：跳一下再回 idle */
  playCelebrate(): void {
    this.playJump(() => {
      this.playIdle();
    });
  }

  /** 輸家暈倒：播 Death，停在最後一幀（趴地） */
  playFaint(): void {
    this.jumpInProgress = false;
    this.jumpElapsedMs = 0;
    this.jumpOnFinished = null;
    this.root.position.y = 0;
    this.stopMovingAnimations();
    this.resetSkeletonPose();
    this.restoreModelBindOrientation();

    if (this.deathAnimation) {
      this.deathAnimation.start(false);
      return;
    }

    this.playIdle();
  }

  /** 選角預覽：面向鏡頭 + 左前 3/4 角 */
  applyPreviewPose(camera: ArcRotateCamera): void {
    this.holdStandingPose();
    this.faceTowardWorldPoint(camera.position.x, camera.position.z);
    this.root.rotation.y += ANIMAL_PREVIEW_CAMERA.bodyYawOffset;
  }

  playJump(onFinished?: () => void): void {
    if (this.jumpInProgress) {
      return;
    }

    this.jumpInProgress = true;
    this.jumpElapsedMs = 0;
    this.jumpOnFinished = onFinished ?? null;
    this.root.position.y = 0;

    if (this.jumpAnimation) {
      this.jumpAnimation.start(false);
      return;
    }

    if (this.runAnimation) {
      this.runAnimation.start(true);
      return;
    }

    this.playWalk();
  }

  private finishJump(): void {
    this.jumpInProgress = false;
    this.jumpElapsedMs = 0;
    this.root.position.y = 0;

    const onFinished = this.jumpOnFinished;
    this.jumpOnFinished = null;
    onFinished?.();
    this.playRestPose();
  }

  playAttack(): void {
    this.stopMovingAnimations();

    if (this.attackAnimation) {
      this.attackAnimation.start(false);
      return;
    }

    this.playRestPose();
  }

  /** 排球墊擊／舉球：低頭／進食姿播一次（跟殺球 Attack 區分） */
  playBumpHit(): void {
    this.jumpInProgress = false;
    this.jumpElapsedMs = 0;
    this.jumpOnFinished = null;
    this.stopMovingAnimations();
    this.resetSkeletonPose();
    this.restoreModelBindOrientation();

    if (this.defendAnimation) {
      this.defendAnimation.start(false);
      return;
    }

    if (this.attackAnimation) {
      this.attackAnimation.start(false);
      return;
    }

    this.playIdle();
  }

  /** 格擋：低頭／進食架勢 loop；沒有就維持 idle */
  playDefend(): void {
    this.jumpInProgress = false;
    this.jumpElapsedMs = 0;
    this.jumpOnFinished = null;
    this.root.position.y = 0;
    this.stopMovingAnimations();
    this.resetSkeletonPose();
    this.restoreModelBindOrientation();

    if (this.defendAnimation) {
      this.defendAnimation.start(true);
      return;
    }

    if (this.idleAnimation) {
      this.idleAnimation.start(true);
    }
  }

  dispose(): void {
    for (const group of this.allAnimationGroups) {
      group.dispose();
    }

    this.labelAnchor.dispose();
    this.groundShadowMat.dispose();
    this.groundShadow.dispose();

    for (const mesh of this.loadedMeshes) {
      mesh.dispose();
    }

    this.modelContainer.dispose();
    this.root.dispose();
  }

  /** 設定渲染 layer（分鏡／一般場景共用） */
  applyLayerMask(layerMask: number, renderingGroupId = 0): void {
    for (const mesh of this.root.getChildMeshes(true)) {
      mesh.layerMask = layerMask;
      mesh.renderingGroupId = renderingGroupId;
    }

    for (const mesh of this.loadedMeshes) {
      mesh.layerMask = layerMask;
      mesh.renderingGroupId = renderingGroupId;
    }

    this.labelAnchor.layerMask = layerMask;
    this.labelAnchor.renderingGroupId = renderingGroupId;
  }

  private getWorldBounds(): { min: Vector3; max: Vector3 } {
    const meshes = this.loadedMeshes.length > 0
      ? this.loadedMeshes
      : this.root.getChildMeshes(true) as Mesh[];

    if (meshes.length === 0) {
      return {
        min: Vector3.Zero(),
        max: new Vector3(0, TARGET_HEIGHT, 0),
      };
    }

    let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getHierarchyBoundingVectors();
      min = Vector3.Minimize(min, bounds.min);
      max = Vector3.Maximize(max, bounds.max);
    }

    return { min, max };
  }

  setSubtreeEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
  }

  /** 面向擂台中央，分鏡時讓鏡頭拍到正面 */
  faceTowardCenter(): void {
    this.faceWorldDirection(-this.root.position.x, -this.root.position.z);
  }

  /** 分鏡定格：停止動畫、骨架回 bind pose、確保直立 */
  holdStandingPose(): void {
    this.jumpInProgress = false;
    this.jumpElapsedMs = 0;
    this.jumpOnFinished = null;
    this.root.position.y = 0;
    this.stopMovingAnimations();
    this.resetSkeletonPose();
    this.restoreModelBindOrientation();
  }

  private restoreModelBindOrientation(): void {
    this.importRoot.rotationQuaternion = null;
    this.importRoot.rotation.set(this.importRootBindPitch, this.importRootBindYaw, 0);
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.modelContainer.rotationQuaternion = null;
    this.modelContainer.rotation.x = 0;
    this.modelContainer.rotation.y = this.modelYaw;
    this.modelContainer.rotation.z = 0;
  }

  private resetSkeletonPose(): void {
    for (const skeleton of this.skeletons) {
      skeleton.returnToRest();
    }
  }

  private stopMovingAnimations(): void {
    for (const group of this.allAnimationGroups) {
      group.stop();
    }
  }
}

export function getRpsSlotX(slotIndex: number): number {
  const offsets = [-4.2, -1.4, 1.4, 4.2];

  return offsets[slotIndex] ?? 0;
}

export const RPS_WALK_START_Z = -6;

export const RPS_WALK_END_Z = 0;

export function lerpWalkPosition(progress: number, slotIndex: number): Vector3 {
  const eased = 1 - (1 - progress) ** 2;

  return new Vector3(
    getRpsSlotX(slotIndex),
    0,
    RPS_WALK_START_Z + (RPS_WALK_END_Z - RPS_WALK_START_Z) * eased,
  );
}
