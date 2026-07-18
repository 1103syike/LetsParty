import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
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

interface ShockRing {
  mesh: Mesh;
  bornAt: number;
  lifeMs: number;
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

/** 撞擊特效：一般推擠小爆；踢飛＝衝擊波＋星星雨＋閃光 */
export class ArenaBumpHitFx {
  private readonly scene: Scene;

  private readonly particles: ParticleSystem[] = [];

  private readonly shockRings: ShockRing[] = [];

  private readonly attackLockUntil = new Map<string, number>();

  private flashMesh: Mesh | null = null;

  private flashMat: StandardMaterial | null = null;

  private flashUntilMs = 0;

  private dotTexture: Texture | null = null;

  private starTexture: Texture | null = null;

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

    if (hit.kind === 'charge') {
      this.playSuperKick(hit.x, hit.z, colorHex);
    } else {
      this.spawnBurst(hit.x, hit.z, colorHex, 36, 0.55);
    }

    if (!attacker) {
      return;
    }

    attacker.playAttack();
    this.attackLockUntil.set(
      hit.attackerId,
      performance.now() + (hit.kind === 'charge' ? 720 : 320),
    );
  }

  update(): void {
    const now = performance.now();

    if (this.flashMesh && this.flashMat) {
      if (now >= this.flashUntilMs) {
        this.flashMesh.setEnabled(false);
      } else {
        const t = (this.flashUntilMs - now) / 420;
        this.flashMat.alpha = 0.7 * t;
        this.flashMesh.scaling.setAll(1.4 + (1 - t) * 4.2);
      }
    }

    for (let i = this.shockRings.length - 1; i >= 0; i -= 1) {
      const ring = this.shockRings[i]!;
      const age = now - ring.bornAt;
      const t = age / ring.lifeMs;

      if (t >= 1) {
        ring.mesh.dispose();
        this.shockRings.splice(i, 1);
        continue;
      }

      const scale = 0.6 + t * 5.5;
      ring.mesh.scaling.setAll(scale);
      const mat = ring.mesh.material;

      if (mat instanceof StandardMaterial) {
        mat.alpha = 0.85 * (1 - t);
      }
    }
  }

  dispose(): void {
    for (const system of this.particles) {
      system.dispose();
    }

    this.particles.length = 0;

    for (const ring of this.shockRings) {
      ring.mesh.dispose();
    }

    this.shockRings.length = 0;
    this.attackLockUntil.clear();
    this.flashMesh?.dispose();
    this.flashMesh = null;
    this.flashMat = null;
    this.dotTexture?.dispose();
    this.dotTexture = null;
    this.starTexture?.dispose();
    this.starTexture = null;
  }

  private playSuperKick(x: number, z: number, colorHex: string): void {
    this.spawnBurst(x, z, colorHex, 96, 0.85);
    this.spawnStarBurst(x, z, colorHex);
    this.spawnShockRing(x, z, colorHex);
    this.showFlash(x, z, colorHex);

    // 第二波延遲小爆，像連擊火花
    window.setTimeout(() => {
      if (this.scene.isDisposed) {
        return;
      }

      this.spawnBurst(x, z, '#ffe566', 48, 1.1);
    }, 90);
  }

  private showFlash(x: number, z: number, colorHex: string): void {
    if (!this.flashMesh || !this.flashMat) {
      this.flashMesh = MeshBuilder.CreateDisc(
        'arena-kick-flash',
        { radius: 1.1, tessellation: 36 },
        this.scene,
      );
      this.flashMesh.rotation.x = Math.PI / 2;
      this.flashMat = new StandardMaterial('arena-kick-flash-mat', this.scene);
      this.flashMat.specularColor = Color3.Black();
      this.flashMat.disableLighting = true;
      this.flashMat.backFaceCulling = false;
      this.flashMesh.material = this.flashMat;
      this.flashMesh.isPickable = false;
    }

    const accent = Color3.FromHexString(colorHex);
    this.flashMat.diffuseColor = accent;
    this.flashMat.emissiveColor = Color3.FromHexString('#ffe566').scale(0.65).add(accent.scale(0.35));
    this.flashMesh.position.set(x, 0.06, z);
    this.flashMesh.scaling.setAll(1.4);
    this.flashMat.alpha = 0.7;
    this.flashMesh.setEnabled(true);
    this.flashUntilMs = performance.now() + 420;
  }

