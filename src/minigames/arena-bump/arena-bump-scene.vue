<script setup lang="ts">
import {
  ArcRotateCamera,
  Color4,
  Matrix,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, watch } from 'vue';

import { AnimalActor } from '@/common/animals/animal-actor';
import { AnimalCrownCeremony } from '@/common/animals/animal-crown-ceremony';
import { createPartyArenaStage } from '@/common/arena/arena-stage';
import { getBumpCornerSpawn } from '@/common/arena/bump-physics';
import { addPartyArenaDecor } from '@/common/arena/party-arena-decor';
import { ActorKnockbackFallFx } from '@/common/fx/actor-knockback-fall-fx';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { ArenaBumpHitFx } from '@/minigames/arena-bump/arena-bump-hit-fx';
import { setArenaBumpViewBasis } from '@/minigames/arena-bump/arena-bump-view';
import { usePartyStore } from '@/stores/party-store';

const props = defineProps<{
  snapshot: ArenaBumpSnapshot;
}>();

const emit = defineEmits<{
  stageClick: [point: { x: number; z: number }];
}>();

const partyStore = usePartyStore();

const actors = new Map<string, AnimalActor>();
/** 避免每幀重播 idle/run 造成動畫閃爍 */
const locomotions = new Map<
  string,
  'idle' | 'run' | 'jump' | 'fallen' | 'attack' | 'ceremony'
>();
let fallFx: ActorKnockbackFallFx | null = null;
let hitFx: ArenaBumpHitFx | null = null;
let crownCeremony: AnimalCrownCeremony | null = null;
let orbitCamera: ArcRotateCamera | null = null;
let activeScene: Scene | null = null;
let jumpObserver: Observer<Scene> | null = null;
let pointerObserver: Observer<PointerInfo> | null = null;
let sceneReady = false;
let lastHitSerial = 0;
let lastPhase: ArenaBumpSnapshot['phase'] | null = null;
let ceremonyCameraProgress = 0;
let ceremonyCameraFromAlpha = 0;
let ceremonyCameraFromBeta = 0;
let ceremonyCameraFromRadius = 0;
let cameraShakeUntilMs = 0;
let cameraShakeDurationMs = 280;
let cameraShakeStrength = 0;
const cameraShakeOffset = new Vector3(0, 0, 0);
/** 開局無敵白閃相位 */
let flashPhase = 0;
/** 對戰中鎖定在本機動物開局面向背後 */
const PLAY_CAMERA_BETA = Math.PI / 2.72;
const PLAY_CAMERA_RADIUS = 11.5;
const PLAY_CAMERA_TARGET_Y = 0.35;
/** 視線往台心偏多少（0＝盯角色、1＝盯台心）；偏一點讓本機落在畫面偏下 */
const PLAY_CAMERA_LOOK_AHEAD = 0.34;

async function syncActors(scene: Scene): Promise<void> {
  const count = partyStore.participants.length;
  const spawnById = new Map(
    props.snapshot.fighters.map((fighter) => [fighter.id, fighter.spawnSlot]),
  );

  for (let index = 0; index < partyStore.participants.length; index += 1) {
    const participant = partyStore.participants[index]!;

    if (actors.has(participant.id)) {
      continue;
    }

    const spawnSlot = spawnById.get(participant.id) ?? index;
    const spawn = getBumpCornerSpawn(spawnSlot, count);
    const actor = await AnimalActor.create(scene, participant.animalId, participant.color);
    actor.setPosition(spawn.x, spawn.z);
    actor.faceWorldDirection(spawn.facingX, spawn.facingZ);
    actor.playRestPose();
    actors.set(participant.id, actor);
    locomotions.set(participant.id, 'idle');
  }
}

