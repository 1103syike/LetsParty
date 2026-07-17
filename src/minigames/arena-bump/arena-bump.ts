import {
  applyBumpFalls,
  applyBumpSteer,
  BUMP_SPAWN_GRACE_MS,
  computeCpuBumpIntent,
  countAliveBodies,
  createBumpBodies,
  createCpuBumpBrain,
  rankBumpBodies,
  resolveArenaWinnerId,
  resolveBumpCollisions,
  resolveChargeSweeps,
  setBumpDefending,
  softClampBodiesInside,
  tickBumpSkillTimers,
  tryStartBumpCharge,
  tryStartBumpJump,
  type BumpBody,
  type BumpHitEvent,
  type CpuBumpBrain,
} from '@/common/arena/bump-physics';
import type { MiniGameInstance } from '@/minigames/types';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

const PLAY_DURATION_MS = 50000;
/** 剩一人後先短暫停一下再進頒冠 */
const END_WHEN_ONE_LEFT_MS = 900;
const CROWN_AWARD_DURATION_MS = 3400;

export type ArenaBumpPhase = 'playing' | 'crownAward' | 'finished';

export interface ArenaBumpFighterSnapshot {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** 面向：格擋盾朝向用 */
  facingX: number;
  facingZ: number;
  alive: boolean;
  fallOrder: number;
  isCharging: boolean;
  isDefending: boolean;
  isJumping: boolean;
  chargeReady: boolean;
}

export interface ArenaBumpSnapshot {
  phase: ArenaBumpPhase;
  secondsLeft: number;
  aliveCount: number;
  fighters: ArenaBumpFighterSnapshot[];
  localPlayerId: string | null;
  localAlive: boolean;
  isSpawnGrace: boolean;
  localChargeReady: boolean;
  localDefending: boolean;
  /** 遞增序號：場景用來看有沒有新撞擊要播特效 */
  hitSerial: number;
  hits: BumpHitEvent[];
  /** 結算／頒冠：最後倖存／超時勝者 */
  winnerId: string | null;
  isCrownCeremony: boolean;
  crownWinnerIds: string[];
  crownAwardDurationMs: number;
}

export class ArenaBumpGame implements MiniGameInstance {
  private readonly bodies: BumpBody[];

  private readonly steers = new Map<string, { x: number; z: number }>();

  private readonly cpuBrains = new Map<string, CpuBumpBrain>();

  private readonly localPlayerId: string | null;

  private phase: ArenaBumpPhase = 'playing';

  private elapsedMs = 0;

  private fallOrderCursor = 1;

  private endDelayMs = 0;

  private crownAwardStartedAt = 0;

  private crownAwardDurationMs = CROWN_AWARD_DURATION_MS;

  private winnerId: string | null = null;

  private hitSerial = 0;

  private recentHits: BumpHitEvent[] = [];

  constructor(participants: Participant[], localPlayerId: string | null = null) {
    this.bodies = createBumpBodies(participants.map((participant) => participant.id));
    this.localPlayerId = localPlayerId;

    for (const body of this.bodies) {
      this.steers.set(body.id, { x: 0, z: 0 });
    }
  }

  start(): void {
    this.phase = 'playing';
    this.elapsedMs = 0;
    this.fallOrderCursor = 1;
    this.endDelayMs = 0;
    this.crownAwardStartedAt = 0;
    this.crownAwardDurationMs = CROWN_AWARD_DURATION_MS;
    this.winnerId = null;
    this.hitSerial = 0;
    this.recentHits = [];
    this.cpuBrains.clear();
  }

  onPlayerInput(playerId: string, input: PlayerInput): void {
    if (this.phase !== 'playing') {
      return;
    }

    const body = this.bodies.find((entry) => entry.id === playerId);

    if (!body?.alive) {
      return;
    }

    if (input.type === 'joystick') {
      this.applySteerInput(playerId, input.x, input.y);
      return;
    }

    if (input.type !== 'arena') {
      return;
    }

    this.applySteerInput(playerId, input.x, input.y);
    setBumpDefending(body, input.defend);

    if (input.jump) {
      tryStartBumpJump(body);
    }

    if (input.charge) {
      const steerMag = Math.hypot(input.x, input.y);

      if (steerMag > 0.1) {
        body.facingX = input.x / steerMag;
        body.facingZ = input.y / steerMag;
      }

      tryStartBumpCharge(body);
    }
  }

  getCpuInput(cpuId: string, _deltaMs: number): PlayerInput {
    if (this.phase !== 'playing') {
      return { type: 'arena', x: 0, y: 0, jump: false, charge: false, defend: false };
    }

    const self = this.bodies.find((body) => body.id === cpuId);

    if (!self?.alive) {
      return { type: 'arena', x: 0, y: 0, jump: false, charge: false, defend: false };
    }

    let brain = this.cpuBrains.get(cpuId);

    if (!brain) {
      brain = createCpuBumpBrain();
      this.cpuBrains.set(cpuId, brain);
    }

    const intent = computeCpuBumpIntent(self, this.bodies, this.elapsedMs, brain);

    return {
      type: 'arena',
      x: intent.steer.x,
      y: intent.steer.z,
      jump: intent.wantJump,
      charge: intent.wantCharge,
      defend: intent.wantDefend,
    };
  }