  private spawnShockRing(x: number, z: number, colorHex: string): void {
    const mesh = MeshBuilder.CreateTorus(
      `arena-kick-ring-${this.shockRings.length}`,
      { diameter: 1.2, thickness: 0.12, tessellation: 48 },
      this.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.14, z);
    mesh.isPickable = false;

    const mat = new StandardMaterial(`arena-kick-ring-mat-${this.shockRings.length}`, this.scene);
    mat.diffuseColor = Color3.FromHexString('#fff8e8');
    mat.emissiveColor = Color3.FromHexString(colorHex);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.alpha = 0.85;
    mesh.material = mat;

    this.shockRings.push({
      mesh,
      bornAt: performance.now(),
      lifeMs: 480,
    });
  }

  private spawnStarBurst(x: number, z: number, colorHex: string): void {
    const texture = this.getStarTexture();
    const system = new ParticleSystem(
      `arena-kick-stars-${this.particles.length}`,
      64,
      this.scene,
    );
    const gold = new Color4(1, 0.9, 0.35, 1);
    const accent = hexToColor4(colorHex, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.7, z);
    system.minEmitBox = new Vector3(-0.15, 0, -0.15);
    system.maxEmitBox = new Vector3(0.15, 0.35, 0.15);
    system.color1 = gold;
    system.color2 = accent;
    system.colorDead = new Color4(1, 1, 1, 0);
    system.minSize = 0.22;
    system.maxSize = 0.7;
    system.minLifeTime = 0.25;
    system.maxLifeTime = 0.65;
    system.emitRate = 0;
    system.manualEmitCount = 64;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.gravity = new Vector3(0, -3.5, 0);
    system.direction1 = new Vector3(-5.5, 1.2, -5.5);
    system.direction2 = new Vector3(5.5, 6.5, 5.5);
    system.minEmitPower = 4.5;
    system.maxEmitPower = 11;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.7;
    system.onDisposeObservable.add(() => {
      const index = this.particles.indexOf(system);

      if (index >= 0) {
        this.particles.splice(index, 1);
      }
    });
    system.start();
    this.particles.push(system);
  }

  private spawnBurst(
    x: number,
    z: number,
    colorHex: string,
    count: number,
    y = 0.55,
  ): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`arena-hit-burst-${this.particles.length}`, count, this.scene);
    const accent = hexToColor4(colorHex, 1);
    const flash = new Color4(1, 0.95, 0.75, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, y, z);
    system.minEmitBox = new Vector3(-0.12, 0, -0.12);
    system.maxEmitBox = new Vector3(0.12, 0.35, 0.12);
    system.color1 = flash;
    system.color2 = accent;
    system.colorDead = new Color4(accent.r, accent.g, accent.b, 0);
    system.minSize = count >= 80 ? 0.12 : 0.08;
    system.maxSize = count >= 80 ? 0.55 : 0.28;
    system.minLifeTime = 0.14;
    system.maxLifeTime = count >= 80 ? 0.55 : 0.38;
    system.emitRate = 0;
    system.manualEmitCount = count;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.gravity = new Vector3(0, -7, 0);
    system.direction1 = new Vector3(-4.5, 0.8, -4.5);
    system.direction2 = new Vector3(4.5, 5.5, 4.5);
    system.minEmitPower = count >= 80 ? 3.8 : 2.4;
    system.maxEmitPower = count >= 80 ? 10 : 6.5;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = count >= 80 ? 0.65 : 0.45;
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

  private getStarTexture(): Texture {
    if (this.starTexture) {
      return this.starTexture;
    }

    const size = 64;
    const dynamic = new DynamicTexture('arena-hit-star', { width: size, height: size }, this.scene, false);
    const ctx = dynamic.getContext();
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    const cx = size / 2;
    const cy = size / 2;
    const spikes = 5;
    const outer = size * 0.46;
    const inner = size * 0.2;

    for (let i = 0; i < spikes * 2; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.closePath();
    ctx.fill();
    dynamic.update();
    this.starTexture = dynamic;

    return dynamic;
  }
}
