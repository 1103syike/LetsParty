import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';

import type { AnimalActor } from '@/common/animals/animal-actor';
import type { BumpHitEvent } from '@/common/arena/bump-physics';

const PLAYER_COLOR_HEX: Record<string, string> = {
  'player-1': '#e86b8a',
  'player-2': '#9b7fd4',
  'player-3': '#6ba8e8',
  'player-4': '#7ecf9a',
};

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

/** 撞擊瞬間：粒子爆開 + 攻擊者播 attack */
export class ArenaBumpHitFx {
  private readonly scene: Scene;

  private readonly particles: ParticleSystem[] = [];

  private readonly attackLockUntil = new Map<string, number>();

  private dotTexture: Texture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  isAttackLocked(fighterId: string): boolean {
    return (this.attackLockUntil.get(fighterId) ?? 0) > performance.now();
  }

  playHit(
    hit: BumpHitEvent,
    attacker: AnimalActor | undefined,
    attackerColor: string,
  ): void {
    const colorHex = PLAYER_COLOR_HEX[attackerColor] ?? '#9b7fd4';
    this.spawnBurst(hit.x, hit.z, colorHex, hit.kind === 'charge' ? 56 : 36);

    if (!attacker) {
      return;
    }

    attacker.playAttack();
    this.attackLockUntil.set(
      hit.attackerId,
      performance.now() + (hit.kind === 'charge' ? 480 : 320),
    );
  }

  dispose(): void {
    for (const system of this.particles) {
      system.dispose();
    }

    this.particles.length = 0;
    this.attackLockUntil.clear();
    this.dotTexture?.dispose();
    this.dotTexture = null;
  }

  private spawnBurst(x: number, z: number, colorHex: string, count: number): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`arena-hit-burst-${this.particles.length}`, count, this.scene);
    const accent = hexToColor4(colorHex, 1);
    const flash = new Color4(1, 0.95, 0.75, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.55, z);
    system.minEmitBox = new Vector3(-0.08, 0, -0.08);
    system.maxEmitBox = new Vector3(0.08, 0.2, 0.08);
    system.color1 = flash;
    system.color2 = accent;
    system.colorDead = new Color4(accent.r, accent.g, accent.b, 0);
    system.minSize = 0.08;
    system.maxSize = count >= 50 ? 0.42 : 0.28;
    system.minLifeTime = 0.12;
    system.maxLifeTime = 0.38;
    system.emitRate = 0;
    system.manualEmitCount = count;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.gravity = new Vector3(0, -6, 0);
    system.direction1 = new Vector3(-3.2, 0.6, -3.2);
    system.direction2 = new Vector3(3.2, 4.2, 3.2);
    system.minEmitPower = 2.4;
    system.maxEmitPower = 6.5;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.45;
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
    const dynamic = new DynamicTexture('arena-hit-dot', { width: size, height: size }, this.scene, false);
    const ctx = dynamic.getContext();
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.9)');
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
