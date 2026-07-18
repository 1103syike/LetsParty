import {
  applyBumpEdgeSafety,
  applyBumpFalls,
  applyBumpSteer,
  computeCpuBumpIntent,
  countAliveBodies,
  createBumpBodies,
  createCpuBumpBrain,
  placeBumpBodiesAtCorners,
  rankBumpBodies,
  resolveArenaWinnerId,
  resolveBumpCollisions,
  resolveChargeSweeps,
  tickBumpSkillTimers,
  tryStartBumpCharge,
  tryStartBumpJump,
  type BumpBody,
  type BumpHitEvent,
  type CpuBumpBrain,
} from '@/common/arena/bump-physics';
import { ARENA_BUMP_FALL_DURATION_MS } from '@/minigames/arena-bump/arena-bump-fall-fx';
import type { MiniGameCreateOptions, MiniGameInstance } from '@/minigames/types';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

const COUNTDOWN_MS = 5000;
const PLAY_DURATION_MS = 50000;
/** 落地後再等多久才進頒冠／結算 */
const AFTER_FALL_SETTLE_MS = 1000;
/** 剩一人：等甩飛落地 + 再停 1 秒 */
const END_WHEN_ONE_LEFT_MS = ARENA_BUMP_FALL_DURATION_MS + AFTER_FALL_SETTLE_MS;
const CROWN_AWARD_DURATION_MS = 3400;

export type ArenaBumpPhase = 'countdown' | 'playing' | 'crownAward' | 'finished';

export interface ArenaBumpFighterSnapshot {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingX: number;
  facingZ: number;
  alive: boolean;
  fallOrder: number;
  isCharging: boolean;
  isJumping: boolean;
  chargeReady: boolean;
}

export interface ArenaBumpSnapshot {
  phase: ArenaBumpPhase;
  /** 開局倒數剩餘秒數（僅 countdown；其餘為 0） */
  countdownSecondsLeft: number;
  /** 倒數結束後短暫顯示「開始！」 */
  showCountdownGo: boolean;
  secondsLeft: number;
  aliveCount: number;
  fighters: ArenaBumpFighterSnapshot[];
  localPlayerId: string | null;
  localAlive: boolean;
  localChargeReady: boolean;
  /** 本機撞擊冷卻剩餘秒（小數；0 表示無冷卻） */
  localChargeCooldownSeconds: number;
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

  private readonly skipOpeningCountdown: boolean;

  private phase: ArenaBumpPhase = 'countdown';

  private elapsedMs = 0;

  private fallOrderCursor = 1;

  private endDelayMs = 0;

  private crownAwardStartedAt = 0;

  private crownAwardDurationMs = CROWN_AWARD_DURATION_MS;

  private winnerId: string | null = null;

  private hitSerial = 0;

  private recentHits: BumpHitEvent[] = [];

  constructor(
    participants: Participant[],
    localPlayerId: string | null = null,
    options: MiniGameCreateOptions = {},
  ) {
    this.bodies = createBumpBodies(participants.map((participant) => participant.id));
    this.localPlayerId = localPlayerId;
    this.skipOpeningCountdown = options.skipOpeningCountdown ?? false;

    for (const body of this.bodies) {
      this.steers.set(body.id, { x: 0, z: 0 });
    }
  }

  start(): void {
    // 略過倒數時直接開戰，並跳過「開始！」閃示窗（elapsedMs >= 700）
    this.phase = this.skipOpeningCountdown ? 'playing' : 'countdown';
    this.elapsedMs = this.skipOpeningCountdown ? 700 : 0;
    this.fallOrderCursor = 1;
    this.endDelayMs = 0;
    this.crownAwardStartedAt = 0;
    this.crownAwardDurationMs = CROWN_AWARD_DURATION_MS;
    this.winnerId = null;
    this.hitSerial = 0;
    this.recentHits = [];
    this.cpuBrains.clear();
    placeBumpBodiesAtCorners(this.bodies);

    for (const body of this.bodies) {
      this.steers.set(body.id, { x: 0, z: 0 });
    }
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

    if (input.jump) {
      tryStartBumpJump(body);
    }

    if (input.charge) {
      const aimX = input.aimX;
      const aimZ = input.aimZ;

      if (typeof aimX === 'number' && typeof aimZ === 'number') {
        const dx = aimX - body.x;
        const dz = aimZ - body.z;
        const aimMag = Math.hypot(dx, dz);

        if (aimMag > 0.05) {
          body.facingX = dx / aimMag;
          body.facingZ = dz / aimMag;
        }
      } else {
        const steerMag = Math.hypot(input.x, input.y);

        if (steerMag > 0.1) {
          body.facingX = input.x / steerMag;
          body.facingZ = input.y / steerMag;
        }
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
      defend: false,
    };
  }

  onTick(deltaMs: number): void {
    if (this.phase === 'finished') {
      return;
    }

    this.elapsedMs += deltaMs;

    if (this.phase === 'countdown') {
      if (this.elapsedMs >= COUNTDOWN_MS) {
        this.phase = 'playing';
        this.elapsedMs = 0;
      }

      return;
    }

    if (this.phase === 'crownAward') {
      if (this.elapsedMs >= this.crownAwardStartedAt + this.crownAwardDurationMs) {
        this.phase = 'finished';
      }

      return;
    }

    const deltaSec = Math.min(0.05, deltaMs / 1000);
    const frameHits: BumpHitEvent[] = [];

    for (const body of this.bodies) {
      const steer = this.steers.get(body.id) ?? { x: 0, z: 0 };
      applyBumpSteer(body, steer.x, steer.z, deltaSec);
    }

    resolveChargeSweeps(this.bodies, frameHits);
    resolveBumpCollisions(this.bodies, frameHits);
    applyBumpEdgeSafety(this.bodies);
    this.fallOrderCursor = applyBumpFalls(this.bodies, this.fallOrderCursor);

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

      // 剩一人：等被踢飛的人落地趴著再開頒冠；超時也稍停一下
      const settleDelay = aliveCount <= 1 ? END_WHEN_ONE_LEFT_MS : AFTER_FALL_SETTLE_MS;

      if (this.endDelayMs >= settleDelay) {
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
    const countdownSecondsLeft = this.phase === 'countdown'
      ? Math.max(1, Math.ceil((COUNTDOWN_MS - this.elapsedMs) / 1000))
      : 0;
    const secondsLeft = this.phase === 'playing'
      ? Math.max(0, Math.ceil((PLAY_DURATION_MS - this.elapsedMs) / 1000))
      : Math.ceil(PLAY_DURATION_MS / 1000);

    return {
      phase: this.phase,
      countdownSecondsLeft,
      showCountdownGo: this.phase === 'playing' && this.elapsedMs < 700,
      secondsLeft,
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
        isJumping: body.jumpMsLeft > 0,
        chargeReady: body.chargeCooldownMs <= 0
          && !body.isCharging
          && body.stunMsLeft <= 0
          && body.jumpMsLeft <= 0,
      })),
      localPlayerId: this.localPlayerId,
      localAlive: local?.alive ?? false,
      localChargeReady: local
        ? local.chargeCooldownMs <= 0
          && !local.isCharging
          && local.stunMsLeft <= 0
          && local.jumpMsLeft <= 0
        : false,
      localChargeCooldownSeconds: local && local.chargeCooldownMs > 0
        ? local.chargeCooldownMs / 1000
        : 0,
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