  onTick(deltaMs: number): void {
    if (this.phase === 'finished') {
      return;
    }

    this.elapsedMs += deltaMs;

    if (this.phase === 'crownAward') {
      if (this.elapsedMs >= this.crownAwardStartedAt + this.crownAwardDurationMs) {
        this.phase = 'finished';
      }

      return;
    }

    const deltaSec = Math.min(0.05, deltaMs / 1000);
    const isGrace = this.elapsedMs < BUMP_SPAWN_GRACE_MS;
    const frameHits: BumpHitEvent[] = [];

    for (const body of this.bodies) {
      const steer = this.steers.get(body.id) ?? { x: 0, z: 0 };
      const damp = isGrace && body.id !== this.localPlayerId ? 0.4 : 1;
      applyBumpSteer(body, steer.x * damp, steer.z * damp, deltaSec);
    }

    if (!isGrace) {
      resolveChargeSweeps(this.bodies, frameHits);
      resolveBumpCollisions(this.bodies, frameHits);
      this.fallOrderCursor = applyBumpFalls(this.bodies, this.fallOrderCursor);
    } else {
      softClampBodiesInside(this.bodies);
    }

    for (const body of this.bodies) {
      tickBumpSkillTimers(body, deltaMs);
    }

    if (frameHits.length > 0) {
      this.recentHits = frameHits;
      this.hitSerial += 1;
    }

    const aliveCount = countAliveBodies(this.bodies);
    const timeUp = this.elapsedMs >= PLAY_DURATION_MS;

    if (aliveCount <= 1 || timeUp) {
      this.endDelayMs += deltaMs;

      // 超時立刻頒冠；剩一人則稍等掉落演出
      if (timeUp || this.endDelayMs >= END_WHEN_ONE_LEFT_MS) {
        this.beginCrownAward();
      }
    } else {
      this.endDelayMs = 0;
    }
  }

  getRankings(): string[] {
    return rankBumpBodies(this.bodies);
  }

  getCrownAwards(_rankings: string[] = this.getRankings()): Record<string, number> {
    const awards: Record<string, number> = {};

    for (const body of this.bodies) {
      awards[body.id] = 0;
    }

    const winnerId = this.winnerId ?? resolveArenaWinnerId(this.bodies);

    if (winnerId) {
      awards[winnerId] = 1;
    }

    return awards;
  }

  getRoundResults(): Record<string, 'win' | 'lose'> {
    const winnerId = this.winnerId ?? resolveArenaWinnerId(this.bodies);
    const results: Record<string, 'win' | 'lose'> = {};

    for (const body of this.bodies) {
      results[body.id] = body.id === winnerId ? 'win' : 'lose';
    }

    return results;
  }

  getScores(): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const body of this.bodies) {
      scores[body.id] = body.alive ? 1 : 0;
    }

    return scores;
  }

  getGameSnapshot(): ArenaBumpSnapshot {
    const local = this.bodies.find((body) => body.id === this.localPlayerId);
    const winnerId = this.phase === 'playing' && countAliveBodies(this.bodies) > 1
      ? null
      : (this.winnerId ?? resolveArenaWinnerId(this.bodies));

    return {
      phase: this.phase,
      secondsLeft: Math.max(0, Math.ceil((PLAY_DURATION_MS - this.elapsedMs) / 1000)),
      aliveCount: countAliveBodies(this.bodies),
      fighters: this.bodies.map((body) => ({
        id: body.id,
        x: body.x,
        z: body.z,
        vx: body.vx,
        vz: body.vz,
        facingX: body.facingX,
        facingZ: body.facingZ,
        alive: body.alive,
        fallOrder: body.fallOrder,
        isCharging: body.isCharging,
        isDefending: body.isDefending,
        isJumping: body.jumpMsLeft > 0,
        chargeReady: body.chargeCooldownMs <= 0
          && !body.isCharging
          && body.stunMsLeft <= 0
          && body.jumpMsLeft <= 0,
      })),
      localPlayerId: this.localPlayerId,
      localAlive: local?.alive ?? false,
      isSpawnGrace: this.phase === 'playing' && this.elapsedMs < BUMP_SPAWN_GRACE_MS,
      localChargeReady: local
        ? local.chargeCooldownMs <= 0
          && !local.isCharging
          && local.stunMsLeft <= 0
          && local.jumpMsLeft <= 0
        : false,
      localDefending: local?.isDefending ?? false,
      hitSerial: this.hitSerial,
      hits: this.recentHits,
      winnerId,
      isCrownCeremony: this.phase === 'crownAward',
      crownWinnerIds: winnerId ? [winnerId] : [],
      crownAwardDurationMs: this.crownAwardDurationMs,
    };
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  dispose(): void {
    this.phase = 'finished';
    this.steers.clear();
    this.cpuBrains.clear();
    this.recentHits = [];
  }

  private beginCrownAward(): void {
    this.winnerId = resolveArenaWinnerId(this.bodies);
    this.crownAwardStartedAt = this.elapsedMs;
    this.crownAwardDurationMs = CROWN_AWARD_DURATION_MS;
    this.phase = 'crownAward';

    // 頒冠時凍結全員速度
    for (const body of this.bodies) {
      body.vx = 0;
      body.vz = 0;
      body.isCharging = false;
      body.isDefending = false;
      this.steers.set(body.id, { x: 0, z: 0 });
    }
  }

  private applySteerInput(playerId: string, x: number, y: number): void {
    const mag = Math.hypot(x, y);
    const scale = mag > 1 ? 1 / mag : 1;
    this.steers.set(playerId, {
      x: x * scale,
      z: y * scale,
    });
  }
}