function applySnapshot(snapshot: ArenaBumpSnapshot): void {
  // 頒冠站位由典禮負責，不要被物理座標蓋掉
  if (snapshot.phase === 'crownAward') {
    return;
  }

  for (const fighter of snapshot.fighters) {
    const actor = actors.get(fighter.id);

    if (!actor) {
      continue;
    }

    if (!fighter.alive) {
      if (locomotions.get(fighter.id) !== 'fallen') {
        const participant = partyStore.participants.find((entry) => entry.id === fighter.id);
        fallFx?.beginFall(fighter.id, actor, participant?.color ?? 'player-1');
        locomotions.set(fighter.id, 'fallen');
      }

      continue;
    }

    if (locomotions.get(fighter.id) === 'fallen') {
      actor.setSubtreeEnabled(true);
      actor.root.rotation.x = 0;
      actor.root.rotation.z = 0;
      actor.root.scaling.setAll(1);
      actor.holdStandingPose();
      actor.playIdle();
      locomotions.set(fighter.id, 'idle');
    }

    actor.setPosition(fighter.x, fighter.z);

    if (!fighter.isJumping && !actor.isJumping()) {
      actor.root.position.y = 0;
    }

    if (fighter.isCharging) {
      actor.root.scaling.setAll(1.18);
    } else {
      actor.root.scaling.setAll(1);
    }

    if (hitFx?.isAttackLocked(fighter.id)) {
      locomotions.set(fighter.id, 'attack');

      if (!fighter.isJumping && (fighter.isCharging || Math.hypot(fighter.vx, fighter.vz) > 0.25)) {
        actor.faceWorldDirection(fighter.vx, fighter.vz);
      }

      continue;
    }

    const speed = Math.hypot(fighter.vx, fighter.vz);
    let nextLocomotion: 'idle' | 'run' | 'jump' = 'idle';

    if (fighter.isJumping) {
      nextLocomotion = 'jump';
    } else if (fighter.isCharging || speed > 0.35) {
      nextLocomotion = 'run';
    }

    // 倒數／站定：面向中心；移動中跟速度
    if (snapshot.phase === 'countdown' || speed <= 0.25) {
      actor.faceWorldDirection(fighter.facingX, fighter.facingZ);
    } else if (!fighter.isJumping && (fighter.isCharging || speed > 0.25)) {
      actor.faceWorldDirection(fighter.vx, fighter.vz);
    }

    if (locomotions.get(fighter.id) !== nextLocomotion) {
      if (nextLocomotion === 'jump') {
        actor.playJump();
      } else if (nextLocomotion === 'run') {
        actor.playRun();
      } else {
        actor.playIdle();
      }

      locomotions.set(fighter.id, nextLocomotion);
    }
  }
}

/** 開局無敵白閃：跟 render 跑，不依賴 snapshot watch 觸發頻率 */
function updateSpawnFlash(snapshot: ArenaBumpSnapshot): void {
  flashPhase += 0.22;
  const flashOn = Math.sin(flashPhase) > 0;

  for (const fighter of snapshot.fighters) {
    const actor = actors.get(fighter.id);

    if (!actor || !fighter.alive) {
      continue;
    }

    const loco = locomotions.get(fighter.id);

    if (loco === 'fallen' || loco === 'ceremony') {
      continue;
    }

    if (fighter.isFlashing) {
      actor.setSubtreeEnabled(flashOn);
    } else {
      actor.setSubtreeEnabled(true);
    }
  }
}

function playHitEffects(snapshot: ArenaBumpSnapshot): void {
  if (snapshot.phase !== 'playing') {
    return;
  }

  if (snapshot.hitSerial === lastHitSerial || snapshot.hits.length === 0) {
    return;
  }

  lastHitSerial = snapshot.hitSerial;

  let shakeDuration = 0;
  let shakeStrength = 0;

  for (const hit of snapshot.hits) {
    const attacker = actors.get(hit.attackerId);
    const participant = partyStore.participants.find((entry) => entry.id === hit.attackerId);
    hitFx?.playHit(hit, attacker, participant?.color ?? 'player-1');

    if (hit.kind === 'finisher' || hit.kind === 'charge') {
      shakeDuration = Math.max(shakeDuration, 620);
      shakeStrength = Math.max(shakeStrength, 0.62);
    } else {
      shakeDuration = Math.max(shakeDuration, 220);
      shakeStrength = Math.max(shakeStrength, 0.16);
    }

    if (attacker && locomotions.get(hit.attackerId) !== 'fallen') {
      locomotions.set(hit.attackerId, 'attack');
    }
  }

  if (shakeDuration > 0) {
    cameraShakeUntilMs = performance.now() + shakeDuration;
    cameraShakeDurationMs = shakeDuration;
    cameraShakeStrength = shakeStrength;
  }
}

