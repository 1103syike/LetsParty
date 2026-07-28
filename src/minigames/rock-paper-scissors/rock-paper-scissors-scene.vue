<script setup lang="ts">
import {
  ArcRotateCamera,
  Color4,
  Engine,
  Matrix,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { RPS_MAIN_CAMERA } from '@/common/animals/animal-view-config';
import { spawnQuaterniusArenaDecor } from '@/common/quaternius/load-quaternius-prop';
import RpsChoiceIcon from '@/components/rps-choice-icon.vue';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import { rpsCopy } from '@/minigames/rock-paper-scissors/locales/zh-TW';
import { RpsAnimalActor } from '@/minigames/rock-paper-scissors/rps-animal-actor';
import { RpsChaosRoam } from '@/minigames/rock-paper-scissors/rps-chaos-roam';
import {
  RpsComicPanels,
  tintSceneForCrownAward,
  tintSceneForSplit,
} from '@/minigames/rock-paper-scissors/rps-comic-panels';
import { RpsCrownCeremony } from '@/minigames/rock-paper-scissors/rps-crown-ceremony';
import { RpsPanelBackdrops } from '@/minigames/rock-paper-scissors/rps-panel-backdrops';
import { RpsPlayerControl } from '@/minigames/rock-paper-scissors/rps-player-control';
import { RPS_ALL_LAYERS, getRpsActorLayer, tagRpsEnvironmentLayers } from '@/minigames/rock-paper-scissors/rps-render-layers';
import { createRpsArena } from '@/minigames/rock-paper-scissors/rps-scene-environment';
import type { RockPaperScissorsSnapshot } from '@/minigames/rock-paper-scissors';
import type { Participant } from '@/types/party';
import type { RpsChoice } from '@/types/player-input';

const props = defineProps<{
  snapshot: RockPaperScissorsSnapshot;
  participants: Participant[];
  localParticipantId: string | null;
}>();

interface ClaimMarker {
  id: string;
  claim: RpsChoice;
  color: Participant['color'];
  leftPct: number;
  topPct: number;
}

const actors: RpsAnimalActor[] = [];
const chaosRoam = new RpsChaosRoam();
/** HTML 唬爛框：跟 3D 頭頂投影，沒唬爛就不顯示 */
const claimMarkers = ref<ClaimMarker[]>([]);

let activeScene: Scene | null = null;
let activeEngine: Engine | null = null;
let activeCanvas: HTMLCanvasElement | null = null;
let mainCamera: ArcRotateCamera | null = null;
let comicPanels: RpsComicPanels | null = null;
let panelBackdrops: RpsPanelBackdrops | null = null;
let crownCeremony: RpsCrownCeremony | null = null;
let playerControl: RpsPlayerControl | null = null;
let lastSyncedPhase: RockPaperScissorsSnapshot['phase'] | null = null;
let lastTickMs = 0;
let ceremonyCameraProgress = 0;
let ceremonyCameraFromAlpha = 0;
let ceremonyCameraFromBeta = 0;
let ceremonyCameraFromRadius = 0;

const localSlotIndex = computed(() => {
  if (!props.localParticipantId) {
    return -1;
  }

  return props.participants.findIndex((participant) => participant.id === props.localParticipantId);
});

function getLocalActor(): RpsAnimalActor | null {
  if (localSlotIndex.value < 0) {
    return null;
  }

  return actors[localSlotIndex.value] ?? null;
}

function createRpsScene(engine: Engine): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.86, 0.91, 1);

  return scene;
}

/** 漫遊第三人稱鏡頭（滑鼠可轉） */
function createRpsCamera(scene: Scene): ArcRotateCamera {
  const camera = new ArcRotateCamera(
    'rps-main-camera',
    RPS_MAIN_CAMERA.alpha,
    RPS_MAIN_CAMERA.beta,
    9,
    new Vector3(0, RPS_MAIN_CAMERA.targetY, 0),
    scene,
  );

  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 14;
  camera.wheelPrecision = 40;
  camera.pinchPrecision = 40;
  camera.layerMask = 0x0fffffff;

  return camera;
}

