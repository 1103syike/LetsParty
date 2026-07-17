<script setup lang="ts">
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, watch } from 'vue';

import { AnimalActor } from '@/common/animals/animal-actor';
import { AnimalCrownCeremony } from '@/common/animals/animal-crown-ceremony';
import { createQuaterniusFlatMaterial } from '@/common/quaternius/quaternius-materials';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { VolleyballSnapshot } from '@/minigames/volleyball/volleyball';
import { addVolleyballCourtDecor } from '@/minigames/volleyball/volleyball-court-decor';
import { VolleyballHitFx } from '@/minigames/volleyball/volleyball-hit-fx';
import { VolleyballSpikeFx } from '@/minigames/volleyball/volleyball-spike-fx';
import { usePartyStore } from '@/stores/party-store';

const props = defineProps<{
  snapshot: VolleyballSnapshot;
}>();

const emit = defineEmits<{
  courtAim: [value: { x: number; z: number }];
  courtClick: [value: { x: number; z: number }];
}>();

const partyStore = usePartyStore();

const actors = new Map<string, AnimalActor>();
const locomotions = new Map<string, 'idle' | 'run' | 'hit' | 'blast' | 'ceremony'>();
/** 擊球／殺球動畫鎖：避免立刻被 idle/run 蓋掉 */
const hitAnimUntil = new Map<string, number>();
let ballMesh: Mesh | null = null;
let ballShadowMesh: Mesh | null = null;
let ballShadowMat: StandardMaterial | null = null;
let courtPickMesh: Mesh | null = null;
let aimMarkerMesh: Mesh | null = null;
let aimMarkerMat: StandardMaterial | null = null;
/** 預期落點（黃圈）：誰的球依此判定 */
let landMarkerMesh: Mesh | null = null;
let landMarkerMat: StandardMaterial | null = null;
let hitFx: VolleyballHitFx | null = null;
let spikeFx: VolleyballSpikeFx | null = null;
let crownCeremony: AnimalCrownCeremony | null = null;
let orbitCamera: ArcRotateCamera | null = null;
let activeScene: Scene | null = null;
let renderObserver: Observer<Scene> | null = null;
let pointerObserver: Observer<PointerInfo> | null = null;
let sceneReady = false;
let lastPhase: VolleyballSnapshot['phase'] | null = null;
let lastHitSerial = 0;
let lastSpikeBurstSerial = 0;
let ceremonyCameraProgress = 0;
let ceremonyCameraFromAlpha = 0;
let ceremonyCameraFromBeta = 0;
let ceremonyCameraFromRadius = 0;

