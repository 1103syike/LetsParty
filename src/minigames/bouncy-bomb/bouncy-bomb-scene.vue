<script setup lang="ts">
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, ref, watch } from 'vue';

import { AnimalActor } from '@/common/animals/animal-actor';
import { AnimalCrownCeremony } from '@/common/animals/animal-crown-ceremony';
import { ActorKnockbackFallFx } from '@/common/fx/actor-knockback-fall-fx';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { BouncyBombSnapshot } from '@/minigames/bouncy-bomb/bouncy-bomb';
import { createBouncyBombCourt } from '@/minigames/bouncy-bomb/bouncy-bomb-court';
import { BouncyBombFx } from '@/minigames/bouncy-bomb/bouncy-bomb-fx';
import {
  BOMB_BLAST_RADIUS,
  BOMB_RADIUS,
  CROWN_AWARD_MS,
  ELIM_KNOCKBACK_DISTANCE,
  ELIM_KNOCKBACK_DURATION_MS,
  HIT_KNOCKBACK_DISTANCE,
  HIT_KNOCKBACK_DURATION_MS,
  HIT_KNOCKBACK_PEAK_Y,
  HIT_KNOCKBACK_SPIN_REVS,
  PLAYER_COLOR_HEX,
} from '@/minigames/bouncy-bomb/bouncy-bomb-tuning';
import { usePartyStore } from '@/stores/party-store';

const props = defineProps<{
  snapshot: BouncyBombSnapshot;
}>();

const emit = defineEmits<{
  courtAim: [value: { x: number; z: number }];
  courtClick: [value: { x: number; z: number }];
}>();

const partyStore = usePartyStore();

const actors = new Map<string, AnimalActor>();
const locomotions = new Map<string, 'idle' | 'run' | 'fallen' | 'ceremony'>();
const bombMeshes = new Map<string, TransformNode>();
const landRingMeshes = new Map<string, Mesh>();
const respawnMarkers = new Map<string, Mesh>();
let aimRingMesh: Mesh | null = null;
let aimRingMat: StandardMaterial | null = null;
let courtPickMesh: Mesh | null = null;
let landPulsePhase = 0;
let blastFx: BouncyBombFx | null = null;
let fallFx: ActorKnockbackFallFx | null = null;
let crownCeremony: AnimalCrownCeremony | null = null;
let orbitCamera: ArcRotateCamera | null = null;
let activeScene: Scene | null = null;
let renderObserver: Observer<Scene> | null = null;
let pointerObserver: Observer<PointerInfo> | null = null;
let sceneReady = false;
let lastPhase: BouncyBombSnapshot['phase'] | null = null;
let lastBlastSerial = 0;
let teamRevealCameraActive = false;
let flashPhase = 0;
let ceremonyCameraProgress = 0;
let ceremonyCameraFromAlpha = 0;
let ceremonyCameraFromBeta = 0;
let ceremonyCameraFromRadius = 0;

const headCountdown = ref<{
  playerId: string;
  seconds: number;
  x: number;
  y: number;
} | null>(null);

function createCourt(scene: Scene): void {
  const built = createBouncyBombCourt(scene);
  courtPickMesh = built.courtPickMesh;

  aimRingMesh = MeshBuilder.CreateDisc(
    'bb-aim-ring',
    { radius: BOMB_BLAST_RADIUS, tessellation: 48 },
    scene,
  );
  aimRingMesh.rotation.x = Math.PI / 2;
  aimRingMat = new StandardMaterial('bb-aim-ring-mat', scene);
  aimRingMat.diffuseColor = Color3.FromHexString('#e86b8a');
  aimRingMat.emissiveColor = Color3.FromHexString('#e86b8a').scale(0.8);
  aimRingMat.alpha = 0.35;
  aimRingMat.disableLighting = true;
  aimRingMat.backFaceCulling = false;
  aimRingMesh.material = aimRingMat;
  aimRingMesh.isPickable = false;
  aimRingMesh.setEnabled(false);
}