const { canvasRef } = useBabylonScene({
  autoRender: false,
  createScene: createRpsScene,
  createCamera: createRpsCamera,
  async init({ scene, engine, camera, canvas }) {
    activeScene = scene;
    activeEngine = engine;
    activeCanvas = canvas;
    mainCamera = camera;

    createRpsArena(scene);
    await spawnQuaterniusArenaDecor(scene);

    await spawnActors(scene);
    tagRpsEnvironmentLayers(scene);
    comicPanels = new RpsComicPanels(scene, camera);
    panelBackdrops = new RpsPanelBackdrops(scene);
    crownCeremony = new RpsCrownCeremony(scene);
    await crownCeremony.preload();
    comicPanels.syncViewports(canvas);
    playerControl = new RpsPlayerControl(canvas, camera, getLocalActor);

    chaosRoam.reset(actors, getLocalActor());
    syncRoamingControl(props.snapshot.phase);
    syncPhase(props.snapshot);
    engine.resize();
    comicPanels.syncViewports(canvas);
    attachRenderLoop(scene, engine);
    window.addEventListener('resize', handleViewportResize);
  },
});

async function spawnActors(scene: Scene): Promise<void> {
  disposeActors();

  const created = await Promise.all(
    props.participants.map((participant) =>
      RpsAnimalActor.create(scene, participant.animalId, participant.color),
    ),
  );

  created.forEach((actor, slotIndex) => {
    actors[slotIndex] = actor;
  });
}

function disposeActors(): void {
  claimMarkers.value = [];

  while (actors.length > 0) {
    const actor = actors.pop();

    actor?.dispose();
  }
}

function playerColorVar(color: Participant['color']): string {
  return `var(--color-${color})`;
}

/** 每幀把有唬爛的角色頭頂投到畫面座標 */
function updateClaimMarkers(): void {
  if (
    !activeScene
    || !activeEngine
    || !mainCamera
    || props.snapshot.phase !== 'roaming'
  ) {
    if (claimMarkers.value.length > 0) {
      claimMarkers.value = [];
    }

    return;
  }

  const width = activeEngine.getRenderWidth();
  const height = activeEngine.getRenderHeight();

  if (width <= 0 || height <= 0) {
    return;
  }

  const transform = activeScene.getTransformMatrix();
  const viewport = mainCamera.viewport.toGlobal(width, height);
  const next: ClaimMarker[] = [];

  for (let slotIndex = 0; slotIndex < props.participants.length; slotIndex += 1) {
    const participant = props.participants[slotIndex];
    const actor = actors[slotIndex];
    const claim = props.snapshot.claims[participant.id] ?? null;

    if (!participant || !actor || !claim) {
      continue;
    }

    const head = actor.getHeadTarget();
    head.y += 0.55;
    const projected = Vector3.Project(head, Matrix.Identity(), transform, viewport);

    // 在鏡頭後面或超出畫面就不畫
    if (
      projected.z < 0
      || projected.z > 1
      || projected.x < -40
      || projected.x > width + 40
      || projected.y < -40
      || projected.y > height + 40
    ) {
      continue;
    }

    next.push({
      id: participant.id,
      claim,
      color: participant.color,
      leftPct: (projected.x / width) * 100,
      topPct: (projected.y / height) * 100,
    });
  }

  claimMarkers.value = next;
}

function syncRoamingControl(phase: RockPaperScissorsSnapshot['phase']): void {
  if (!playerControl) {
    return;
  }

  if (phase === 'roaming' && getLocalActor()) {
    playerControl.enable();
    return;
  }

  playerControl.disable();
}

function syncActorLayers(isSplitView: boolean): void {
  for (let slotIndex = 0; slotIndex < actors.length; slotIndex += 1) {
    const actor = actors[slotIndex];

    actor?.root.setEnabled(true);
    actor?.applyLayerMask(
      isSplitView ? getRpsActorLayer(slotIndex) : RPS_ALL_LAYERS,
      isSplitView ? 1 : 0,
    );
  }
}

function handleViewportResize(): void {
  if (!activeCanvas || !comicPanels) {
    return;
  }

  comicPanels.syncViewports(activeCanvas);
}