function createCourt(scene: Scene): void {
  // 天空略加深，避免整畫面過曝看不清
  scene.clearColor = new Color4(0.55, 0.74, 0.88, 1);
  scene.ambientColor = new Color3(0.52, 0.58, 0.68);

  const hemi = new HemisphericLight('vb-hemi', new Vector3(0.15, 1, 0.2), scene);
  hemi.intensity = 1.15;
  hemi.groundColor = Color3.FromHexString('#3f9d6e').scale(0.55);

  const key = new DirectionalLight('vb-key', new Vector3(-0.25, -1, 0.3), scene);
  key.intensity = 0.7;

  // 沙灘壓一階（仍對齊 warning 色相）
  const ground = MeshBuilder.CreateGround('vb-ground', { width: 18, height: 24 }, scene);
  ground.material = createQuaterniusFlatMaterial(
    scene,
    'vb-sand',
    Color3.FromHexString('#c9964a'),
  );

  // 對齊物理半場 6.0 × 8.4（點選層）
  const court = MeshBuilder.CreateGround('vb-court', { width: 12.2, height: 17 }, scene);
  court.position.y = 0.01;
  court.material = createQuaterniusFlatMaterial(
    scene,
    'vb-court',
    Color3.FromHexString('#2f8a72'),
  );
  court.isPickable = true;
  courtPickMesh = court;

  addVolleyballCourtDecor(scene);

  // 排球網：懸空掛在兩柱之間，底下透空（不是貼地的牆）
  // netTopY 須與 volleyball.ts 的 NET_TOP_Y（2.0）對齊
  const netWidth = 12;
  const netBottomY = 0.95;
  const netHeight = 1.05;
  const netTopY = netBottomY + netHeight;

  const net = MeshBuilder.CreateBox(
    'vb-net',
    { width: netWidth, height: netHeight, depth: 0.05 },
    scene,
  );
  net.position.set(0, netBottomY + netHeight * 0.5, 0);
  const netMat = new StandardMaterial('vb-net-mat', scene);
  netMat.diffuseColor = Color3.FromHexString('#ffffff');
  netMat.emissiveColor = Color3.FromHexString('#9b7fd4').scale(0.12);
  netMat.alpha = 0.5;
  netMat.backFaceCulling = false;
  net.material = netMat;

  // 上網帶（對齊 --color-accent）
  const netTape = MeshBuilder.CreateBox(
    'vb-net-tape',
    { width: netWidth + 0.08, height: 0.1, depth: 0.08 },
    scene,
  );
  netTape.position.set(0, netTopY - 0.04, 0);
  netTape.material = createQuaterniusFlatMaterial(
    scene,
    'vb-net-tape',
    Color3.FromHexString('#9b7fd4'),
  );

  // 下網繩
  const netCord = MeshBuilder.CreateBox(
    'vb-net-cord',
    { width: netWidth, height: 0.04, depth: 0.06 },
    scene,
  );
  netCord.position.set(0, netBottomY + 0.02, 0);
  netCord.material = createQuaterniusFlatMaterial(
    scene,
    'vb-net-cord',
    Color3.FromHexString('#6ba8e8'),
  );

  const poleHeight = netTopY + 0.25;
  const poleL = MeshBuilder.CreateCylinder(
    'vb-pole-l',
    { height: poleHeight, diameter: 0.12 },
    scene,
  );
  poleL.position.set(-6.1, poleHeight * 0.5, 0);
  poleL.material = createQuaterniusFlatMaterial(
    scene,
    'vb-pole',
    Color3.FromHexString('#e86b8a'),
  );

  const poleR = poleL.clone('vb-pole-r');
  poleR.position.x = 6.1;
  poleR.material = createQuaterniusFlatMaterial(
    scene,
    'vb-pole-r',
    Color3.FromHexString('#6ba8e8'),
  );

  // 柱頂可愛小球
  const poleCapL = MeshBuilder.CreateSphere('vb-pole-cap-l', { diameter: 0.28, segments: 12 }, scene);
  poleCapL.position.set(-6.1, poleHeight + 0.05, 0);
  poleCapL.material = createQuaterniusFlatMaterial(
    scene,
    'vb-pole-cap-l',
    Color3.FromHexString('#e8b86d'),
  );
  const poleCapR = poleCapL.clone('vb-pole-cap-r');
  poleCapR.position.x = 6.1;

  // 球用飽和橘黃，淺色背景才跟得上
  ballMesh = MeshBuilder.CreateSphere('vb-ball', { diameter: 0.52, segments: 18 }, scene);
  const ballMat = new StandardMaterial('vb-ball-mat', scene);
  ballMat.diffuseColor = Color3.FromHexString('#ffb347');
  ballMat.emissiveColor = Color3.FromHexString('#e86b8a').scale(0.22);
  ballMesh.material = ballMat;

  // 地面 blob 陰影：跟著球 xz，高度越高越淡、略放大
  ballShadowMesh = MeshBuilder.CreateDisc(
    'vb-ball-shadow',
    { radius: 0.34, tessellation: 24 },
    scene,
  );
  ballShadowMesh.rotation.x = Math.PI / 2;
  ballShadowMesh.position.y = 0.025;
  ballShadowMat = new StandardMaterial('vb-ball-shadow-mat', scene);
  ballShadowMat.diffuseColor = Color3.Black();
  ballShadowMat.emissiveColor = Color3.Black();
  ballShadowMat.specularColor = Color3.Black();
  ballShadowMat.disableLighting = true;
  ballShadowMat.alpha = 0.55;
  ballShadowMat.backFaceCulling = false;
  ballShadowMesh.material = ballShadowMat;
  ballShadowMesh.isPickable = false;

  const groundRingTex = createGroundRingTexture(scene, 'vb-ground-ring-tex');

  // 滑鼠瞄準：亮環（己方綠／對方粉）
  aimMarkerMesh = MeshBuilder.CreateDisc(
    'vb-aim-marker',
    { radius: 0.58, tessellation: 48 },
    scene,
  );
  aimMarkerMesh.rotation.x = Math.PI / 2;
  aimMarkerMesh.position.y = 0.036;
  aimMarkerMat = new StandardMaterial('vb-aim-marker-mat', scene);
  aimMarkerMat.diffuseColor = Color3.FromHexString('#e86b8a');
  aimMarkerMat.emissiveColor = Color3.FromHexString('#e86b8a').scale(1.1);
  aimMarkerMat.specularColor = Color3.Black();
  aimMarkerMat.disableLighting = true;
  aimMarkerMat.alpha = 0.92;
  aimMarkerMat.backFaceCulling = false;
  aimMarkerMat.diffuseTexture = groundRingTex;
  aimMarkerMat.opacityTexture = groundRingTex;
  aimMarkerMat.useAlphaFromDiffuseTexture = true;
  aimMarkerMesh.material = aimMarkerMat;
  aimMarkerMesh.isPickable = false;
  aimMarkerMesh.setEnabled(false);

  // 預期落點：鮮豔亮圈（對齊 --color-player-3）
  landMarkerMesh = MeshBuilder.CreateDisc(
    'vb-land-marker',
    { radius: 0.72, tessellation: 48 },
    scene,
  );
  landMarkerMesh.rotation.x = Math.PI / 2;
  landMarkerMesh.position.y = 0.03;
  landMarkerMat = new StandardMaterial('vb-land-marker-mat', scene);
  landMarkerMat.diffuseColor = Color3.FromHexString('#6ba8e8');
  landMarkerMat.emissiveColor = Color3.FromHexString('#6ba8e8').scale(1.15);
  landMarkerMat.specularColor = Color3.Black();
  landMarkerMat.disableLighting = true;
  landMarkerMat.alpha = 0.88;
  landMarkerMat.backFaceCulling = false;
  landMarkerMat.diffuseTexture = groundRingTex;
  landMarkerMat.opacityTexture = groundRingTex;
  landMarkerMat.useAlphaFromDiffuseTexture = true;
  landMarkerMesh.material = landMarkerMat;
  landMarkerMesh.isPickable = false;
  landMarkerMesh.setEnabled(false);
}