function updateCameraShake(): void {
  if (!orbitCamera) {
    return;
  }

  // 先清掉上一幀的抖動偏移，避免鏡頭目標一直漂
  orbitCamera.target.subtractInPlace(cameraShakeOffset);
  cameraShakeOffset.setAll(0);

  if (props.snapshot.phase === 'crownAward') {
    return;
  }

  const now = performance.now();

  if (now >= cameraShakeUntilMs || cameraShakeStrength <= 0) {
    return;
  }

  const t = (cameraShakeUntilMs - now) / Math.max(1, cameraShakeDurationMs);
  const strength = cameraShakeStrength * t;
  cameraShakeOffset.set(
    (Math.random() - 0.5) * strength,
    (Math.random() - 0.5) * strength * 0.5,
    (Math.random() - 0.5) * strength,
  );
  orbitCamera.target.addInPlace(cameraShakeOffset);
}

/**
 * 對戰鏡頭：機位鎖出生角外側，視線跟著本機。
 * WASD 讀真實相機前／右軸（arena-bump-view），畫面跟操作才會一致。
 */
function updatePlayCamera(snapshot: ArenaBumpSnapshot): void {
  if (!orbitCamera) {
    return;
  }

  if (snapshot.phase === 'crownAward' || snapshot.phase === 'finished') {
    return;
  }

  const localId = snapshot.localPlayerId ?? partyStore.localParticipantId;
  const local = snapshot.fighters.find((entry) => entry.id === localId);

  if (!local) {
    return;
  }

  const fighterCount = Math.max(snapshot.fighters.length, 1);
  const spawn = getBumpCornerSpawn(local.spawnSlot, fighterCount);
  let radialX = spawn.x;
  let radialZ = spawn.z;
  let radialDist = Math.hypot(radialX, radialZ);

  if (radialDist < 0.001) {
    radialX = -spawn.facingX;
    radialZ = -spawn.facingZ;
    radialDist = Math.hypot(radialX, radialZ) || 1;
  }

  radialX /= radialDist;
  radialZ /= radialDist;

  const horiz = PLAY_CAMERA_RADIUS * Math.sin(PLAY_CAMERA_BETA);
  const height = PLAY_CAMERA_TARGET_Y + PLAY_CAMERA_RADIUS * Math.cos(PLAY_CAMERA_BETA);
  // 視線在本機與台心之間：角色偏下、前方場地比較開
  const lookT = PLAY_CAMERA_LOOK_AHEAD;
  const target = new Vector3(
    local.x * (1 - lookT),
    PLAY_CAMERA_TARGET_Y,
    local.z * (1 - lookT),
  );
  const position = new Vector3(radialX * horiz, height, radialZ * horiz);

  orbitCamera.inputs.clear();
  // 先鬆開鎖：否則上一局的 alpha 上下限會把 setPosition 卡回舊角，換邊就跑掉
  orbitCamera.lowerAlphaLimit = null;
  orbitCamera.upperAlphaLimit = null;
  orbitCamera.lowerBetaLimit = null;
  orbitCamera.upperBetaLimit = null;
  orbitCamera.lowerRadiusLimit = null;
  orbitCamera.upperRadiusLimit = null;

  orbitCamera.setTarget(target);
  orbitCamera.setPosition(position);

  orbitCamera.lowerAlphaLimit = orbitCamera.alpha;
  orbitCamera.upperAlphaLimit = orbitCamera.alpha;
  orbitCamera.lowerBetaLimit = orbitCamera.beta;
  orbitCamera.upperBetaLimit = orbitCamera.beta;
  orbitCamera.lowerRadiusLimit = orbitCamera.radius;
  orbitCamera.upperRadiusLimit = orbitCamera.radius;

  publishViewBasis(position, target);
}

