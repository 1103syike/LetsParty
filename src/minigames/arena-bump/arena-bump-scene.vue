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
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { ArenaBumpFallFx } from '@/minigames/arena-bump/arena-bump-fall-fx';
import { ArenaBumpHitFx } from '@/minigames/arena-bump/arena-bump-hit-fx';
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
let fallFx: ArenaBumpFallFx | null = null;
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
let cameraShakeStrength = 0;
const cameraShakeOffset = new Vector3(0, 0, 0);
/** 對戰中鎖定在本機動物開局面向背後 */
const PLAY_CAMERA_BETA = Math.PI / 2.72;
const PLAY_CAMERA_RADIUS = 11.5;
const PLAY_CAMERA_TARGET_Y = 0.35;

async function syncActors(scene: Scene): Promise<void> {
  const count = partyStore.participants.length;

  for (let index = 0; index < partyStore.participants.length; index += 1) {
    const participant = partyStore.participants[index]!;

    if (actors.has(participant.id)) {
      continue;
    }

    const spawn = getBumpCornerSpawn(index, count);
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

function playHitEffects(snapshot: ArenaBumpSnapshot): void {
  if (snapshot.phase !== 'playing') {
    return;
  }

  if (snapshot.hitSerial === lastHitSerial || snapshot.hits.length === 0) {
    return;
  }

  lastHitSerial = snapshot.hitSerial;

  for (const hit of snapshot.hits) {
    const attacker = actors.get(hit.attackerId);
    const participant = partyStore.participants.find((entry) => entry.id === hit.attackerId);
    hitFx?.playHit(hit, attacker, participant?.color ?? 'player-1');

    if (hit.kind === 'charge') {
      cameraShakeUntilMs = performance.now() + 280;
      cameraShakeStrength = 0.22;
    }

    if (attacker && locomotions.get(hit.attackerId) !== 'fallen') {
      locomotions.set(hit.attackerId, 'attack');
    }
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

  const t = (cameraShakeUntilMs - now) / 280;
  const strength = cameraShakeStrength * t;
  cameraShakeOffset.set(
    (Math.random() - 0.5) * strength,
    (Math.random() - 0.5) * strength * 0.45,
    (Math.random() - 0.5) * strength,
  );
  orbitCamera.target.addInPlace(cameraShakeOffset);
}

function resolveLocalSpawnIndex(): number {
  const localId = props.snapshot.localPlayerId ?? partyStore.localParticipantId;
  const index = partyStore.participants.findIndex((participant) => participant.id === localId);
  return index >= 0 ? index : 0;
}

/** 站在本機動物開局面向的正後方，視線朝台心（動物一開始看的方向） */
function lockPlayCameraToLocalSpawn(camera: ArcRotateCamera): void {
  const count = Math.max(partyStore.participants.length, 1);
  const spawn = getBumpCornerSpawn(resolveLocalSpawnIndex(), count);
  const behindX = -spawn.facingX;
  const behindZ = -spawn.facingZ;
  const horiz = PLAY_CAMERA_RADIUS * Math.sin(PLAY_CAMERA_BETA);
  const target = new Vector3(0, PLAY_CAMERA_TARGET_Y, 0);

  camera.inputs.clear();
  camera.setTarget(target);
  camera.setPosition(
    new Vector3(
      behindX * horiz,
      PLAY_CAMERA_TARGET_Y + PLAY_CAMERA_RADIUS * Math.cos(PLAY_CAMERA_BETA),
      behindZ * horiz,
    ),
  );

  camera.lowerAlphaLimit = camera.alpha;
  camera.upperAlphaLimit = camera.alpha;
  camera.lowerBetaLimit = camera.beta;
  camera.upperBetaLimit = camera.beta;
  camera.lowerRadiusLimit = camera.radius;
  camera.upperRadiusLimit = camera.radius;
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
  if (snapshot.phase === 'crownAward' && lastPhase !== 'crownAward') {
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
    fallFx = new ArenaBumpFallFx(scene);
    hitFx = new ArenaBumpHitFx(scene);
    crownCeremony = new AnimalCrownCeremony(scene);
    await crownCeremony.preload();
    await syncActors(scene);
    activeScene = scene;
    orbitCamera = camera;
    lockPlayCameraToLocalSpawn(camera);
    bindStagePointer(scene, camera);
    jumpObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaMs = scene.getEngine().getDeltaTime();

      for (const actor of actors.values()) {
        actor.update(deltaMs);
      }

      hitFx?.update();
      updateCameraShake();

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