function syncPanelBackdrops(snapshot: RockPaperScissorsSnapshot): void {
  if (!panelBackdrops) {
    return;
  }

  panelBackdrops.setSplitVisible(snapshot.isSplitView);
  panelBackdrops.syncParticipantColors(
    props.participants.map((participant) => participant.color),
  );
}

function beginCrownCeremony(snapshot: RockPaperScissorsSnapshot): void {
  if (!crownCeremony || !mainCamera) {
    return;
  }

  const participantIds = props.participants.map((participant) => participant.id);
  const winnerActors = props.participants
    .map((participant, slotIndex) => ({
      participant,
      actor: actors[slotIndex] ?? null,
    }))
    .filter(({ participant }) => snapshot.crownWinnerIds.includes(participant.id))
    .map(({ actor }) => actor)
    .filter((actor): actor is RpsAnimalActor => actor !== null);

  crownCeremony.arrangeActors(actors, participantIds, snapshot.crownWinnerIds);
  crownCeremony.begin(winnerActors, snapshot.crownAwardDurationMs);

  ceremonyCameraFromAlpha = mainCamera.alpha;
  ceremonyCameraFromBeta = mainCamera.beta;
  ceremonyCameraFromRadius = mainCamera.radius;
  ceremonyCameraProgress = 0;
}

function updateCeremonyCamera(deltaMs: number): void {
  if (!mainCamera || !crownCeremony) {
    return;
  }

  ceremonyCameraProgress = Math.min(1, ceremonyCameraProgress + deltaMs / 900);
  const eased = 1 - (1 - ceremonyCameraProgress) ** 3;
  const focus = crownCeremony.getFocusTarget();
  const cameraPlan = crownCeremony.getCameraPlan();
  const currentTarget = mainCamera.getTarget();
  const targetBlend = ceremonyCameraProgress >= 1 ? 1 : 0.1 + eased * 0.08;

  mainCamera.setTarget(Vector3.Lerp(currentTarget, focus, targetBlend));
  mainCamera.alpha = ceremonyCameraFromAlpha + (-Math.PI / 2 - ceremonyCameraFromAlpha) * eased;
  mainCamera.beta = ceremonyCameraFromBeta + (cameraPlan.beta - ceremonyCameraFromBeta) * eased;
  mainCamera.radius = ceremonyCameraFromRadius + (cameraPlan.radius - ceremonyCameraFromRadius) * eased;
}

function syncPhase(snapshot: RockPaperScissorsSnapshot): void {
  if (!activeScene || !comicPanels) {
    return;
  }

  syncRoamingControl(snapshot.phase);

  if (snapshot.phase !== 'roaming') {
    claimMarkers.value = [];
  }

  const isCeremony = snapshot.phase === 'crownAward';
  tintSceneForSplit(activeScene, snapshot.isSplitView);
  tintSceneForCrownAward(activeScene, isCeremony);
  comicPanels.setSplitEnabled(snapshot.isSplitView);
  syncPanelBackdrops(snapshot);
  syncActorLayers(snapshot.isSplitView);

  if (snapshot.phase === 'crownAward' && lastSyncedPhase !== 'crownAward') {
    for (const actor of actors) {
      actor.resetPanelPop();
    }

    beginCrownCeremony(snapshot);
  }

  if (snapshot.phase === 'roaming') {
    chaosRoam.reset(actors, getLocalActor());
    lastSyncedPhase = snapshot.phase;
    return;
  }

  // 頒冠時保留 arrangeActors 的贏家站位，不能 snap 回分鏡四格
  if (snapshot.phase !== 'crownAward') {
    chaosRoam.snapToFocus(actors);
  }

  if (snapshot.phase === 'focus' && lastSyncedPhase !== 'focus') {
    for (let slotIndex = 0; slotIndex < actors.length; slotIndex += 1) {
      actors[slotIndex]?.playPanelPopEntrance(slotIndex * 70);
    }
  }

  if (!snapshot.isSplitView && snapshot.phase !== 'crownAward') {
    for (const actor of actors) {
      actor.resetPanelPop();
    }
  }

  comicPanels.update(actors);
  panelBackdrops?.syncToCameras(
    [0, 1, 2, 3].map((slotIndex) => comicPanels?.getPanelCamera(slotIndex) ?? null),
  );

  // 公布勝負當下：贏家慶祝、輸家暈倒（只觸發一次）
  if (snapshot.phase === 'reveal' && lastSyncedPhase !== 'reveal') {
    for (let slotIndex = 0; slotIndex < actors.length; slotIndex += 1) {
      const actor = actors[slotIndex];
      const participant = props.participants[slotIndex];

      if (!actor || !participant) {
        continue;
      }

      const result = snapshot.results[participant.id];

      if (result === 'win') {
        actor.playCelebrate();
        continue;
      }

      if (result === 'lose') {
        actor.playFaint();
        continue;
      }

      actor.playRestPose();
    }
  }

  lastSyncedPhase = snapshot.phase;
}

