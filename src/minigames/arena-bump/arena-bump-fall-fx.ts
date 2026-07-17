import {
  Color4,
  DynamicTexture,
  type Observer,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';

import type { AnimalActor } from '@/common/animals/animal-actor';

/** 流星弧線飛出時間 */
const FALL_DURATION_MS = 980;
/** 水平飛出距離（台緣再往外） */
const OUTWARD_DISTANCE = 5.4;
/** 拋物線最高點 */
const ARC_PEAK_Y = 2.35;
/** 落地／消失高度 */
const ARC_END_Y = -5.2;
const PLAYER_COLOR_HEX: Record<string, string> = {
  'player-1': '#e86b8a',
  'player-2': '#9b7fd4',
  'player-3': '#6ba8e8',
  'player-4': '#7ecf9a',
};

interface FallDrop {
  actor: AnimalActor;
  startX: number;
  startY: number;
  startZ: number;
  outX: number;
  outZ: number;
  elapsedMs: number;
  spinSign: number;
  trail: ParticleSystem;
}

function hexToColor4(hex: string, alpha = 1): Color4 {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);

  return new Color4(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha,
  );
}

/** y = 起點 → 拋物線頂 → 台下；t∈[0,1] */
function meteorHeight(startY: number, t: number): number {
  // 前段拱高、後段加速下墜（流星感）
  const lift = (ARC_PEAK_Y - startY) * 4 * t * (1 - t);
  const plunge = ARC_END_Y * t * t * t;
  return startY + lift + plunge;
}

/** 掉落演出：拋物線甩飛 + 翻滾 + 流星拖尾 */
export class ArenaBumpFallFx {
  private readonly scene: Scene;

  private readonly drops = new Map<string, FallDrop>();

  private readonly particles: ParticleSystem[] = [];

  private dotTexture: Texture | null = null;