/** 地面目標圈：外亮環 + 半透明心 */
function createGroundRingTexture(scene: Scene, name: string): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    false,
  );
  const ctx = texture.getContext();
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // 內心淡填
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();

  // 外亮環（主視覺）
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();

  // 最外細邊
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.arc(cx, cy, size * 0.435, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();

  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function updateLandMarker(snapshot: VolleyballSnapshot): void {
  if (!landMarkerMesh || !landMarkerMat) {
    return;
  }

  const land = snapshot.predictedLand;

  if (
    !land
    || snapshot.phase === 'crownAward'
    || snapshot.phase === 'finished'
    || snapshot.phase === 'pointPause'
  ) {
    landMarkerMesh.setEnabled(false);
    hitFx?.sync(null, 0);
    return;
  }

  landMarkerMesh.position.x = land.x;
  landMarkerMesh.position.z = land.z;
  landMarkerMesh.setEnabled(true);

  // 地上時機圓環：最佳擊球窗收攏
  hitFx?.sync(land, snapshot.hitTiming);
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

  return {
    x: hit.pickedPoint.x,
    z: hit.pickedPoint.z,
  };
}

function updateAimMarker(point: { x: number; z: number } | null): void {
  if (!aimMarkerMesh || !aimMarkerMat) {
    return;
  }

  if (!point || props.snapshot.phase === 'crownAward' || props.snapshot.phase === 'finished') {
    aimMarkerMesh.setEnabled(false);
    return;
  }

  const teamId = props.snapshot.localTeamId;
  const isOwn = teamId === 'b' ? point.z > 0.12 : point.z < -0.12;
  // 己方：--color-player-4；對方：--color-player-1（鮮亮亮環）
  const hex = isOwn ? '#7ecf9a' : '#e86b8a';
  aimMarkerMat.diffuseColor = Color3.FromHexString(hex);
  aimMarkerMat.emissiveColor = Color3.FromHexString(hex).scale(1.2);
  aimMarkerMat.alpha = 0.92;
  aimMarkerMesh.position.x = point.x;
  aimMarkerMesh.position.z = point.z;
  aimMarkerMesh.setEnabled(true);
}

function bindCourtPointer(scene: Scene): void {
  pointerObserver = scene.onPointerObservable.add((info) => {
    if (props.snapshot.phase === 'crownAward' || props.snapshot.phase === 'finished') {
      updateAimMarker(null);
      return;
    }

    if (
      info.type !== PointerEventTypes.POINTERMOVE
      && info.type !== PointerEventTypes.POINTERDOWN
    ) {
      return;
    }

    const point = pickCourtPoint(scene);

    if (info.type === PointerEventTypes.POINTERMOVE) {
      updateAimMarker(point);

      if (point) {
        emit('courtAim', point);
      }

      return;
    }

    // 僅左鍵
    if (info.event.button !== 0 || !point) {
      return;
    }

    updateAimMarker(point);
    emit('courtClick', point);
  });
}

function syncBallShadow(ball: VolleyballSnapshot['ball'], visible: boolean): void {
  if (!ballShadowMesh || !ballShadowMat) {
    return;
  }

  if (!visible) {
    ballShadowMesh.setEnabled(false);
    return;
  }

  // 球心高度相對地面；貼地時陰影最清楚
  const height = Math.max(0, ball.y - 0.24);
  const t = Math.min(1, height / 3.2);
  const scale = 1 + t * 0.9;
  ballShadowMesh.position.x = ball.x;
  ballShadowMesh.position.z = ball.z;
  ballShadowMesh.scaling.setAll(scale);
  ballShadowMat.alpha = 0.42 * (1 - t * 0.75);
  ballShadowMesh.setEnabled(true);
}

async function syncActors(scene: Scene): Promise<void> {
  for (const participant of partyStore.participants) {
    if (actors.has(participant.id)) {
      continue;
    }

    const actor = await AnimalActor.create(scene, participant.animalId, participant.color);
    actor.playRestPose();
    actors.set(participant.id, actor);
    locomotions.set(participant.id, 'idle');
  }
}

function playHitAnimation(snapshot: VolleyballSnapshot): void {
  if (!snapshot.lastHit || snapshot.hitSerial === lastHitSerial) {
    return;
  }

  lastHitSerial = snapshot.hitSerial;
  const actor = actors.get(snapshot.lastHit.playerId);

  if (!actor || locomotions.get(snapshot.lastHit.playerId) === 'ceremony') {
    return;
  }

  if (snapshot.lastHit.kind === 'spike') {
    actor.playAttack();
    hitAnimUntil.set(snapshot.lastHit.playerId, performance.now() + 480);
  } else {
    // 擊球／舉球：墊擊姿勢
    actor.playBumpHit();
    hitAnimUntil.set(snapshot.lastHit.playerId, performance.now() + 420);
  }

  locomotions.set(snapshot.lastHit.playerId, 'hit');
}

function applySnapshot(snapshot: VolleyballSnapshot): void {
  if (snapshot.phase === 'crownAward') {
    return;
  }

  playHitAnimation(snapshot);
  playSpikeBurst(snapshot);
  updateLandMarker(snapshot);

  if (ballMesh) {
    ballMesh.position.set(snapshot.ball.x, snapshot.ball.y, snapshot.ball.z);
    ballMesh.setEnabled(true);
  }

  syncBallShadow(snapshot.ball, true);

  const now = performance.now();

  for (const player of snapshot.players) {
    const actor = actors.get(player.id);

    if (!actor) {
      continue;
    }

    actor.root.position.x = player.x;
    actor.root.position.z = player.z;
    actor.root.position.y = player.y;
    // 全員面向球網；移動時仍鎖網向，比較像排球站位
    actor.faceWorldDirection(0, player.facingZ);

    if (locomotions.get(player.id) === 'ceremony') {
      continue;
    }

    if (player.isBlasted) {
      if (locomotions.get(player.id) !== 'blast') {
        actor.playBumpHit();
        locomotions.set(player.id, 'blast');
      }

      continue;
    }

    // 擊球動畫播完前不要被 run/idle 蓋掉
    if ((hitAnimUntil.get(player.id) ?? 0) > now) {
      locomotions.set(player.id, 'hit');
      continue;
    }

    // 高度由物理權威；不要 playJump（會跟 AnimalActor 自己的弧線搶 y）
    let next: 'idle' | 'run' = 'idle';
    const speed = Math.hypot(player.vx, player.vz);

    if (speed > 0.4) {
      next = 'run';
    }

    if (locomotions.get(player.id) !== next) {
      if (next === 'run') {
        actor.playRun();
      } else {
        actor.playIdle();
      }

      locomotions.set(player.id, next);
    }
  }
}

function playSpikeBurst(snapshot: VolleyballSnapshot): void {
  if (!snapshot.spikeBurst || snapshot.spikeBurstSerial === lastSpikeBurstSerial) {
    return;
  }

  lastSpikeBurstSerial = snapshot.spikeBurstSerial;
  spikeFx?.playBurst(snapshot.spikeBurst.x, snapshot.spikeBurst.z);
}

function beginCrownCeremony(snapshot: VolleyballSnapshot): void {
  if (!crownCeremony || !orbitCamera) {
    return;
  }

  if (ballMesh) {
    ballMesh.setEnabled(false);
  }

  syncBallShadow(snapshot.ball, false);

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

function syncPhase(snapshot: VolleyballSnapshot): void {
  if (snapshot.phase === 'crownAward' && lastPhase !== 'crownAward') {
    beginCrownCeremony(snapshot);
  }

  // 進場／換隊時鎖死「自己半場背後」固定視角
  if (snapshot.phase !== 'crownAward' && orbitCamera) {
    applyFixedSideCamera(orbitCamera, snapshot.localTeamId);
  }

  lastPhase = snapshot.phase;
}

/** 固定在己方半場後方俯看，不可拖曳／縮放 */
function applyFixedSideCamera(
  camera: ArcRotateCamera,
  localTeamId: VolleyballSnapshot['localTeamId'],
): void {
  // 紅隊 a 在 -Z；藍隊 b 在 +Z → 相機站在己方背後
  const alpha = localTeamId === 'b' ? Math.PI / 2 : -Math.PI / 2;
  const beta = Math.PI / 2.85;
  const radius = 20;

  camera.inputs.clear();
  camera.detachControl();
  camera.setTarget(new Vector3(0, 0.8, 0));
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

const { canvasRef } = useBabylonScene({
  createScene(engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.72, 0.86, 0.91, 1);
    return scene;
  },
  createCamera(scene) {
    const camera = new ArcRotateCamera(
      'vb-cam',
      -Math.PI / 2,
      Math.PI / 2.85,
      18,
      new Vector3(0, 0.8, 0),
      scene,
    );
    camera.inputs.clear();
    return camera;
  },
  async init({ scene, engine, camera }) {
    createCourt(scene);
    hitFx = new VolleyballHitFx(scene);
    spikeFx = new VolleyballSpikeFx(scene);
    crownCeremony = new AnimalCrownCeremony(scene);
    await crownCeremony.preload();
    await syncActors(scene);
    activeScene = scene;
    orbitCamera = camera;
    applyFixedSideCamera(camera, props.snapshot.localTeamId);
    bindCourtPointer(scene);
    renderObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaMs = scene.getEngine().getDeltaTime();
      hitFx?.update(deltaMs);
      spikeFx?.update();

      for (const actor of actors.values()) {
        actor.update(deltaMs);
      }

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
  ballMesh?.dispose();
  ballMesh = null;
  ballShadowMesh?.dispose();
  ballShadowMesh = null;
  ballShadowMat = null;
  aimMarkerMesh?.dispose();
  aimMarkerMesh = null;
  aimMarkerMat = null;
  landMarkerMesh?.dispose();
  landMarkerMesh = null;
  landMarkerMat = null;
  courtPickMesh = null;
  hitFx?.dispose();
  hitFx = null;
  spikeFx?.dispose();
  spikeFx = null;
  crownCeremony?.dispose();
  crownCeremony = null;

  for (const actor of actors.values()) {
    actor.dispose();
  }

  actors.clear();
  locomotions.clear();
  hitAnimUntil.clear();
  lastHitSerial = 0;
  lastSpikeBurstSerial = 0;
  lastPhase = null;
  sceneReady = false;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="volleyball-scene"
  />
</template>

<style lang="scss" scoped>
.volleyball-scene {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
</style>