function attachRenderLoop(scene: Scene, engine: Engine): void {
  lastTickMs = performance.now();

  engine.runRenderLoop(() => {
    const now = performance.now();
    const deltaMs = now - lastTickMs;
    lastTickMs = now;

    updateSceneFrame(deltaMs);
    renderScene(scene);
  });
}

function updateSceneFrame(deltaMs: number): void {
  if (!comicPanels) {
    return;
  }

  if (props.snapshot.phase === 'roaming') {
    for (const actor of actors) {
      actor.update(deltaMs);
    }

    playerControl?.update(deltaMs, actors);
    chaosRoam.update(actors, deltaMs, getLocalActor());
    updateClaimMarkers();
  }

  if (props.snapshot.isSplitView) {
    for (const actor of actors) {
      actor.updatePanelPop(deltaMs);
    }

    comicPanels.update(actors);
    panelBackdrops?.syncToCameras(
      [0, 1, 2, 3].map((slotIndex) => comicPanels?.getPanelCamera(slotIndex) ?? null),
    );
  }

  if (props.snapshot.phase === 'crownAward') {
    for (const actor of actors) {
      actor.update(deltaMs);
    }

    crownCeremony?.update(deltaMs);
    updateCeremonyCamera(deltaMs);
  }
}

function renderScene(scene: Scene): void {
  if (!comicPanels) {
    scene.render();
    return;
  }

  comicPanels.applyToScene(scene);
  scene.render();
}

watch(
  () => props.snapshot.phase,
  () => {
    syncPhase(props.snapshot);
  },
);

watch(
  () => props.snapshot.isSplitView,
  () => {
    if (!activeScene || !comicPanels) {
      return;
    }

    syncRoamingControl(props.snapshot.phase);

    tintSceneForSplit(activeScene, props.snapshot.isSplitView);
    comicPanels.setSplitEnabled(props.snapshot.isSplitView);
    syncPanelBackdrops(props.snapshot);
    syncActorLayers(props.snapshot.isSplitView);

    if (props.snapshot.isSplitView) {
      chaosRoam.snapToFocus(actors);
      comicPanels.update(actors);
      panelBackdrops?.syncToCameras(
        [0, 1, 2, 3].map((slotIndex) => comicPanels?.getPanelCamera(slotIndex) ?? null),
      );
    }
  },
);

watch(
  () => props.participants.map((participant) => `${participant.id}:${participant.animalId}`).join('|'),
  async () => {
    if (!activeScene || !mainCamera || !activeCanvas) {
      return;
    }

    await spawnActors(activeScene);
    comicPanels?.dispose();
    comicPanels = new RpsComicPanels(activeScene, mainCamera);
    crownCeremony?.dispose();
    crownCeremony = new RpsCrownCeremony(activeScene);
    await crownCeremony.preload();
    comicPanels.syncViewports(activeCanvas);
    playerControl?.dispose();
    playerControl = new RpsPlayerControl(activeCanvas, mainCamera, getLocalActor);
    chaosRoam.reset(actors, getLocalActor());
    syncPhase(props.snapshot);
  },
);

watch(
  () => props.localParticipantId,
  () => {
    syncRoamingControl(props.snapshot.phase);
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize);
  activeEngine?.stopRenderLoop();
  playerControl?.dispose();
  playerControl = null;
  disposeActors();
  comicPanels?.dispose();
  comicPanels = null;
  panelBackdrops?.dispose();
  panelBackdrops = null;
  crownCeremony?.dispose();
  crownCeremony = null;
  activeScene = null;
  activeEngine = null;
  activeCanvas = null;
  mainCamera = null;
});
</script>

