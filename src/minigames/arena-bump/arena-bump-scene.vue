<script setup lang="ts">
import {
  ArcRotateCamera,
  Color4,
  type Observer,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, watch } from 'vue';

import { AnimalActor } from '@/common/animals/animal-actor';
import { AnimalCrownCeremony } from '@/common/animals/animal-crown-ceremony';
import { createPartyArenaStage } from '@/common/arena/arena-stage';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { ArenaBumpDefendFx } from '@/minigames/arena-bump/arena-bump-defend-fx';
import { ArenaBumpFallFx } from '@/minigames/arena-bump/arena-bump-fall-fx';
import { ArenaBumpHitFx } from '@/minigames/arena-bump/arena-bump-hit-fx';
import { usePartyStore } from '@/stores/party-store';

const props = defineProps<{
  snapshot: ArenaBumpSnapshot;
}>();

const partyStore = usePartyStore();

const actors = new Map<string, AnimalActor>();
/** 避免每幀重播 idle/run 造成動畫閃爍 */
const locomotions = new Map<
  string,
  'idle' | 'run' | 'jump' | 'fallen' | 'attack' | 'defend' | 'ceremony'
>();
let fallFx: ArenaBumpFallFx | null = null;
let hitFx: ArenaBumpHitFx | null = null;
let defendFx: ArenaBumpDefendFx | null = null;
let crownCeremony: AnimalCrownCeremony | null = null;
let orbitCamera: ArcRotateCamera | null = null;
let activeScene: Scene | null = null;
let jumpObserver: Observer<Scene> | null = null;
let sceneReady = false;
let lastHitSerial = 0;
let lastPhase: ArenaBumpSnapshot['phase'] | null = null;
let ceremonyCameraProgress = 0;
let ceremonyCameraFromAlpha = 0;
let ceremonyCameraFromBeta = 0;
let ceremonyCameraFromRadius = 0;

async function syncActors(scene: Scene): Promise<void> {
  for (const participant of partyStore.participants) {
    if (actors.has(participant.id)) {
      continue;
    }

    const actor = await AnimalActor.create(scene, participant.animalId, participant.color);
    actor.playRestPose();
    actor.faceTowardCenter();
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
      defendFx?.hide(fighter.id);

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

    actor.root.position.x = fighter.x;
    actor.root.position.z = fighter.z;

    if (!fighter.isJumping && !actor.isJumping()) {
      actor.root.position.y = 0;
    }

    if (fighter.isCharging) {
      actor.root.scaling.setAll(1.12);
    } else if (fighter.isDefending) {
      actor.root.scaling.setAll(0.94);
    } else {
      actor.root.scaling.setAll(1);
    }

    if (hitFx?.isAttackLocked(fighter.id)) {
      defendFx?.hide(fighter.id);
      locomotions.set(fighter.id, 'attack');

      if (!fighter.isJumping && (fighter.isCharging || Math.hypot(fighter.vx, fighter.vz) > 0.25)) {
        actor.faceWorldDirection(fighter.vx, fighter.vz);
      }

      continue;
    }

    const speed = Math.hypot(fighter.vx, fighter.vz);
    let nextLocomotion: 'idle' | 'run' | 'jump' | 'defend' = 'idle';

    if (fighter.isJumping) {
      nextLocomotion = 'jump';
    } else if (fighter.isDefending) {
      nextLocomotion = 'defend';
    } else if (fighter.isCharging || speed > 0.35) {
      nextLocomotion = 'run';
    }

    // 格擋時用 facing；移動時跟速度
    if (fighter.isDefending) {
      actor.faceWorldDirection(fighter.facingX, fighter.facingZ);
    } else if (!fighter.isJumping && (fighter.isCharging || speed > 0.25)) {
      actor.faceWorldDirection(fighter.vx, fighter.vz);
    }

    if (locomotions.get(fighter.id) !== nextLocomotion) {
      if (nextLocomotion === 'jump') {
        actor.playJump();
      } else if (nextLocomotion === 'defend') {
        actor.playDefend();
      } else if (nextLocomotion === 'run') {
        actor.playRun();
      } else {
        actor.playIdle();
      }

      locomotions.set(fighter.id, nextLocomotion);
    }
  }
}

function syncDefendShields(snapshot: ArenaBumpSnapshot, deltaMs: number): void {
  if (!defendFx || snapshot.phase !== 'playing') {
    defendFx?.hideAll();
    return;
  }

  for (const fighter of snapshot.fighters) {
    const participant = partyStore.participants.find((entry) => entry.id === fighter.id);
    const actor = actors.get(fighter.id);
    const y = actor?.root.position.y ?? 0;

    defendFx.sync(
      fighter.id,
      fighter.alive && fighter.isDefending && !fighter.isJumping,
      participant?.color ?? 'player-1',
      fighter.x,
      y,
      fighter.z,
      fighter.facingX,
      fighter.facingZ,
      deltaMs,
    );
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

    if (attacker && locomotions.get(hit.attackerId) !== 'fallen') {
      locomotions.set(hit.attackerId, 'attack');
    }
  }
}

function beginCrownCeremony(snapshot: ArenaBumpSnapshot): void {
  if (!crownCeremony || !orbitCamera) {
    return;
  }

  const participantIds = partyStore.participants.map((participant) => participant.id);
  const actorList = participantIds
    .map((id) => actors.get(id) ?? null)
    .filter((actor): actor is AnimalActor => actor !== null);

  fallFx?.cancelAll();
  defendFx?.hideAll();

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

const { canvasRef } = useBabylonScene({
  createScene(engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.72, 0.86, 0.91, 1);
    return scene;
  },
  createCamera(scene) {
    const camera = new ArcRotateCamera(
      'arena-bump-cam',
      -Math.PI / 2.05,
      Math.PI / 2.72,
      11.5,
      new Vector3(0, 0.35, 0),
      scene,
    );
    camera.fov = 0.72;
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 18;
    camera.lowerBetaLimit = 0.35;
    camera.upperBetaLimit = Math.PI / 2.15;
    camera.wheelPrecision = 28;
    camera.panningSensibility = 0;
    camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    return camera;
  },
  async init({ scene, engine, camera, canvas }) {
    createPartyArenaStage(scene);
    fallFx = new ArenaBumpFallFx(scene);
    hitFx = new ArenaBumpHitFx(scene);
    defendFx = new ArenaBumpDefendFx(scene);
    crownCeremony = new AnimalCrownCeremony(scene);
    await crownCeremony.preload();
    await syncActors(scene);
    activeScene = scene;
    orbitCamera = camera;
    camera.attachControl(canvas, true);
    jumpObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaMs = scene.getEngine().getDeltaTime();

      for (const actor of actors.values()) {
        actor.update(deltaMs);
      }

      syncDefendShields(props.snapshot, deltaMs);

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

  jumpObserver = null;
  activeScene = null;
  orbitCamera?.detachControl();
  orbitCamera = null;
  fallFx?.dispose();
  fallFx = null;
  hitFx?.dispose();
  hitFx = null;
  defendFx?.dispose();
  defendFx = null;
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