function createBombVisual(scene: Scene, colorHex: string): TransformNode {
  const root = new TransformNode(`bb-bomb-${Math.random().toString(36).slice(2, 8)}`, scene);
  const body = MeshBuilder.CreateSphere('bb-bomb-body', { diameter: BOMB_RADIUS * 2, segments: 12 }, scene);
  const mat = new StandardMaterial('bb-bomb-mat', scene);
  mat.diffuseColor = Color3.FromHexString(colorHex);
  mat.emissiveColor = Color3.FromHexString(colorHex).scale(0.35);
  body.material = mat;
  body.parent = root;
  body.isPickable = false;

  const fuse = MeshBuilder.CreateCylinder(
    'bb-bomb-fuse',
    { height: 0.28, diameter: 0.06 },
    scene,
  );
  fuse.position.y = BOMB_RADIUS + 0.1;
  const fuseMat = new StandardMaterial('bb-bomb-fuse-mat', scene);
  fuseMat.diffuseColor = Color3.FromHexString('#5c4d82');
  fuse.material = fuseMat;
  fuse.parent = root;
  fuse.isPickable = false;

  return root;
}

function createLandRing(scene: Scene, colorHex: string): Mesh {
  const ring = MeshBuilder.CreateDisc(
    `bb-land-ring-${Math.random().toString(36).slice(2, 8)}`,
    { radius: BOMB_BLAST_RADIUS, tessellation: 40 },
    scene,
  );
  ring.rotation.x = Math.PI / 2;
  const mat = new StandardMaterial('bb-land-ring-mat', scene);
  mat.diffuseColor = Color3.FromHexString(colorHex);
  mat.emissiveColor = Color3.FromHexString(colorHex).scale(0.7);
  mat.alpha = 0.28;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  ring.material = mat;
  ring.isPickable = false;
  return ring;
}

function pickCourtPoint(scene: Scene): { x: number; z: number } | null {
  if (!courtPickMesh) {
    return null;
  }

  const hit = scene.pick(
    scene.pointerX,
    scene.pointerY,
    (mesh) => mesh === courtPickMesh,
  );

  if (!hit?.hit || !hit.pickedPoint) {
    return null;
  }

  return { x: hit.pickedPoint.x, z: hit.pickedPoint.z };
}

function bindCourtPointer(scene: Scene): void {
  pointerObserver = scene.onPointerObservable.add((info) => {
    if (
      props.snapshot.phase === 'crownAward'
      || props.snapshot.phase === 'finished'
      || props.snapshot.phase === 'teamReveal'
      || props.snapshot.phase === 'countdown'
      || props.snapshot.phase === 'pointPause'
      || props.snapshot.localRespawnActive
    ) {
      return;
    }

    if (
      info.type !== PointerEventTypes.POINTERMOVE
      && info.type !== PointerEventTypes.POINTERDOWN
    ) {
      return;
    }

    const point = pickCourtPoint(scene);

    if (!point) {
      return;
    }

    if (info.type === PointerEventTypes.POINTERMOVE) {
      emit('courtAim', point);
      return;
    }

    if (info.event.button !== 0) {
      return;
    }

    info.event.preventDefault();
    emit('courtClick', point);
  });
}

async function syncActors(scene: Scene): Promise<void> {
  for (const participant of partyStore.participants) {
    if (actors.has(participant.id)) {
      continue;
    }

    const actor = await AnimalActor.create(scene, participant.animalId, participant.color);
    actors.set(participant.id, actor);
    locomotions.set(participant.id, 'idle');
  }
}

function applyFixedSideCamera(
  camera: ArcRotateCamera,
  localTeamId: BouncyBombSnapshot['localTeamId'],
): void {
  const alpha = localTeamId === 'b' ? Math.PI / 2 : -Math.PI / 2;
  // 側視略俯，看清大半場與落點圈
  const beta = Math.PI / 3.2;
  const radius = 34;
  camera.inputs.clear();
  camera.detachControl();
  camera.setTarget(new Vector3(0, 1.4, 0));
  camera.alpha = alpha;
  camera.beta = beta;
  camera.radius = radius;
  camera.lowerAlphaLimit = alpha;
  camera.upperAlphaLimit = alpha;
  camera.lowerBetaLimit = beta;
  camera.upperBetaLimit = beta;
  camera.lowerRadiusLimit = radius;
  camera.upperRadiusLimit = radius;
}