/** 水平前＝相機看向目標；右＝世界上叉前（對齊螢幕左右） */
function publishViewBasis(position: Vector3, target: Vector3): void {
  let forwardX = target.x - position.x;
  let forwardZ = target.z - position.z;
  let forwardDist = Math.hypot(forwardX, forwardZ);

  if (forwardDist < 0.001) {
    forwardX = 0;
    forwardZ = -1;
    forwardDist = 1;
  }

  forwardX /= forwardDist;
  forwardZ /= forwardDist;
  // Babylon 左手：right = up × forward
  const rightX = forwardZ;
  const rightZ = -forwardX;
  setArenaBumpViewBasis(forwardX, forwardZ, rightX, rightZ);
}

function unlockCameraLimits(camera: ArcRotateCamera): void {
  camera.lowerAlphaLimit = null;
  camera.upperAlphaLimit = null;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = Math.PI / 2.15;
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 18;
}

function beginCrownCeremony(snapshot: ArenaBumpSnapshot): void {
  if (!crownCeremony || !orbitCamera) {
    return;
  }

  unlockCameraLimits(orbitCamera);

  const participantIds = partyStore.participants.map((participant) => participant.id);
  const actorList = participantIds
    .map((id) => actors.get(id) ?? null)
    .filter((actor): actor is AnimalActor => actor !== null);

  fallFx?.cancelAll();

  // 掉下去的人也要回台上參加典禮（後方暈倒）
  for (const actor of actorList) {
    actor.setSubtreeEnabled(true);
    actor.root.rotation.x = 0;
    actor.root.rotation.z = 0;
    actor.root.scaling.setAll(1);
    actor.root.position.y = 0;
  }

  const winnerActors = snapshot.crownWinnerIds
    .map((id) => actors.get(id) ?? null)
    .filter((actor): actor is AnimalActor => actor !== null);

  crownCeremony.arrangeActors(actorList, participantIds, snapshot.crownWinnerIds);
  crownCeremony.begin(winnerActors, snapshot.crownAwardDurationMs);

  for (const id of participantIds) {
    locomotions.set(id, 'ceremony');
  }

  ceremonyCameraFromAlpha = orbitCamera.alpha;
  ceremonyCameraFromBeta = orbitCamera.beta;
  ceremonyCameraFromRadius = orbitCamera.radius;
  ceremonyCameraProgress = 0;
  orbitCamera.detachControl();
}

function updateCeremonyCamera(deltaMs: number): void {
  if (!orbitCamera || !crownCeremony) {
    return;
  }

  ceremonyCameraProgress = Math.min(1, ceremonyCameraProgress + deltaMs / 900);
  const eased = 1 - (1 - ceremonyCameraProgress) ** 3;
  const focus = crownCeremony.getFocusTarget();
  const cameraPlan = crownCeremony.getCameraPlan();
  const currentTarget = orbitCamera.getTarget();
  const targetBlend = ceremonyCameraProgress >= 1 ? 1 : 0.1 + eased * 0.08;

  orbitCamera.setTarget(Vector3.Lerp(currentTarget, focus, targetBlend));
  orbitCamera.alpha = ceremonyCameraFromAlpha + (-Math.PI / 2 - ceremonyCameraFromAlpha) * eased;
  orbitCamera.beta = ceremonyCameraFromBeta + (cameraPlan.beta - ceremonyCameraFromBeta) * eased;
  orbitCamera.radius = ceremonyCameraFromRadius + (cameraPlan.radius - ceremonyCameraFromRadius) * eased;
}

function syncPhase(snapshot: ArenaBumpSnapshot): void {
  // 下一分重開：清掉摔飛殘留，站回擂台
  if (
    (lastPhase === 'pointPause' || lastPhase === 'playing')
    && snapshot.phase === 'countdown'
  ) {
    fallFx?.cancelAll();

    for (const [id, actor] of actors) {
      const loco = locomotions.get(id);

      if (loco !== 'fallen' && loco !== 'ceremony') {
        continue;
      }

      actor.setSubtreeEnabled(true);
      actor.root.rotation.x = 0;
      actor.root.rotation.z = 0;
      actor.root.scaling.setAll(1);
      actor.holdStandingPose();
      actor.playIdle();
      locomotions.set(id, 'idle');
    }
  }

  if (snapshot.phase === 'crownAward' && lastPhase !== 'crownAward') {
    fallFx?.cancelAll();
    beginCrownCeremony(snapshot);
  }

  lastPhase = snapshot.phase;
}