<template>
  <div class="rps-scene">
    <canvas ref="canvasRef" class="rps-scene__canvas" />

    <div class="rps-scene__claims" aria-hidden="true">
      <div
        v-for="marker in claimMarkers"
        :key="marker.id"
        class="rps-claim-bubble"
        :style="{
          left: `${marker.leftPct}%`,
          top: `${marker.topPct}%`,
          '--claim-tone': playerColorVar(marker.color),
        }"
      >
        <span class="rps-claim-bubble__label font-game">{{ rpsCopy.claimBubbleLabel }}</span>
        <span class="rps-claim-bubble__icon-ring">
          <RpsChoiceIcon
            :choice="marker.claim"
            size="xl"
            bounce
          />
        </span>
        <span class="rps-claim-bubble__tail" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.rps-scene {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.rps-scene__canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.rps-scene__claims {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}

/* 瑪利歐派對風貼紙對話框：大字 + 大 icon + 果凍感 */
.rps-claim-bubble {
  --claim-tone: var(--color-accent);
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-width: 6.5rem;
  padding: var(--space-md) var(--space-md) var(--space-lg);
  border: 4px solid var(--claim-tone);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    165deg,
    var(--color-on-accent) 0%,
    color-mix(in srgb, var(--color-warning) 28%, white) 55%,
    color-mix(in srgb, var(--claim-tone) 18%, white) 100%
  );
  box-shadow:
    0 5px 0 color-mix(in srgb, var(--claim-tone) 55%, var(--color-text-heading)),
    0 0 0 3px color-mix(in srgb, var(--color-on-accent) 80%, transparent);
  transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-3deg);
  transform-origin: 50% 100%;
  animation:
    rps-claim-pop 0.48s cubic-bezier(0.22, 1.45, 0.36, 1) both,
    rps-claim-jelly 2.8s ease-in-out 0.48s infinite;
}

.rps-claim-bubble__label {
  font-size: var(--font-size-lg);
  font-weight: 900;
  letter-spacing: 0.14em;
  line-height: var(--line-height-tight);
  white-space: nowrap;
  color: var(--color-on-accent);
  transform: rotate(-2deg);
  text-shadow:
    -3px -3px 0 var(--color-accent-hover),
    3px -3px 0 var(--color-accent-hover),
    -3px 3px 0 var(--color-accent-hover),
    3px 3px 0 var(--color-accent-hover),
    -3px 0 0 var(--color-accent-hover),
    3px 0 0 var(--color-accent-hover),
    0 -3px 0 var(--color-accent-hover),
    0 3px 0 var(--color-accent-hover),
    0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 30%, transparent);
}

.rps-claim-bubble__icon-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5rem;
  height: 5rem;
  border: 3px solid color-mix(in srgb, var(--claim-tone) 65%, white);
  border-radius: var(--radius-full);
  background: radial-gradient(
    circle at 40% 35%,
    var(--color-on-accent) 0%,
    color-mix(in srgb, var(--claim-tone) 16%, white) 100%
  );
  box-shadow:
    inset 0 2px 0 color-mix(in srgb, var(--color-on-accent) 80%, transparent),
    0 3px 0 color-mix(in srgb, var(--claim-tone) 35%, transparent);
}

.rps-claim-bubble__tail {
  position: absolute;
  bottom: -0.55rem;
  left: 50%;
  width: 0.9rem;
  height: 0.9rem;
  border-right: 4px solid var(--claim-tone);
  border-bottom: 4px solid var(--claim-tone);
  background: color-mix(in srgb, var(--claim-tone) 18%, white);
  transform: translateX(-50%) rotate(45deg);
}

@keyframes rps-claim-pop {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-3deg) scale(0.4);
  }

  70% {
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-3deg) scale(1.08);
  }

  to {
    opacity: 1;
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-3deg) scale(1);
  }
}

@keyframes rps-claim-jelly {
  0%,
  100% {
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-3deg) scale(1);
  }

  40% {
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-2deg) scale(1.04, 0.96);
  }

  60% {
    transform: translate(-50%, calc(-100% - 0.5rem)) rotate(-4deg) scale(0.97, 1.03);
  }
}
</style>
