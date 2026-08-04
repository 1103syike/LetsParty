import {
  applyBumpEdgeSafety,
  applyBumpFalls,
  applyBumpSteer,
  computeCpuBumpIntent,
  countAliveBodies,
  createBumpBodies,
  createCpuBumpBrain,
  placeBumpBodiesAtCorners,
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
import { ACTOR_KNOCKBACK_FALL_DURATION_MS } from '@/common/fx/actor-knockback-fall-fx';
import type { MiniGameCreateOptions, MiniGameInstance } from '@/minigames/types';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

const COUNTDOWN_MS = 5000;
/** 下一分開場倒數稍短 */
const BETWEEN_COUNTDOWN_MS = 3000;
const PLAY_DURATION_MS = 50000;
const SCORE_TO_WIN = 3;
const POINT_PAUSE_MS = 2400;
/** 落地後再等多久進得分暫停 */
const AFTER_FALL_SETTLE_MS = 1000;
/** 剩一人：等甩飛落地 + 再停 */
const END_WHEN_ONE_LEFT_MS = ACTOR_KNOCKBACK_FALL_DURATION_MS + AFTER_FALL_SETTLE_MS;
const CROWN_AWARD_DURATION_MS = 5200;

export type ArenaBumpPhase =
  | 'countdown'
  | 'playing'
  | 'pointPause'
  | 'crownAward'
  | 'finished';

export interface ArenaBumpFighterSnapshot {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingX: number;
  facingZ: number;
  /** 本局開局四角槽位（打亂後） */
  spawnSlot: number;
  alive: boolean;
  fallOrder: number;
  isCharging: boolean;
  isJumping: boolean;
  chargeReady: boolean;
  /** 搶三累積分 */
  score: number;
  /** 開局無敵白閃（倒數中） */
  invulnerable: boolean;
  isFlashing: boolean;
}

export interface ArenaBumpSnapshot {
  phase: ArenaBumpPhase;
  /** 開局倒數剩餘秒數（僅 countdown；其餘為 0） */
  countdownSecondsLeft: number;
  secondsLeft: number;
  aliveCount: number;
  fighters: ArenaBumpFighterSnapshot[];
  localPlayerId: string | null;
  /** 本機本局開局站位槽（供鏡頭／WASD 對齊） */
  localSpawnSlot: number;
  localAlive: boolean;
  localChargeReady: boolean;
  /** 本機撞擊冷卻剩餘秒（小數；0 表示無冷卻） */
  localChargeCooldownSeconds: number;
  /** 遞增序號：場景用來看有沒有新撞擊要播特效 */
  hitSerial: number;
  hits: BumpHitEvent[];
  scoreToWin: number;
  /** 本分勝者（pointPause／頒冠） */
  pointWinnerId: string | null;
  pointPauseMsLeft: number;
  scoreFxSerial: number;
  /** 整場搶三最終勝者（頒冠） */
  winnerId: string | null;
  isCrownCeremony: boolean;
  crownWinnerIds: string[];
  crownAwardDurationMs: number;
}

export class ArenaBumpGame implements MiniGameInstance {
  private readonly bodies: BumpBody[];

  private readonly steers = new Map<string, { x: number; z: number }>();

  private readonly cpuBrains = new Map<string, CpuBumpBrain>();

  private readonly scores = new Map<string, number>();

  private readonly localPlayerId: string | null;

  private phase: ArenaBumpPhase = 'countdown';

  private elapsedMs = 0;

  private phaseStartedAt = 0;

  private countdownDurationMs = COUNTDOWN_MS;

  private fallOrderCursor = 1;

  private endDelayMs = 0;

  private crownAwardStartedAt = 0;

  private crownAwardDurationMs = CROWN_AWARD_DURATION_MS;

  private pointWinnerId: string | null = null;

  private matchWinnerId: string | null = null;

  private scoreFxSerial = 0;

  private hitSerial = 0;

  private recentHits: BumpHitEvent[] = [];

  constructor(
    participants: Participant[],
    localPlayerId: string | null = null,
    _options: MiniGameCreateOptions = {},
  ) {
    this.bodies = createBumpBodies(participants.map((participant) => participant.id));
    this.localPlayerId = localPlayerId;

    for (const body of this.bodies) {
      this.steers.set(body.id, { x: 0, z: 0 });
      this.scores.set(body.id, 0);
    }
  }

  start(): void {
    this.phase = 'countdown';
    this.elapsedMs = 0;
    this.phaseStartedAt = 0;
    this.countdownDurationMs = COUNTDOWN_MS;
    this.fallOrderCursor = 1;
    this.endDelayMs = 0;
    this.crownAwardStartedAt = 0;
    this.crownAwardDurationMs = CROWN_AWARD_DURATION_MS;
    this.pointWinnerId = null;
    this.matchWinnerId = null;
    this.scoreFxSerial = 0;
    this.hitSerial = 0;
    this.recentHits = [];
    this.cpuBrains.clear();

    for (const body of this.bodies) {
      this.scores.set(body.id, 0);
      this.steers.set(body.id, { x: 0, z: 0 });
    }

    this.resetBodiesForBout();
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
      if (this.elapsedMs - this.phaseStartedAt >= this.countdownDurationMs) {
        this.phase = 'playing';
        this.phaseStartedAt = this.elapsedMs;
        this.endDelayMs = 0;

        for (const body of this.bodies) {
          body.invulnerableUntilMs = 0;
        }
      }

      return;
    }

    if (this.phase === 'pointPause') {
      if (this.elapsedMs - this.phaseStartedAt >= POINT_PAUSE_MS) {
        if (this.matchWinnerId) {
          this.beginCrownAward();
        } else {
          this.resetBodiesForBout();
          this.pointWinnerId = null;
          this.countdownDurationMs = BETWEEN_COUNTDOWN_MS;
          this.phase = 'countdown';
          this.phaseStartedAt = this.elapsedMs;
        }
      }

      return;
    }

    if (this.phase === 'crownAward') {
      if (this.elapsedMs >= this.crownAwardStartedAt + this.crownAwardDurationMs) {
        this.phase = 'finished';
      }

      return;
    }

    if (this.phase !== 'playing') {
      return;
    }

    const playElapsed = this.elapsedMs - this.phaseStartedAt;
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
    const timeUp = playElapsed >= PLAY_DURATION_MS;

    if (aliveCount <= 1 || timeUp) {
      this.endDelayMs += deltaMs;
      const settleDelay = aliveCount <= 1 ? END_WHEN_ONE_LEFT_MS : AFTER_FALL_SETTLE_MS;

      if (this.endDelayMs >= settleDelay) {
        this.beginPointPause();
      }
    } else {
      this.endDelayMs = 0;
    }
  }

  getRankings(): string[] {
    return [...this.bodies]
      .sort((left, right) => {
        const scoreDiff = (this.scores.get(right.id) ?? 0) - (this.scores.get(left.id) ?? 0);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        if (left.alive !== right.alive) {
          return left.alive ? -1 : 1;
        }

        if (!left.alive && !right.alive) {
          return left.fallOrder - right.fallOrder;
        }

        return left.id.localeCompare(right.id);
      })
      .map((body) => body.id);
  }

  getCrownAwards(_rankings: string[] = this.getRankings()): Record<string, number> {
    const awards: Record<string, number> = {};

    for (const body of this.bodies) {
      awards[body.id] = 0;
    }

    if (this.matchWinnerId) {
      awards[this.matchWinnerId] = 1;
    }

    return awards;
  }

  getRoundResults(): Record<string, 'win' | 'lose'> {
    const results: Record<string, 'win' | 'lose'> = {};

    for (const body of this.bodies) {
      results[body.id] = body.id === this.matchWinnerId ? 'win' : 'lose';
    }

    return results;
  }

  getScores(): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const body of this.bodies) {
      scores[body.id] = this.scores.get(body.id) ?? 0;
    }

    return scores;
  }

  getGameSnapshot(viewerId?: string | null): ArenaBumpSnapshot {
    const viewPlayerId = viewerId === undefined ? this.localPlayerId : viewerId;
    const local = this.bodies.find((body) => body.id === viewPlayerId);
    const countdownElapsed = this.phase === 'countdown'
      ? this.elapsedMs - this.phaseStartedAt
      : this.countdownDurationMs;
    const playElapsed = this.phase === 'playing'
      ? this.elapsedMs - this.phaseStartedAt
      : 0;
    const pointPauseElapsed = this.phase === 'pointPause'
      ? this.elapsedMs - this.phaseStartedAt
      : 0;

    const winnerId = this.phase === 'pointPause'
      ? this.pointWinnerId
      : this.phase === 'crownAward' || this.phase === 'finished'
        ? this.matchWinnerId
        : null;

    return {
      phase: this.phase,
      countdownSecondsLeft: this.phase === 'countdown'
        ? Math.max(1, Math.ceil((this.countdownDurationMs - countdownElapsed) / 1000))
        : 0,
      secondsLeft: this.phase === 'playing'
        ? Math.max(0, Math.ceil((PLAY_DURATION_MS - playElapsed) / 1000))
        : Math.ceil(PLAY_DURATION_MS / 1000),
      aliveCount: countAliveBodies(this.bodies),
      fighters: this.bodies.map((body) => {
        const isFlashing = this.phase === 'countdown';

        return {
          id: body.id,
          x: body.x,
          z: body.z,
          vx: body.vx,
          vz: body.vz,
          facingX: body.facingX,
          facingZ: body.facingZ,
          spawnSlot: body.spawnSlot,
          alive: body.alive,
          fallOrder: body.fallOrder,
          isCharging: body.isCharging,
          isJumping: body.jumpMsLeft > 0,
          chargeReady: body.chargeCooldownMs <= 0
            && !body.isCharging
            && body.stunMsLeft <= 0
            && body.jumpMsLeft <= 0,
          score: this.scores.get(body.id) ?? 0,
          invulnerable: isFlashing,
          isFlashing,
        };
      }),
      localPlayerId: viewPlayerId,
      localSpawnSlot: local?.spawnSlot ?? 0,
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
      scoreToWin: SCORE_TO_WIN,
      pointWinnerId: this.phase === 'pointPause' ? this.pointWinnerId : null,
      pointPauseMsLeft: this.phase === 'pointPause'
        ? Math.max(0, POINT_PAUSE_MS - pointPauseElapsed)
        : 0,
      scoreFxSerial: this.scoreFxSerial,
      winnerId,
      isCrownCeremony: this.phase === 'crownAward',
      crownWinnerIds: this.matchWinnerId ? [this.matchWinnerId] : [],
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

  private beginPointPause(): void {
    if (this.phase === 'pointPause' || this.phase === 'crownAward' || this.phase === 'finished') {
      return;
    }

    const boutWinnerId = resolveArenaWinnerId(this.bodies);

    if (!boutWinnerId) {
      // 理論上不該沒人；保底重開一分
      this.resetBodiesForBout();
      this.countdownDurationMs = BETWEEN_COUNTDOWN_MS;
      this.phase = 'countdown';
      this.phaseStartedAt = this.elapsedMs;
      return;
    }

    const nextScore = (this.scores.get(boutWinnerId) ?? 0) + 1;
    this.scores.set(boutWinnerId, nextScore);
    this.pointWinnerId = boutWinnerId;
    this.scoreFxSerial += 1;
    this.phase = 'pointPause';
    this.phaseStartedAt = this.elapsedMs;
    this.endDelayMs = 0;

    for (const body of this.bodies) {
      body.vx = 0;
      body.vz = 0;
      body.isCharging = false;
      this.steers.set(body.id, { x: 0, z: 0 });
    }

    if (nextScore >= SCORE_TO_WIN) {
      this.matchWinnerId = boutWinnerId;
    }
  }

  private beginCrownAward(): void {
    this.matchWinnerId = this.matchWinnerId
      ?? this.pointWinnerId
      ?? resolveArenaWinnerId(this.bodies);
    this.crownAwardStartedAt = this.elapsedMs;
    this.crownAwardDurationMs = CROWN_AWARD_DURATION_MS;
    this.phase = 'crownAward';
    this.pointWinnerId = null;

    for (const body of this.bodies) {
      body.vx = 0;
      body.vz = 0;
      body.isCharging = false;
      this.steers.set(body.id, { x: 0, z: 0 });
    }
  }

  private resetBodiesForBout(): void {
    this.fallOrderCursor = 1;
    this.endDelayMs = 0;
    this.recentHits = [];

    for (const body of this.bodies) {
      body.alive = true;
      body.fallOrder = 0;
      body.vx = 0;
      body.vz = 0;
      body.isCharging = false;
      body.chargeMsLeft = 0;
      body.stunMsLeft = 0;
      body.jumpMsLeft = 0;
      body.jumpCooldownMs = 0;
      body.finisherIgnoreEdgeMs = 0;
      body.invulnerableUntilMs = 0;
      this.steers.set(body.id, { x: 0, z: 0 });
    }

    placeBumpBodiesAtCorners(this.bodies);
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