function applyTeamRevealCamera(
  camera: ArcRotateCamera,
  localTeamId: BouncyBombSnapshot['localTeamId'],
): void {
  const alpha = localTeamId === 'b' ? Math.PI / 2 : -Math.PI / 2;
  const beta = Math.PI / 3.0;
  const radius = 40;
  camera.setTarget(new Vector3(0, 1.4, 0));
  camera.alpha = alpha;
  camera.beta = beta;
  camera.radius = radius;
  camera.lowerAlphaLimit = alpha;
  camera.upperAlphaLimit = alpha;
  camera.lowerBetaLimit = beta;
  camera.upperBetaLimit = beta;
  camera.lowerRadiusLimit = radius;
  camera.upperRadiusLimit = radius;
}

function beginTeamReveal(snapshot: BouncyBombSnapshot): void {
  teamRevealCameraActive = true;

  if (orbitCamera) {
    applyTeamRevealCamera(orbitCamera, snapshot.localTeamId);
  }

  let delay = 0;

  for (const player of snapshot.players) {
    const actor = actors.get(player.id);

    if (!actor) {
      continue;
    }

    actor.setPosition(player.x, player.z);
    actor.root.position.y = player.y;
    actor.faceWorldDirection(Math.sin(player.facingY), Math.cos(player.facingY));
    actor.playPanelPopEntrance(delay);
    actor.playCelebrate();
    locomotions.set(player.id, 'ceremony');
    delay += 90;
  }
}

function endTeamReveal(): void {
  teamRevealCameraActive = false;

  for (const [id, actor] of actors) {
    actor.resetPanelPop();
    locomotions.set(id, 'idle');
    actor.playIdle();
  }

  if (orbitCamera) {
    applyFixedSideCamera(orbitCamera, props.snapshot.localTeamId);
  }
}

function syncPhase(snapshot: BouncyBombSnapshot): void {
  if (snapshot.phase === lastPhase) {
    return;
  }

  const prev = lastPhase;
  lastPhase = snapshot.phase;

  if (snapshot.phase === 'teamReveal') {
    beginTeamReveal(snapshot);
    return;
  }

  if (prev === 'teamReveal') {
    endTeamReveal();
  }

  if (snapshot.phase === 'crownAward') {
    fallFx?.cancelAll();
    startCrownCeremony(snapshot);
  }

  if (
    orbitCamera
    && (
      snapshot.phase === 'playing'
      || snapshot.phase === 'countdown'
      || snapshot.phase === 'pointPause'
    )
  ) {
    applyFixedSideCamera(orbitCamera, snapshot.localTeamId);
  }
}

