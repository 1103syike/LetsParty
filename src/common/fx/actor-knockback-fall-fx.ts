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

/** 甩飛到落地時間（結算延遲會加上這段；單次可覆寫） */
export const ACTOR_KNOCKBACK_FALL_DURATION_MS = 720;

/** @deprecated 相容舊名稱 */
export const ARENA_BUMP_FALL_DURATION_MS = ACTOR_KNOCKBACK_FALL_DURATION_MS;

export interface KnockbackFallOptions {
  /** 水平飛出距離 */
  outwardDistance?: number;
  /** 拋物線最高點 */
  arcPeakY?: number;
  /** 飛出方向（世界 xz）；沒給則從原點往外 */
  dirX?: number;
  dirZ?: number;
  /** 飛行時長（毫秒） */
  durationMs?: number;
  /** 空中翻轉圈數（星星式） */
  spinRevolutions?: number;
  /** 落地後隱藏（飛出場外用） */
  hideOnLand?: boolean;
}

const DEFAULT_OUTWARD_DISTANCE = 2.8;
const DEFAULT_ARC_PEAK_Y = 1.85;
const DEFAULT_SPIN_REVOLUTIONS = 0.425;

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
  landed: boolean;
  outwardDistance: number;
  arcPeakY: number;
  durationMs: number;
  spinRevolutions: number;
  hideOnLand: boolean;
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

function flightHeight(startY: number, t: number, arcPeakY: number): number {
  const peakLift = (arcPeakY - startY) * 4 * t * (1 - t);
  return startY * (1 - t) + peakLift;
}

/** 掉落演出：拋物線甩飛 → 趴地 */
export class ActorKnockbackFallFx {
  private readonly scene: Scene;

  private readonly drops = new Map<string, FallDrop>();

  private readonly particles: ParticleSystem[] = [];

  private readonly defaultOptions: {
    outwardDistance: number;
    arcPeakY: number;
  };

  private dotTexture: Texture | null = null;

  private observer: Observer<Scene> | null = null;

  constructor(scene: Scene, options: KnockbackFallOptions = {}) {
    this.scene = scene;
    this.defaultOptions = {
      outwardDistance: options.outwardDistance ?? DEFAULT_OUTWARD_DISTANCE,
      arcPeakY: options.arcPeakY ?? DEFAULT_ARC_PEAK_Y,
    };
    this.observer = scene.onBeforeRenderObservable.add(() => {
      this.tick(scene.getEngine().getDeltaTime());
    });
  }

  isAnimating(fighterId: string): boolean {
    const drop = this.drops.get(fighterId);
    return Boolean(drop && !drop.landed);
  }

  /** 進頒冠前停掉飛行中的拖尾；角色姿勢留給典禮重排 */
  cancelAll(): void {
    for (const drop of this.drops.values()) {
      this.disposeTrail(drop.trail);
    }

    this.drops.clear();
  }

  /** 重生後清掉落地狀態，允許再次甩飛 */
  clearActor(fighterId: string): void {
    const drop = this.drops.get(fighterId);

    if (!drop) {
      return;
    }

    if (!drop.landed) {
      this.disposeTrail(drop.trail);
    }

    this.drops.delete(fighterId);
  }

  beginFall(
    fighterId: string,
    actor: AnimalActor,
    playerColor: string,
    options: KnockbackFallOptions = {},
  ): void {
    const existing = this.drops.get(fighterId);

    if (existing && !existing.landed) {
      return;
    }

    if (existing) {
      this.clearActor(fighterId);
    }

    const startX = actor.root.position.x;
    const startY = Math.max(0, actor.root.position.y);
    const startZ = actor.root.position.z;
    const customDir = options.dirX != null && options.dirZ != null
      ? Math.hypot(options.dirX, options.dirZ)
      : 0;
    let outX: number;
    let outZ: number;

    if (customDir > 0.01) {
      outX = options.dirX! / customDir;
      outZ = options.dirZ! / customDir;
    } else {
      const dist = Math.hypot(startX, startZ) || 1;
      outX = startX / dist;
      outZ = startZ / dist;
    }

    const colorHex = PLAYER_COLOR_HEX[playerColor] ?? '#9b7fd4';
    const outwardDistance = options.outwardDistance ?? this.defaultOptions.outwardDistance;
    const arcPeakY = options.arcPeakY ?? this.defaultOptions.arcPeakY;
    const durationMs = options.durationMs ?? ACTOR_KNOCKBACK_FALL_DURATION_MS;
    const spinRevolutions = options.spinRevolutions ?? DEFAULT_SPIN_REVOLUTIONS;
    const hideOnLand = options.hideOnLand ?? false;

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
      landed: false,
      outwardDistance,
      arcPeakY,
      durationMs,
      spinRevolutions,
      hideOnLand,
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
    for (const drop of this.drops.values()) {
      if (drop.landed) {
        continue;
      }

      drop.elapsedMs += deltaMs;
      const progress = Math.min(1, drop.elapsedMs / drop.durationMs);
      const outward = drop.outwardDistance * (1 - (1 - progress) ** 1.55);
      const height = flightHeight(drop.startY, progress, drop.arcPeakY);
      const tip = progress * Math.PI * 1.4 * drop.spinSign;
      const tumble = progress * Math.PI * 2 * drop.spinRevolutions;

      const x = drop.startX + drop.outX * outward;
      const z = drop.startZ + drop.outZ * outward;

      drop.actor.root.position.set(x, height, z);
      drop.actor.root.rotation.x = tumble;
      drop.actor.root.rotation.z = tip;
      drop.actor.root.scaling.setAll(1);
      drop.trail.emitter = new Vector3(x, height + 0.45, z);

      if (progress < 1) {
        continue;
      }

      this.finishLanding(drop);
    }
  }

  private finishLanding(drop: FallDrop): void {
    const x = drop.startX + drop.outX * drop.outwardDistance;
    const z = drop.startZ + drop.outZ * drop.outwardDistance;

    this.disposeTrail(drop.trail);
    drop.actor.root.scaling.setAll(1);
    drop.actor.root.rotation.x = 0;
    drop.actor.root.rotation.z = 0;
    drop.actor.root.position.set(x, 0, z);

    if (drop.hideOnLand) {
      drop.actor.setSubtreeEnabled(false);
    } else {
      drop.actor.setSubtreeEnabled(true);
      drop.actor.playFaint();
    }

    drop.landed = true;
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
      `knockback-meteor-trail-${this.particles.length}`,
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
    const system = new ParticleSystem(
      `knockback-fall-splash-${this.particles.length}`,
      56,
      this.scene,
    );
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
    const dynamic = new DynamicTexture(
      'knockback-fall-dot',
      { width: size, height: size },
      this.scene,
      false,
    );
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

/** @deprecated 相容舊名稱 */
export const ArenaBumpFallFx = ActorKnockbackFallFx;