  private observer: Observer<Scene> | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.observer = scene.onBeforeRenderObservable.add(() => {
      this.tick(scene.getEngine().getDeltaTime());
    });
  }

  isAnimating(fighterId: string): boolean {
    return this.drops.has(fighterId);
  }

  /** 進頒冠前清掉進行中的掉落，避免把角色藏起來或蓋掉站位 */
  cancelAll(): void {
    for (const drop of this.drops.values()) {
      this.disposeTrail(drop.trail);
    }

    this.drops.clear();
  }

  beginFall(fighterId: string, actor: AnimalActor, playerColor: string): void {
    if (this.drops.has(fighterId)) {
      return;
    }

    const startX = actor.root.position.x;
    const startY = Math.max(0, actor.root.position.y);
    const startZ = actor.root.position.z;
    const dist = Math.hypot(startX, startZ) || 1;
    const outX = startX / dist;
    const outZ = startZ / dist;
    const colorHex = PLAYER_COLOR_HEX[playerColor] ?? '#9b7fd4';

    actor.setSubtreeEnabled(true);
    actor.root.scaling.setAll(1);
    actor.playFaint();
    this.spawnEdgeBurst(startX, startZ, colorHex);

    const trail = this.createMeteorTrail(actor, colorHex);

    this.drops.set(fighterId, {
      actor,
      startX,
      startY,
      startZ,
      outX,
      outZ,
      elapsedMs: 0,
      spinSign: Math.abs(startX + startZ) % 2 === 0 ? 1 : -1,
      trail,
    });
  }

  dispose(): void {
    if (this.observer) {
      this.scene.onBeforeRenderObservable.remove(this.observer);
      this.observer = null;
    }

    this.cancelAll();

    for (const system of this.particles) {
      system.dispose();
    }

    this.particles.length = 0;
    this.dotTexture?.dispose();
    this.dotTexture = null;
  }

  private tick(deltaMs: number): void {
    for (const [fighterId, drop] of [...this.drops.entries()]) {
      drop.elapsedMs += deltaMs;
      const progress = Math.min(1, drop.elapsedMs / FALL_DURATION_MS);
      // 水平先衝出去，再略減速（甩飛感）
      const outward = OUTWARD_DISTANCE * (1 - (1 - progress) ** 1.65);
      const height = meteorHeight(drop.startY, progress);
      const tip = progress * 2.6 * drop.spinSign;
      const tumble = progress * Math.PI * 1.35;
      // 飛遠後略縮小，像沖出畫面
      const shrink = 1 - progress * 0.48;

      const x = drop.startX + drop.outX * outward;
      const z = drop.startZ + drop.outZ * outward;

      drop.actor.root.position.set(x, height, z);
      drop.actor.root.rotation.x = tumble;
      drop.actor.root.rotation.z = tip;
      drop.actor.root.scaling.setAll(shrink);
      drop.trail.emitter = new Vector3(x, height + 0.45, z);

      if (progress < 1) {
        continue;
      }

      this.disposeTrail(drop.trail);
      drop.actor.root.rotation.x = 0;
      drop.actor.root.rotation.z = 0;
      drop.actor.root.scaling.setAll(1);
      drop.actor.holdStandingPose();
      drop.actor.setSubtreeEnabled(false);
      drop.actor.root.position.set(
        drop.startX + drop.outX * OUTWARD_DISTANCE,
        ARC_END_Y,
        drop.startZ + drop.outZ * OUTWARD_DISTANCE,
      );
      this.drops.delete(fighterId);
    }
  }

  private disposeTrail(trail: ParticleSystem): void {
    trail.stop();
    trail.dispose();
    const index = this.particles.indexOf(trail);

    if (index >= 0) {
      this.particles.splice(index, 1);
    }
  }

  private createMeteorTrail(actor: AnimalActor, colorHex: string): ParticleSystem {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(
      `arena-meteor-trail-${this.particles.length}`,
      96,
      this.scene,
    );
    const accent = hexToColor4(colorHex, 1);
    const spark = new Color4(1, 0.92, 0.55, 1);
    const fade = new Color4(1, 1, 1, 0);

    system.particleTexture = texture;
    system.emitter = new Vector3(
      actor.root.position.x,
      actor.root.position.y + 0.45,
      actor.root.position.z,
    );
    system.minEmitBox = new Vector3(-0.12, -0.1, -0.12);
    system.maxEmitBox = new Vector3(0.12, 0.35, 0.12);
    system.color1 = spark;
    system.color2 = accent;
    system.colorDead = fade;
    system.minSize = 0.08;
    system.maxSize = 0.28;
    system.minLifeTime = 0.12;
    system.maxLifeTime = 0.38;
    system.emitRate = 90;
    system.blendMode = ParticleSystem.BLENDMODE_ADD;
    system.gravity = new Vector3(0, -6, 0);
    system.direction1 = new Vector3(-0.6, -0.2, -0.6);
    system.direction2 = new Vector3(0.6, 0.8, 0.6);
    system.minEmitPower = 0.4;
    system.maxEmitPower = 1.8;
    system.updateSpeed = 0.016;
    system.disposeOnStop = false;
    system.start();
    this.particles.push(system);

    return system;
  }

  private spawnEdgeBurst(x: number, z: number, colorHex: string): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`arena-fall-splash-${this.particles.length}`, 56, this.scene);
    const accent = hexToColor4(colorHex, 1);
    const white = new Color4(1, 1, 1, 1);
    const mist = new Color4(1, 0.85, 0.45, 0.9);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.2, z);
    system.minEmitBox = new Vector3(-0.12, 0, -0.12);
    system.maxEmitBox = new Vector3(0.12, 0.3, 0.12);
    system.color1 = accent;
    system.color2 = mist;
    system.colorDead = new Color4(white.r, white.g, white.b, 0);
    system.minSize = 0.12;
    system.maxSize = 0.38;
    system.minLifeTime = 0.2;
    system.maxLifeTime = 0.5;
    system.emitRate = 0;
    system.manualEmitCount = 48;
    system.blendMode = ParticleSystem.BLENDMODE_ADD;
    system.gravity = new Vector3(0, -12, 0);
    system.direction1 = new Vector3(-3.2, 3.5, -3.2);
    system.direction2 = new Vector3(3.2, 9, 3.2);
    system.minEmitPower = 2.8;
    system.maxEmitPower = 7.2;
    system.updateSpeed = 0.018;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.55;
    system.onDisposeObservable.add(() => {
      const index = this.particles.indexOf(system);

      if (index >= 0) {
        this.particles.splice(index, 1);
      }
    });
    system.start();
    this.particles.push(system);
  }

  private getDotTexture(): Texture {
    if (this.dotTexture) {
      return this.dotTexture;
    }

    const size = 64;
    const dynamic = new DynamicTexture('arena-fall-dot', { width: size, height: size }, this.scene, false);
    const ctx = dynamic.getContext();
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    dynamic.update();
    this.dotTexture = dynamic;

    return dynamic;
  }
}