/** 滑鼠射線打到 y=0 地面，用來對準撞擊目標 */
function pickStagePoint(scene: Scene, camera: ArcRotateCamera): { x: number; z: number } | null {
  const ray = scene.createPickingRay(
    scene.pointerX,
    scene.pointerY,
    Matrix.Identity(),
    camera,
  );

  if (Math.abs(ray.direction.y) < 0.0001) {
    return null;
  }

  const distance = -ray.origin.y / ray.direction.y;

  if (distance < 0) {
    return null;
  }

  const point = ray.origin.add(ray.direction.scale(distance));

  return {
    x: point.x,
    z: point.z,
  };
}

function bindStagePointer(scene: Scene, camera: ArcRotateCamera): void {
  pointerObserver = scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERDOWN) {
      return;
    }

    if (info.event.button !== 0) {
      return;
    }

    if (props.snapshot.phase !== 'playing' || !props.snapshot.localAlive) {
      return;
    }

    const point = pickStagePoint(scene, camera);

    if (!point) {
      return;
    }

    info.event.preventDefault();
    emit('stageClick', point);
  });
}

const { canvasRef } = useBabylonScene({
  createScene(engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.49, 0.78, 0.94, 1);
    return scene;
  },
  createCamera(scene) {
    const camera = new ArcRotateCamera(
      'arena-bump-cam',
      -Math.PI / 2,
      PLAY_CAMERA_BETA,
      PLAY_CAMERA_RADIUS,
      new Vector3(0, PLAY_CAMERA_TARGET_Y, 0),
      scene,
    );
    camera.fov = 0.72;
    camera.panningSensibility = 0;
    camera.inputs.clear();
    return camera;
  },
  async init({ scene, engine, camera }) {
    createPartyArenaStage(scene);
    addPartyArenaDecor(scene);
    fallFx = new ActorKnockbackFallFx(scene);
    hitFx = new ArenaBumpHitFx(scene);
    crownCeremony = new AnimalCrownCeremony(scene);
    await crownCeremony.preload();
    await syncActors(scene);
    activeScene = scene;
    orbitCamera = camera;
    updatePlayCamera(props.snapshot);
    bindStagePointer(scene, camera);
    jumpObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaMs = scene.getEngine().getDeltaTime();

      for (const actor of actors.values()) {
        actor.update(deltaMs);
      }

      hitFx?.update();
      updatePlayCamera(props.snapshot);
      updateCameraShake();
      updateSpawnFlash(props.snapshot);

      if (props.snapshot.phase === 'crownAward') {
        crownCeremony?.update(deltaMs);
        updateCeremonyCamera(deltaMs);
      }
    });
    sceneReady = true;
    syncPhase(props.snapshot);
    applySnapshot(props.snapshot);
    engine.resize();
  },
});

watch(
  () => props.snapshot,
  (snapshot) => {
    if (!sceneReady) {
      return;
    }

    syncPhase(snapshot);
    playHitEffects(snapshot);
    applySnapshot(snapshot);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (jumpObserver && activeScene) {
    activeScene.onBeforeRenderObservable.remove(jumpObserver);
  }

  if (pointerObserver && activeScene) {
    activeScene.onPointerObservable.remove(pointerObserver);
  }

  jumpObserver = null;
  pointerObserver = null;
  activeScene = null;
  orbitCamera?.detachControl();
  orbitCamera = null;
  fallFx?.dispose();
  fallFx = null;
  hitFx?.dispose();
  hitFx = null;
  crownCeremony?.dispose();
  crownCeremony = null;

  for (const actor of actors.values()) {
    actor.dispose();
  }

  actors.clear();
  locomotions.clear();
  lastHitSerial = 0;
  lastPhase = null;
  sceneReady = false;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="arena-bump-scene"
  />
</template>

<style lang="scss" scoped>
.arena-bump-scene {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