function startCrownCeremony(snapshot: BouncyBombSnapshot): void {
  if (!crownCeremony || !orbitCamera) {
    return;
  }

  const participantIds = partyStore.participants.map((participant) => participant.id);
  const actorList = participantIds
    .map((id) => actors.get(id) ?? null)
    .filter((actor): actor is AnimalActor => actor !== null);

  for (const actor of actorList) {
    actor.setSubtreeEnabled(true);
    actor.root.position.y = 0;
    actor.root.scaling.setAll(1);
  }

  const winnerActors = snapshot.crownWinnerIds
    .map((id) => actors.get(id) ?? null)
    .filter((actor): actor is AnimalActor => actor !== null);

  crownCeremony.arrangeActors(actorList, participantIds, snapshot.crownWinnerIds);
  crownCeremony.begin(winnerActors, CROWN_AWARD_MS);

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

function syncBombs(snapshot: BouncyBombSnapshot, scene: Scene): void {
  const liveIds = new Set(snapshot.bombs.map((bomb) => bomb.id));
  landPulsePhase += 0.12;

  for (const [id, mesh] of bombMeshes) {
    if (!liveIds.has(id)) {
      mesh.dispose();
      bombMeshes.delete(id);
    }
  }

  for (const [id, ring] of landRingMeshes) {
    if (!liveIds.has(id)) {
      ring.dispose();
      landRingMeshes.delete(id);
    }
  }

  for (const bomb of snapshot.bombs) {
    let mesh = bombMeshes.get(bomb.id);

    if (!mesh) {
      mesh = createBombVisual(scene, bomb.colorHex);
      bombMeshes.set(bomb.id, mesh);
    }

    mesh.position.set(bomb.x, bomb.y, bomb.z);
    mesh.rotation.y += 0.08;

    let ring = landRingMeshes.get(bomb.id);

    if (!ring) {
      ring = createLandRing(scene, bomb.colorHex);
      landRingMeshes.set(bomb.id, ring);
    }

    // 愈接近落地脈衝愈快愈明顯
    const urgency = Math.max(0, 1 - bomb.y / 3.2);
    const pulse = 1 + Math.sin(landPulsePhase * (1.2 + urgency * 2.4)) * (0.04 + urgency * 0.1);
    const mat = ring.material as StandardMaterial;
    mat.alpha = 0.22 + urgency * 0.38;
    ring.position.set(bomb.landX, 0.03, bomb.landZ);
    ring.scaling.setAll(pulse);
  }
}

function syncRespawnMarkers(snapshot: BouncyBombSnapshot, scene: Scene): void {
  const liveIds = new Set(
    snapshot.players
      .filter((player) => player.isRespawning && player.respawnX != null && player.respawnZ != null)
      .map((player) => player.id),
  );

  for (const [id, marker] of respawnMarkers) {
    if (!liveIds.has(id)) {
      marker.dispose();
      respawnMarkers.delete(id);
    }
  }

  for (const player of snapshot.players) {
    if (!player.isRespawning || player.respawnX == null || player.respawnZ == null) {
      continue;
    }

    let marker = respawnMarkers.get(player.id);

    if (!marker) {
      marker = MeshBuilder.CreateDisc(
        `bb-respawn-${player.id}`,
        { radius: 0.85, tessellation: 28 },
        scene,
      );
      marker.rotation.x = Math.PI / 2;
      const mat = new StandardMaterial(`bb-respawn-mat-${player.id}`, scene);
      const hex = PLAYER_COLOR_HEX[player.color] ?? '#9b7fd4';
      mat.diffuseColor = Color3.FromHexString(hex);
      mat.emissiveColor = Color3.FromHexString(hex).scale(0.65);
      mat.alpha = 0.42;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      marker.material = mat;
      marker.isPickable = false;
      respawnMarkers.set(player.id, marker);
    }

    const pulse = 1 + Math.sin(landPulsePhase * 1.6) * 0.08;
    marker.position.set(player.respawnX, 0.05, player.respawnZ);
    marker.scaling.setAll(pulse);
  }
}

function syncAimPreview(snapshot: BouncyBombSnapshot): void {
  if (!aimRingMesh || !aimRingMat) {
    return;
  }

  const preview = snapshot.aimPreview;

  if (!preview || snapshot.localRespawnActive || snapshot.phase !== 'playing') {
    aimRingMesh.setEnabled(false);
    return;
  }

  aimRingMat.diffuseColor = Color3.FromHexString(preview.colorHex);
  aimRingMat.emissiveColor = Color3.FromHexString(preview.colorHex).scale(0.75);
  aimRingMesh.position.set(preview.x, 0.04, preview.z);
  aimRingMesh.scaling.setAll(preview.radius / BOMB_BLAST_RADIUS);
  aimRingMesh.setEnabled(true);
}

function applySnapshot(snapshot: BouncyBombSnapshot): void {
  if (!activeScene) {
    return;
  }

  if (snapshot.blast && snapshot.blastSerial !== lastBlastSerial) {
    lastBlastSerial = snapshot.blastSerial;
    blastFx?.playBurst(snapshot.blast.x, snapshot.blast.z, snapshot.blast.colorHex);

    for (const hit of snapshot.blast.hits) {
      const actor = actors.get(hit.victimId);
      const player = snapshot.players.find((entry) => entry.id === hit.victimId);

      if (!actor || !player) {
        continue;
      }

      const dirX = player.x - snapshot.blast.x;
      const dirZ = player.z - snapshot.blast.z;
      fallFx?.beginFall(hit.victimId, actor, player.color, {
        outwardDistance: hit.eliminated ? ELIM_KNOCKBACK_DISTANCE : HIT_KNOCKBACK_DISTANCE,
        arcPeakY: HIT_KNOCKBACK_PEAK_Y,
        durationMs: hit.eliminated ? ELIM_KNOCKBACK_DURATION_MS : HIT_KNOCKBACK_DURATION_MS,
        spinRevolutions: HIT_KNOCKBACK_SPIN_REVS,
        hideOnLand: true,
        dirX: Math.abs(dirX) + Math.abs(dirZ) > 0.05 ? dirX : player.x || 0.3,
        dirZ: Math.abs(dirX) + Math.abs(dirZ) > 0.05 ? dirZ : player.z || 0.3,
      });
      locomotions.set(hit.victimId, 'fallen');
    }
  }

  syncBombs(snapshot, activeScene);
  syncRespawnMarkers(snapshot, activeScene);
  syncAimPreview(snapshot);

  for (const player of snapshot.players) {
    const actor = actors.get(player.id);

    if (!actor) {
      continue;
    }

    if (locomotions.get(player.id) === 'ceremony') {
      continue;
    }

    if (!player.alive) {
      if (locomotions.get(player.id) !== 'fallen') {
        fallFx?.beginFall(player.id, actor, player.color, {
          outwardDistance: ELIM_KNOCKBACK_DISTANCE,
          arcPeakY: HIT_KNOCKBACK_PEAK_Y,
          durationMs: ELIM_KNOCKBACK_DURATION_MS,
          spinRevolutions: HIT_KNOCKBACK_SPIN_REVS,
          hideOnLand: true,
        });
        locomotions.set(player.id, 'fallen');
      } else if (!fallFx?.isAnimating(player.id)) {
        // 星星飛完藏在場外
        actor.setSubtreeEnabled(false);
      }

      continue;
    }

    if (player.isRespawning) {
      // 倒數期間維持炸飛；飛完先藏起來，重生再出現
      if (fallFx?.isAnimating(player.id)) {
        continue;
      }

      actor.setSubtreeEnabled(false);
      continue;
    }

    if (fallFx?.isAnimating(player.id)) {
      continue;
    }

    if (locomotions.get(player.id) === 'fallen') {
      locomotions.set(player.id, 'idle');
      fallFx?.clearActor(player.id);
      actor.playIdle();
    }

    actor.setSubtreeEnabled(true);
    actor.setPosition(player.x, player.z);
    actor.root.position.y = player.y;
    actor.faceWorldDirection(Math.sin(player.facingY), Math.cos(player.facingY));

    const nextLoco: 'idle' | 'run' = player.isMoving ? 'run' : 'idle';

    if (locomotions.get(player.id) !== nextLoco) {
      if (nextLoco === 'run') {
        actor.playRun();
      } else {
        actor.playIdle();
      }

      locomotions.set(player.id, nextLoco);
    }

    if (player.isFlashing) {
      flashPhase += 0.35;
      actor.setSubtreeEnabled(Math.sin(flashPhase) > 0);
    }
  }

  updateHeadCountdown(snapshot);
}

function updateHeadCountdown(snapshot: BouncyBombSnapshot): void {
  const localRespawning = snapshot.players.find(
    (player) =>
      player.id === snapshot.localPlayerId
      && player.isRespawning
      && player.respawnX != null
      && player.respawnZ != null,
  );
  const respawning = localRespawning ?? snapshot.players.find(
    (player) =>
      player.isRespawning
      && player.respawnX != null
      && player.respawnZ != null,
  );

  if (!respawning || !activeScene || !orbitCamera) {
    headCountdown.value = null;
    return;
  }

  const canvas = activeScene.getEngine().getRenderingCanvas();

  if (!canvas) {
    headCountdown.value = null;
    return;
  }

  const engine = activeScene.getEngine();
  const tw = engine.getRenderWidth();
  const th = engine.getRenderHeight();
  const projected = Vector3.Project(
    new Vector3(respawning.respawnX!, 2.1, respawning.respawnZ!),
    Matrix.Identity(),
    activeScene.getTransformMatrix(),
    orbitCamera.viewport.toGlobal(tw, th),
  );
  const rect = canvas.getBoundingClientRect();

  headCountdown.value = {
    playerId: respawning.id,
    seconds: Math.max(1, Math.ceil(respawning.respawnMsLeft / 1000)),
    x: (projected.x / tw) * rect.width,
    y: (projected.y / th) * rect.height,
  };
}

const { canvasRef } = useBabylonScene({
  createScene(engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.12, 0.1, 0.2, 1);
    return scene;
  },
  createCamera(scene) {
    const camera = new ArcRotateCamera(
      'bb-cam',
      -Math.PI / 2,
      Math.PI / 3.2,
      34,
      new Vector3(0, 1.4, 0),
      scene,
    );
    camera.inputs.clear();
    return camera;
  },
  async init({ scene, engine, camera }) {
    createCourt(scene);
    blastFx = new BouncyBombFx(scene);
    fallFx = new ActorKnockbackFallFx(scene);
    crownCeremony = new AnimalCrownCeremony(scene);
    await crownCeremony.preload();
    await syncActors(scene);
    activeScene = scene;
    orbitCamera = camera;
    applyFixedSideCamera(camera, props.snapshot.localTeamId);
    bindCourtPointer(scene);
    renderObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaMs = scene.getEngine().getDeltaTime();
      blastFx?.update();

      for (const actor of actors.values()) {
        actor.update(deltaMs);

        if (props.snapshot.phase === 'teamReveal') {
          actor.updatePanelPop(deltaMs);
        }
      }

      if (props.snapshot.phase === 'crownAward') {
        crownCeremony?.update(deltaMs);
        updateCeremonyCamera(deltaMs);
      }

      if (props.snapshot.phase === 'teamReveal' && teamRevealCameraActive && orbitCamera) {
        applyTeamRevealCamera(orbitCamera, props.snapshot.localTeamId);
      }

      updateHeadCountdown(props.snapshot);
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
    applySnapshot(snapshot);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (activeScene) {
    if (renderObserver) {
      activeScene.onBeforeRenderObservable.remove(renderObserver);
    }

    if (pointerObserver) {
      activeScene.onPointerObservable.remove(pointerObserver);
    }
  }

  renderObserver = null;
  pointerObserver = null;
  activeScene = null;
  orbitCamera?.detachControl();
  orbitCamera = null;
  aimRingMesh?.dispose();
  aimRingMesh = null;
  aimRingMat = null;
  courtPickMesh = null;
  blastFx?.dispose();
  blastFx = null;
  fallFx?.dispose();
  fallFx = null;
  crownCeremony?.dispose();
  crownCeremony = null;

  for (const mesh of bombMeshes.values()) {
    mesh.dispose();
  }

  bombMeshes.clear();

  for (const ring of landRingMeshes.values()) {
    ring.dispose();
  }

  landRingMeshes.clear();

  for (const marker of respawnMarkers.values()) {
    marker.dispose();
  }

  respawnMarkers.clear();

  for (const actor of actors.values()) {
    actor.dispose();
  }

  actors.clear();
  locomotions.clear();
  sceneReady = false;
  lastPhase = null;
  lastBlastSerial = 0;
  headCountdown.value = null;
});
</script>

<template>
  <div class="bb-scene-root">
    <canvas
      ref="canvasRef"
      class="bb-scene"
    />
    <div
      v-if="headCountdown"
      class="bb-head-count font-game game-chrome"
      :style="{
        left: `${headCountdown.x}px`,
        top: `${headCountdown.y}px`,
      }"
      aria-live="polite"
    >
      {{ headCountdown.seconds }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bb-scene-root {
  position: absolute;
  inset: 0;
}

.bb-scene {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  outline: none;
  touch-action: none;
}

.bb-head-count {
  position: absolute;
  z-index: 8;
  transform: translate(-50%, -120%);
  pointer-events: none;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
}
</style>
