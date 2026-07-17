import type { MiniGameInstance } from '@/minigames/types';
import {
  VB_BALL_RADIUS,
  VB_HITBOX_BUMP,
  VB_HITBOX_Y_MAX_BUMP,
  VB_HITBOX_Y_MIN,
  VB_PLAYER_BODY_RADIUS,
  VB_TEAMMATE_SEPARATION,
  vbCanHitBall,
  vbHorizontalDistance,
} from '@/minigames/volleyball/volleyball-collision';
import {
  vbChaseDistance,
  vbComputeCpuInput,
  vbCpuHomeSpot,
  vbCpuRoleForSlot,
  vbPredictBallLand,
  type VbCpuPlayer,
  type VbCpuRole,
} from '@/minigames/volleyball/volleyball-cpu';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

const SCORE_TO_WIN = 5;
/** 放大後的半場（比初版約 +40%） */
// 略放大半場：對手跑不到就會漏，別靠緊急救球硬撿
const COURT_HALF_WIDTH = 6.0;
const COURT_HALF_DEPTH = 8.4;
const NET_THICKNESS = 0.12;
/** 對齊場景懸空網（volleyball-scene netBottomY / netTopY） */
const NET_BOTTOM_Y = 0.95;
const NET_TOP_Y = 2.0;
/** 過網時球心至少要高過網帶這麼多 */
const NET_CLEAR_Y = NET_TOP_Y + 0.28;
/** 派對手感：略輕，弧線掛得夠久才跑得及 */
const GRAVITY = 11;
const MOVE_SPEED = 6.2;
/** 跳躍殺球再高一點，摸球點才像扣殺 */
const JUMP_SPEED = 7.6;
/** 擊球瞬間球心高度（站立托／墊） */
const HIT_LIFT_Y = 1.15;
const MAX_TOUCHES = 3;
const POINT_PAUSE_MS = 1200;
/** 殺球落地炸飛：多留一點時間看特效 */
const SPIKE_KILL_PAUSE_MS = 2000;
const CROWN_AWARD_MS = 3400;
const SERVE_HEIGHT = 1.1;

export type VolleyballTeamId = 'a' | 'b';
export type VolleyballPhase = 'serve' | 'rally' | 'pointPause' | 'crownAward' | 'finished';
export type VolleyballHitKind = 'bump' | 'set' | 'spike';

export interface VolleyballPlayerSnapshot {
  id: string;
  teamId: VolleyballTeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facingZ: number;
  isJumping: boolean;
  /** 被殺球爆炸擊飛中 */
  isBlasted: boolean;
  alive: boolean;
}

export interface VolleyballSnapshot {
  phase: VolleyballPhase;
  scoreA: number;
  scoreB: number;
  teamAIds: string[];
  teamBIds: string[];
  servingTeam: VolleyballTeamId;
  ball: { x: number; y: number; z: number };
  /** 預期落地 xz（發球／飛行中都有） */
  predictedLand: { x: number; z: number } | null;
  /** 預期落點最接近、應接這球的玩家 */
  ballOwnerId: string | null;
  /**
   * 落點擊球時機 0～1：接近 1 時地上圓環收攏（最佳窗）。
   * 僅 rally 飛行中有意義。
   */
  hitTiming: number;
  players: VolleyballPlayerSnapshot[];
  localPlayerId: string | null;
  localTeamId: VolleyballTeamId | null;
  touchesLeft: number;
  lastToucherId: string | null;
  /** 遞增：場景用來播擊球／殺球動畫 */
  hitSerial: number;
  lastHit: { playerId: string; kind: VolleyballHitKind } | null;
  /** 遞增：殺球落地爆炸 */
  spikeBurstSerial: number;
  spikeBurst: { x: number; z: number } | null;
  /** 遞增：得分特效（含一般得分／殺球得分） */
  scoreFxSerial: number;
  scoreFxKind: 'normal' | 'spike-kill' | null;
  /** 這一分是哪一隊拿的（暫停期間顯示） */
  scoringTeam: VolleyballTeamId | null;
  isCrownCeremony: boolean;
  crownWinnerIds: string[];
  crownAwardDurationMs: number;
}

interface CourtPlayer {
  id: string;
  teamId: VolleyballTeamId;
  role: VbCpuRole;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  vy: number;
  jumpMsLeft: number;
  /** 被炸飛剩餘時間：這期間不受操作、可飛出半場 */
  blastMsLeft: number;
  steerX: number;
  steerZ: number;
  /** 滑鼠點選落點（世界 xz）；null = 自動 */
  aimX: number | null;
  aimZ: number | null;
}

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
  /** 上一幀 z：用來判斷「是否剛穿過網面」 */
  prevZ: number;
}

function shuffleIds(ids: string[]): string[] {
  const next = [...ids];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swap];
    next[swap] = temp;
  }

  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function teamSideSign(teamId: VolleyballTeamId): number {
  return teamId === 'a' ? -1 : 1;
}

function oppositeTeam(teamId: VolleyballTeamId): VolleyballTeamId {
  return teamId === 'a' ? 'b' : 'a';
}

export class VolleyballGame implements MiniGameInstance {
  private readonly localPlayerId: string | null;

  private readonly teamAIds: string[];

  private readonly teamBIds: string[];

  private readonly players: CourtPlayer[];

  private readonly ball: BallState = {
    x: 0,
    y: SERVE_HEIGHT,
    z: -2.4,
    vx: 0,
    vy: 0,
    vz: 0,
    active: false,
    prevZ: -2.4,
  };

  private phase: VolleyballPhase = 'serve';

  private scoreA = 0;

  private scoreB = 0;

  private servingTeam: VolleyballTeamId = 'a';

  private possessionTeam: VolleyballTeamId = 'a';

  private touchesUsed = 0;

  private lastToucherId: string | null = null;

  /** 發球後短暫鎖球，避免隊友立刻二次觸球把弧線打爛 */
  private serveLockMs = 0;

  private pointPauseMs = 0;

  private pointPauseDurationMs = POINT_PAUSE_MS;

  private crownAwardStartedAt = 0;

  private elapsedMs = 0;

  private winnerTeam: VolleyballTeamId | null = null;

  private hitSerial = 0;

  private lastHit: { playerId: string; kind: VolleyballHitKind } | null = null;

  private spikeBurstSerial = 0;

  private spikeBurst: { x: number; z: number } | null = null;

  private scoreFxSerial = 0;

  private scoreFxKind: VolleyballSnapshot['scoreFxKind'] = null;

  private scoringTeam: VolleyballTeamId | null = null;

  /**
   * 對手這次觸球是否鎖定漏接（同一 hitSerial + owner 只骰一次）。
   * 不能每幀 random，否則「漏了」下一幀又打到。
   */
  private opponentMissPlanKey: string | null = null;

  private opponentMissOwnerId: string | null = null;

  private queuedActions = new Map<string, {
    bump: boolean;
    set: boolean;
    spike: boolean;
    jump: boolean;
    /** 與這次擊球綁定的落點（避免被後續 hover 蓋掉） */
    aimX: number | null;
    aimZ: number | null;
  }>();

  constructor(participants: Participant[], localPlayerId: string | null = null) {
    this.localPlayerId = localPlayerId;
    const shuffled = shuffleIds(participants.map((participant) => participant.id));
    this.teamAIds = shuffled.slice(0, 2);
    this.teamBIds = shuffled.slice(2, 4);
    this.players = [
      ...this.teamAIds.map((id, index) => this.createPlayer(id, 'a', index)),
      ...this.teamBIds.map((id, index) => this.createPlayer(id, 'b', index)),
    ];
  }

  start(): void {
    this.phase = 'serve';
    this.scoreA = 0;
    this.scoreB = 0;
    this.servingTeam = Math.random() < 0.5 ? 'a' : 'b';
    this.winnerTeam = null;
    this.elapsedMs = 0;
    this.hitSerial = 0;
    this.lastHit = null;
    this.spikeBurstSerial = 0;
    this.spikeBurst = null;
    this.scoreFxSerial = 0;
    this.scoreFxKind = null;
    this.scoringTeam = null;
    this.resetForServe();
  }

  onPlayerInput(playerId: string, input: PlayerInput): void {
    if (this.phase === 'crownAward' || this.phase === 'finished' || this.phase === 'pointPause') {
      return;
    }

    const player = this.players.find((entry) => entry.id === playerId);

    if (!player) {
      return;
    }

    // 只有本機人類要依相機翻轉；CPU 給的已是世界座標，翻了會往角落跑
    const flipScreen = playerId === this.localPlayerId && player.teamId === 'b' ? -1 : 1;

    if (input.type === 'joystick') {
      player.steerX = input.x * flipScreen;
      player.steerZ = input.y * flipScreen;
      return;
    }

    if (input.type !== 'volleyball') {
      return;
    }

    player.steerX = input.x * flipScreen;
    player.steerZ = input.y * flipScreen;

    // hover 落點持續更新；真正出手時以 queued.aim 為準
    if (input.aimX != null && input.aimZ != null) {
      player.aimX = input.aimX;
      player.aimZ = input.aimZ;
    }

    const queued = this.queuedActions.get(playerId) ?? {
      bump: false,
      set: false,
      spike: false,
      jump: false,
      aimX: null,
      aimZ: null,
    };
    const hasHit = input.bump || input.set || input.spike;

    if (hasHit && input.aimX != null && input.aimZ != null) {
      queued.aimX = input.aimX;
      queued.aimZ = input.aimZ;
      player.aimX = input.aimX;
      player.aimZ = input.aimZ;
    }

    queued.bump = queued.bump || input.bump;
    queued.set = queued.set || input.set;
    queued.spike = queued.spike || input.spike;
    queued.jump = queued.jump || input.jump;
    this.queuedActions.set(playerId, queued);
  }

  getCpuInput(cpuId: string, _deltaMs: number): PlayerInput {
    const self = this.players.find((player) => player.id === cpuId);

    if (!self) {
      return {
        type: 'volleyball',
        x: 0,
        y: 0,
        jump: false,
        bump: false,
        set: false,
        spike: false,
      };
    }

    const assignment = this.resolveBallAssignment();
    const teammates = this.players
      .filter((player) => player.teamId === self.teamId)
      .map((player) => this.toCpuPlayer(player));

    return vbComputeCpuInput(
      this.toCpuPlayer(self),
      teammates,
      {
        x: this.ball.x,
        y: this.ball.y,
        z: this.ball.z,
        vx: this.ball.vx,
        vy: this.ball.vy,
        vz: this.ball.vz,
        active: this.ball.active || this.phase === 'serve',
      },
      {
        phase: this.phase,
        possessionTeam: this.possessionTeam,
        servingTeam: this.servingTeam,
        touchesUsed: this.touchesUsed,
        serveLockMs: this.serveLockMs,
        lastToucherId: this.lastToucherId,
        localPlayerId: this.localPlayerId,
        ballOwnerId: assignment.ownerId,
        predictedLand: assignment.land,
        landTimeSec: assignment.landTimeSec,
        opponentWillMiss: this.opponentMissOwnerId === cpuId,
        courtHalfWidth: COURT_HALF_WIDTH,
        courtHalfDepth: COURT_HALF_DEPTH,
        netThickness: NET_THICKNESS,
      },
      GRAVITY,
      VB_BALL_RADIUS,
    );
  }

  onTick(deltaMs: number): void {
    if (this.phase === 'finished') {
      return;
    }

    this.elapsedMs += deltaMs;
    const deltaSec = Math.min(0.05, deltaMs / 1000);

    if (this.phase === 'crownAward') {
      if (this.elapsedMs >= this.crownAwardStartedAt + CROWN_AWARD_MS) {
        this.phase = 'finished';
      }

      return;
    }

    if (this.phase === 'pointPause') {
      this.pointPauseMs += deltaMs;
      // 暫停期間仍模擬炸飛弧線
      this.tickBlastPhysics(deltaSec);

      if (this.pointPauseMs >= this.pointPauseDurationMs) {
        if (this.scoreA >= SCORE_TO_WIN || this.scoreB >= SCORE_TO_WIN) {
          this.beginCrownAward();
        } else {
          this.resetForServe();
          this.phase = 'serve';
          this.scoreFxKind = null;
          this.scoringTeam = null;
          this.spikeBurst = null;
        }
      }

      return;
    }

    if (this.serveLockMs > 0) {
      this.serveLockMs = Math.max(0, this.serveLockMs - deltaMs);
    }

    this.tickPlayers(deltaSec);
    this.resolveQueuedActions();

    if (this.ball.active) {
      // 球快落地且該半場是 CPU 負責 → 強制打過網（AI 摸空也不會卡死）
      this.tryCpuEmergencyReturn();
      this.tickBall(deltaSec);
    } else if (this.phase === 'serve') {
      this.holdServeBall();
    }
  }

  getRankings(): string[] {
    const winners = this.winnerTeam === 'a'
      ? this.teamAIds
      : this.winnerTeam === 'b'
        ? this.teamBIds
        : [];
    const losers = this.winnerTeam === 'a'
      ? this.teamBIds
      : this.winnerTeam === 'b'
        ? this.teamAIds
        : [...this.teamAIds, ...this.teamBIds];

    return [...winners, ...losers];
  }

  getCrownAwards(): Record<string, number> {
    const awards: Record<string, number> = {};

    for (const player of this.players) {
      awards[player.id] = 0;
    }

    if (!this.winnerTeam) {
      return awards;
    }

    const winners = this.winnerTeam === 'a' ? this.teamAIds : this.teamBIds;

    for (const id of winners) {
      awards[id] = 1;
    }

    return awards;
  }

  getRoundResults(): Record<string, 'win' | 'lose'> {
    const results: Record<string, 'win' | 'lose'> = {};

    for (const player of this.players) {
      results[player.id] = this.winnerTeam && player.teamId === this.winnerTeam ? 'win' : 'lose';
    }

    return results;
  }

  getScores(): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const player of this.players) {
      scores[player.id] = player.teamId === 'a' ? this.scoreA : this.scoreB;
    }

    return scores;
  }

  /**
   * 開發驗證：把球丟到指定半場快落地，確認 CPU 緊急回擊後球朝對面飛。
   * 正式遊戲不會呼叫。
   */
  devVerifyCpuReturn(landingTeam: VolleyballTeamId): {
    ok: boolean;
    vz: number;
    predictedLandZ: number;
    didHit: boolean;
  } {
    const side = teamSideSign(landingTeam);
    this.phase = 'rally';
    this.ball.active = true;
    this.ball.x = 0.4;
    this.ball.y = 0.7;
    this.ball.z = side * 3.2;
    this.ball.vx = 0;
    this.ball.vy = -2.5;
    this.ball.vz = 0;
    this.ball.prevZ = this.ball.z;
    this.possessionTeam = oppositeTeam(landingTeam);
    this.touchesUsed = 0;
    this.lastToucherId = this.localPlayerId;
    this.serveLockMs = 0;
    this.lastHit = null;
    const hitSerialBefore = this.hitSerial;

    for (const player of this.players) {
      if (player.teamId !== landingTeam || player.id === this.localPlayerId) {
        // 本機故意放到遠處：測的是「CPU 能否回擊」，不是留給玩家
        if (player.id === this.localPlayerId) {
          player.x = 0;
          player.y = 0;
          player.z = -side * 5;
        }

        continue;
      }

      player.x = this.ball.x + (player.role === 'back' ? -0.4 : 0.4);
      player.y = 0;
      player.z = this.ball.z - side * 0.3;
    }

    this.tryCpuEmergencyReturn();

    const didHit = this.hitSerial > hitSerialBefore;
    const landSec = this.predictLandTimeSec(this.ball.y, this.ball.vy);
    const predictedLandZ = this.ball.z + this.ball.vz * landSec;
    const fliesToOpponent = side < 0
      ? this.ball.vz > 0.8 && predictedLandZ > 0.5
      : this.ball.vz < -0.8 && predictedLandZ < -0.5;

    return {
      ok: didHit && fliesToOpponent,
      vz: this.ball.vz,
      predictedLandZ,
      didHit,
    };
  }

  getGameSnapshot(): VolleyballSnapshot {
    const local = this.players.find((player) => player.id === this.localPlayerId);
    const assignment = this.resolveBallAssignment();

    return {
      phase: this.phase,
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      teamAIds: [...this.teamAIds],
      teamBIds: [...this.teamBIds],
      servingTeam: this.servingTeam,
      ball: { x: this.ball.x, y: this.ball.y, z: this.ball.z },
      predictedLand: assignment.land,
      ballOwnerId: assignment.ownerId,
      hitTiming: this.computeHitTiming(assignment.landTimeSec),
      players: this.players.map((player) => ({
        id: player.id,
        teamId: player.teamId,
        x: player.x,
        y: player.y,
        z: player.z,
        vx: player.vx,
        vz: player.vz,
        facingZ: -teamSideSign(player.teamId),
        isJumping: player.jumpMsLeft > 0 || player.y > 0.05,
        isBlasted: player.blastMsLeft > 0,
        alive: true,
      })),
      localPlayerId: this.localPlayerId,
      localTeamId: local?.teamId ?? null,
      touchesLeft: Math.max(0, MAX_TOUCHES - this.touchesUsed),
      lastToucherId: this.lastToucherId,
      hitSerial: this.hitSerial,
      lastHit: this.lastHit,
      spikeBurstSerial: this.spikeBurstSerial,
      spikeBurst: this.spikeBurst,
      scoreFxSerial: this.scoreFxSerial,
      scoreFxKind: this.phase === 'pointPause' ? this.scoreFxKind : null,
      scoringTeam: this.phase === 'pointPause' ? this.scoringTeam : null,
      isCrownCeremony: this.phase === 'crownAward',
      crownWinnerIds: this.winnerTeam === 'a'
        ? [...this.teamAIds]
        : this.winnerTeam === 'b'
          ? [...this.teamBIds]
          : [],
      crownAwardDurationMs: CROWN_AWARD_MS,
    };
  }

  /**
   * 預期落點 + 誰該接：落點在哪隊半場，該隊裡離落點最近且可觸球者為 owner。
   */
  private resolveBallAssignment(): {
    land: { x: number; z: number } | null;
    ownerId: string | null;
    landTimeSec: number | null;
  } {
    const result = this.computeBallAssignment();
    this.syncOpponentMissPlan(result.ownerId, result.land, result.landTimeSec);
    return result;
  }

  private computeBallAssignment(): {
    land: { x: number; z: number } | null;
    ownerId: string | null;
    landTimeSec: number | null;
  } {
    if (
      this.phase === 'pointPause'
      || this.phase === 'crownAward'
      || this.phase === 'finished'
    ) {
      return { land: null, ownerId: null, landTimeSec: null };
    }

    if (this.phase === 'serve' || this.ball.active) {
      const raw = this.phase === 'serve' && !this.ball.active
        ? { x: this.ball.x, z: this.ball.z, timeSec: 0 }
        : vbPredictBallLand(
          {
            x: this.ball.x,
            y: this.ball.y,
            z: this.ball.z,
            vx: this.ball.vx,
            vy: this.ball.vy,
            vz: this.ball.vz,
            active: this.ball.active || this.phase === 'serve',
          },
          GRAVITY,
          VB_BALL_RADIUS,
        );

      const land = {
        x: clamp(raw.x, -COURT_HALF_WIDTH + 0.4, COURT_HALF_WIDTH - 0.4),
        z: clamp(raw.z, -COURT_HALF_DEPTH + 0.4, COURT_HALF_DEPTH - 0.4),
      };

      if (this.phase === 'serve') {
        const server = this.players.find((player) => {
          return player.teamId === this.servingTeam && this.teamSlotIndex(player) === 0;
        }) ?? this.players.find((player) => player.teamId === this.servingTeam);

        return { land, ownerId: server?.id ?? null, landTimeSec: raw.timeSec };
      }

      const landingTeam: VolleyballTeamId = land.z >= 0 ? 'b' : 'a';
      const eligible = this.players.filter((player) => {
        if (player.teamId !== landingTeam) {
          return false;
        }

        // 同隊剛摸過的人不能連觸
        if (
          this.possessionTeam === landingTeam
          && this.lastToucherId
          && player.id === this.lastToucherId
        ) {
          return false;
        }

        return true;
      });

      if (eligible.length === 0) {
        return { land, ownerId: null, landTimeSec: raw.timeSec };
      }

      eligible.sort((left, right) => {
        const distDiff = vbChaseDistance(left, this.ball, land)
          - vbChaseDistance(right, this.ball, land);

        if (Math.abs(distDiff) > 0.05) {
          return distDiff;
        }

        if (left.id === this.localPlayerId) {
          return -1;
        }

        if (right.id === this.localPlayerId) {
          return 1;
        }

        return 0;
      });

      return { land, ownerId: eligible[0]?.id ?? null, landTimeSec: raw.timeSec };
    }

    return { land: null, ownerId: null, landTimeSec: null };
  }

  /**
   * 落點圓環進度：球下降且距落地進入擊球窗時往 1 收攏。
   */
  private computeHitTiming(landTimeSec: number | null): number {
    if (
      this.phase !== 'rally'
      || !this.ball.active
      || landTimeSec == null
    ) {
      return 0;
    }

    // 還在上升：先別催
    if (this.ball.vy > 0.5) {
      return 0;
    }

    const t = landTimeSec;

    // 早一點出現，才看得出收攏
    if (t > 1.45) {
      return 0;
    }

    // 接近中：慢慢亮起
    if (t > 0.6) {
      return clamp((1.45 - t) / (1.45 - 0.6), 0, 1) * 0.65;
    }

    // 最佳窗（約 0.16～0.5 秒落地）
    if (t > 0.12) {
      const center = 0.32;
      const span = 0.28;
      const peak = 1 - Math.min(1, Math.abs(t - center) / span);
      return clamp(0.65 + peak * 0.35, 0, 1);
    }

    // 太貼地：收掉
    return clamp(t / 0.12, 0, 1) * 0.4;
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  dispose(): void {
    this.phase = 'finished';
    this.queuedActions.clear();
  }

  private createPlayer(id: string, teamId: VolleyballTeamId, slot: number): CourtPlayer {
    const role = vbCpuRoleForSlot(slot);
    const home = vbCpuHomeSpot(
      {
        id,
        teamId,
        role,
        x: 0,
        y: 0,
        z: 0,
      },
      {
        phase: 'serve',
        possessionTeam: teamId,
        servingTeam: teamId,
        touchesUsed: 0,
        serveLockMs: 0,
        lastToucherId: null,
        localPlayerId: this.localPlayerId,
        ballOwnerId: null,
        predictedLand: null,
        landTimeSec: null,
        opponentWillMiss: false,
        courtHalfWidth: COURT_HALF_WIDTH,
        courtHalfDepth: COURT_HALF_DEPTH,
        netThickness: NET_THICKNESS,
      },
    );

    return {
      id,
      teamId,
      role,
      x: home.x,
      y: 0,
      z: home.z,
      vx: 0,
      vz: 0,
      vy: 0,
      jumpMsLeft: 0,
      blastMsLeft: 0,
      steerX: 0,
      steerZ: 0,
      aimX: null,
      aimZ: null,
    };
  }

  private toCpuPlayer(player: CourtPlayer): VbCpuPlayer {
    return {
      id: player.id,
      teamId: player.teamId,
      role: player.role,
      x: player.x,
      y: player.y,
      z: player.z,
    };
  }

  private teamSlotIndex(player: CourtPlayer): number {
    const ids = player.teamId === 'a' ? this.teamAIds : this.teamBIds;
    return Math.max(0, ids.indexOf(player.id));
  }

  private resetForServe(): void {
    for (const player of this.players) {
      const home = vbCpuHomeSpot(this.toCpuPlayer(player), {
        phase: 'serve',
        possessionTeam: this.servingTeam,
        servingTeam: this.servingTeam,
        touchesUsed: 0,
        serveLockMs: 0,
        lastToucherId: null,
        localPlayerId: this.localPlayerId,
        ballOwnerId: null,
        predictedLand: null,
        landTimeSec: null,
        opponentWillMiss: false,
        courtHalfWidth: COURT_HALF_WIDTH,
        courtHalfDepth: COURT_HALF_DEPTH,
        netThickness: NET_THICKNESS,
      });
      // 發球方後排再往後一點
      const side = teamSideSign(player.teamId);
      const serveExtra = player.teamId === this.servingTeam && player.role === 'back' ? 0.7 : 0;
      player.x = home.x;
      player.z = home.z + side * serveExtra;
      player.y = 0;
      player.vx = 0;
      player.vz = 0;
      player.vy = 0;
      player.jumpMsLeft = 0;
      player.blastMsLeft = 0;
      player.steerX = 0;
      player.steerZ = 0;
      player.aimX = null;
      player.aimZ = null;
    }

    this.possessionTeam = this.servingTeam;
    this.touchesUsed = 0;
    this.lastToucherId = null;
    this.serveLockMs = 0;
    this.spikeBurst = null;
    this.ball.active = false;
    this.holdServeBall();
    this.queuedActions.clear();
  }

  private holdServeBall(): void {
    const server = this.players.find((player) => {
      if (player.teamId !== this.servingTeam) {
        return false;
      }

      return this.teamSlotIndex(player) === 0;
    }) ?? this.players.find((player) => player.teamId === this.servingTeam);

    if (!server) {
      return;
    }

    // 球放在身前（朝網），不要放背後
    const side = teamSideSign(server.teamId);
    this.ball.x = server.x;
    this.ball.y = SERVE_HEIGHT;
    this.ball.z = server.z - side * 0.65;
    this.ball.prevZ = this.ball.z;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
  }

  private tickPlayers(deltaSec: number): void {
    for (const player of this.players) {
      if (player.blastMsLeft > 0) {
        continue;
      }

      const side = teamSideSign(player.teamId);
      const mag = Math.hypot(player.steerX, player.steerZ);
      const scale = mag > 1 ? 1 / mag : 1;
      player.vx = player.steerX * scale * MOVE_SPEED;
      player.vz = player.steerZ * scale * MOVE_SPEED;
      player.x = clamp(
        player.x + player.vx * deltaSec,
        -COURT_HALF_WIDTH + VB_PLAYER_BODY_RADIUS,
        COURT_HALF_WIDTH - VB_PLAYER_BODY_RADIUS,
      );
      player.z = clamp(
        player.z + player.vz * deltaSec,
        side < 0 ? -COURT_HALF_DEPTH + VB_PLAYER_BODY_RADIUS : NET_THICKNESS + VB_PLAYER_BODY_RADIUS,
        side < 0 ? -NET_THICKNESS - VB_PLAYER_BODY_RADIUS : COURT_HALF_DEPTH - VB_PLAYER_BODY_RADIUS,
      );

      if (player.jumpMsLeft > 0 || player.y > 0 || player.vy !== 0) {
        player.vy -= GRAVITY * deltaSec;
        player.y += player.vy * deltaSec;
        player.jumpMsLeft = Math.max(0, player.jumpMsLeft - deltaSec * 1000);

        if (player.y <= 0) {
          player.y = 0;
          player.vy = 0;
          player.jumpMsLeft = 0;
        }
      }
    }

    this.separateTeammates();
  }

  /** 殺球爆炸後：對手被擊飛的物理（可短暫飛出半場） */
  private tickBlastPhysics(deltaSec: number): void {
    for (const player of this.players) {
      if (player.blastMsLeft <= 0) {
        continue;
      }

      player.blastMsLeft = Math.max(0, player.blastMsLeft - deltaSec * 1000);
      player.vx *= 0.985;
      player.vz *= 0.985;
      player.x = clamp(player.x + player.vx * deltaSec, -COURT_HALF_WIDTH - 1.2, COURT_HALF_WIDTH + 1.2);
      player.z = clamp(player.z + player.vz * deltaSec, -COURT_HALF_DEPTH - 1.2, COURT_HALF_DEPTH + 1.2);
      player.vy -= GRAVITY * deltaSec;
      player.y += player.vy * deltaSec;

      if (player.y <= 0) {
        player.y = 0;
        player.vy *= -0.25;
        player.vx *= 0.7;
        player.vz *= 0.7;

        if (Math.abs(player.vy) < 1.2) {
          player.vy = 0;
        }
      }
    }
  }

  private blastOpponents(scoringTeam: VolleyballTeamId, impactX: number, impactZ: number): void {
    const victims = this.players.filter((player) => player.teamId !== scoringTeam);

    for (const player of victims) {
      const dx = player.x - impactX;
      const dz = player.z - impactZ;
      const dist = Math.max(0.35, Math.hypot(dx, dz));
      const nx = dx / dist;
      const nz = dz / dist;
      // 越近炸越遠
      const force = clamp(11.5 / (0.55 + dist * 0.45), 5.5, 14);
      player.vx = nx * force;
      player.vz = nz * force;
      player.vy = 6.2 + Math.random() * 1.4;
      player.y = Math.max(player.y, 0.12);
      player.blastMsLeft = 1600;
      player.jumpMsLeft = 0;
      player.steerX = 0;
      player.steerZ = 0;
    }
  }

  /** 同隊硬分離，避免兩人重疊黏住 */
  private separateTeammates(): void {
    for (const teamId of ['a', 'b'] as const) {
      const pair = this.players.filter((player) => player.teamId === teamId);

      if (pair.length < 2) {
        continue;
      }

      const [left, right] = pair;
      const dx = right.x - left.x;
      const dz = right.z - left.z;
      const dist = Math.hypot(dx, dz);

      if (dist >= VB_TEAMMATE_SEPARATION || dist < 0.001) {
        continue;
      }

      const push = (VB_TEAMMATE_SEPARATION - dist) * 0.5;
      const nx = dx / dist;
      const nz = dz / dist;
      left.x -= nx * push;
      left.z -= nz * push;
      right.x += nx * push;
      right.z += nz * push;

      for (const player of pair) {
        const side = teamSideSign(player.teamId);
        player.x = clamp(
          player.x,
          -COURT_HALF_WIDTH + VB_PLAYER_BODY_RADIUS,
          COURT_HALF_WIDTH - VB_PLAYER_BODY_RADIUS,
        );
        player.z = clamp(
          player.z,
          side < 0 ? -COURT_HALF_DEPTH + VB_PLAYER_BODY_RADIUS : NET_THICKNESS + VB_PLAYER_BODY_RADIUS,
          side < 0 ? -NET_THICKNESS - VB_PLAYER_BODY_RADIUS : COURT_HALF_DEPTH - VB_PLAYER_BODY_RADIUS,
        );
      }
    }
  }

  private resolveQueuedActions(): void {
    for (const player of this.players) {
      const action = this.queuedActions.get(player.id);

      if (!action) {
        continue;
      }

      if (action.jump && player.y <= 0.02) {
        player.vy = JUMP_SPEED;
        player.jumpMsLeft = 660;
        player.y = 0.05;
      }

      const shotAim = action.aimX != null && action.aimZ != null
        ? { x: action.aimX, z: action.aimZ }
        : player.aimX != null && player.aimZ != null
          ? { x: player.aimX, z: player.aimZ }
          : null;

      if (action.spike) {
        this.tryHit(player, 'spike', shotAim);
      } else if (action.set) {
        this.tryHit(player, 'set', shotAim);
      } else if (action.bump) {
        this.tryHit(player, 'bump', shotAim);
      }

      this.queuedActions.set(player.id, {
        bump: false,
        set: false,
        spike: false,
        jump: false,
        aimX: null,
        aimZ: null,
      });
    }
  }

  private tryHit(
    player: CourtPlayer,
    kind: VolleyballHitKind,
    shotAim: { x: number; z: number } | null,
  ): void {
    if (this.phase !== 'serve' && this.phase !== 'rally') {
      return;
    }

    // 發球鎖只擋「發球方隊友」二次觸球；接發方隨時可摸
    if (
      this.phase === 'rally'
      && this.serveLockMs > 0
      && player.teamId === this.possessionTeam
      && player.id !== this.lastToucherId
    ) {
      return;
    }

    const isJumping = player.jumpMsLeft > 0 || player.y > 0.05 || player.vy > 0.1;
    const isCpu = player.id !== this.localPlayerId;
    const assignment = this.resolveBallAssignment();

    // CPU 只接「屬於自己」的球
    if (isCpu && assignment.ownerId && player.id !== assignment.ownerId) {
      return;
    }

    // 對手這次觸球已鎖定漏接：不打、也不吃緊急救球
    if (
      isCpu
      && this.isOpponentCpuPlayer(player)
      && this.opponentMissOwnerId === player.id
    ) {
      return;
    }

    // 隊友 CPU 放寬；對手略放（差一點也算），禁止隔空遠距摸
    const canHit = isCpu && this.phase === 'rally' && !this.isOpponentCpuPlayer(player)
      ? this.canCpuReachBall(player)
      : this.isOpponentCpuPlayer(player)
        ? this.canOpponentHitBall(player, kind, isJumping)
        : vbCanHitBall(player, this.ball, kind, { isJumping });

    if (!canHit) {
      return;
    }

    const side = teamSideSign(player.teamId);

    // 接發：球剛過網（略偏對面）也允許摸，避免 silent fail
    if (this.phase === 'rally' && this.ball.z * side < -0.4) {
      return;
    }

    if (this.lastToucherId === player.id && this.phase === 'rally') {
      return;
    }

    if (this.possessionTeam !== player.teamId && this.phase === 'rally') {
      this.possessionTeam = player.teamId;
      this.touchesUsed = 0;
    }

    if (this.touchesUsed >= MAX_TOUCHES && this.phase === 'rally') {
      this.endPoint(oppositeTeam(player.teamId), { kind: 'land' });
      return;
    }

    const wasServe = this.phase === 'serve';
    let resolvedKind: VolleyballHitKind = wasServe ? 'bump' : kind;
    const teammate = this.players.find(
      (entry) => entry.teamId === player.teamId && entry.id !== player.id,
    );

    // CPU：有隊友時第一觸舉；殺球必須有跳，否則改墊（避免站著「殺」卻判不到）
    if (isCpu && !wasServe) {
      if (teammate && this.touchesUsed < 1) {
        resolvedKind = 'set';
      } else if (kind === 'spike' && isJumping) {
        resolvedKind = 'spike';
      } else {
        resolvedKind = 'bump';
      }
    }

    if (shotAim) {
      player.aimX = shotAim.x;
      player.aimZ = shotAim.z;
    }

    this.commitHit(player, resolvedKind, wasServe);
  }

  /**
   * 球即將落在某半場、且該半場沒有本機玩家能救時：
   * 由最近的 CPU 強制打過網。這是最後保險，不依賴 AI hitbox。
   */
  private tryCpuEmergencyReturn(): void {
    if (this.phase !== 'rally' || !this.ball.active) {
      return;
    }

    // 只在「快落地」時介入，避免搶正常擊球
    if (this.ball.y > 0.85 || this.ball.vy >= 0) {
      return;
    }

    const assignment = this.resolveBallAssignment();

    if (!assignment.ownerId || !assignment.land) {
      return;
    }

    const owner = this.players.find((player) => player.id === assignment.ownerId);

    if (!owner) {
      return;
    }

    const landingTeam = owner.teamId;
    const side = teamSideSign(landingTeam);
    const local = this.players.find((player) => player.id === this.localPlayerId);
    const isOpponentOwner = Boolean(local && local.teamId !== owner.teamId);

    if (this.ball.z * side < 0.25) {
      return;
    }

    // 對手晚救：人已到球邊就該救（對打）；鎖定漏接才不救
    if (isOpponentOwner) {
      if (this.opponentMissOwnerId === owner.id) {
        return;
      }

      // 晚救也要真的貼球，不要隔空撥回去
      if (this.ball.y > 0.62 || !vbCanHitBall(owner, this.ball, 'bump')) {
        return;
      }

      // 人都到位了，八成救起來
      if (Math.random() < 0.2) {
        return;
      }
    }

    // 本機的球：本人還夠近就不搶；太遠才讓隊友 CPU 救
    if (owner.id === this.localPlayerId) {
      if (vbHorizontalDistance(owner, this.ball) < 4.0 || this.ball.y > 0.5) {
        return;
      }

      const saver = this.players
        .filter((player) => player.teamId === landingTeam && player.id !== this.localPlayerId)
        .sort(
          (left, right) => vbHorizontalDistance(left, this.ball) - vbHorizontalDistance(right, this.ball),
        )[0];

      if (!saver) {
        return;
      }

      // 隊友晚救也要進 hitbox，避免隔空打
      if (!vbCanHitBall(saver, this.ball, 'bump')) {
        return;
      }

      if (this.possessionTeam !== landingTeam) {
        this.possessionTeam = landingTeam;
        this.touchesUsed = 0;
      }

      if (this.touchesUsed >= MAX_TOUCHES) {
        return;
      }

      const hasTeammate = true;
      this.commitHit(saver, hasTeammate && this.touchesUsed < 1 ? 'set' : 'bump', false);
      return;
    }

    // CPU owner（含對手晚救）：進 hitbox／略放才緊急出手
    if (
      isOpponentOwner
        ? !this.canOpponentHitBall(owner, 'bump', false)
        : !vbCanHitBall(owner, this.ball, 'bump')
    ) {
      return;
    }

    if (this.possessionTeam !== landingTeam) {
      this.possessionTeam = landingTeam;
      this.touchesUsed = 0;
    }

    if (this.touchesUsed >= MAX_TOUCHES) {
      return;
    }

    const teammate = this.players.find(
      (entry) => entry.teamId === owner.teamId && entry.id !== owner.id,
    );
    this.commitHit(
      owner,
      teammate && this.touchesUsed < 1 ? 'set' : 'bump',
      false,
    );
  }

  private commitHit(
    player: CourtPlayer,
    kind: VolleyballHitKind,
    wasServe: boolean,
  ): void {
    this.applyHitVelocity(player, kind, wasServe);
    this.ball.active = true;
    this.lastToucherId = player.id;
    this.touchesUsed += 1;
    this.possessionTeam = player.teamId;
    this.hitSerial += 1;
    this.lastHit = { playerId: player.id, kind };

    if (wasServe) {
      this.phase = 'rally';
      this.serveLockMs = 450;
    }
  }

  /** 隊友 CPU 摸球略放（幫玩家），但仍要進一般 hitbox 附近 */
  private canCpuReachBall(player: CourtPlayer): boolean {
    const range = VB_HITBOX_BUMP + 0.08;
    const maxY = VB_HITBOX_Y_MAX_BUMP + 0.15;

    if (vbHorizontalDistance(player, this.ball) > range) {
      return false;
    }

    return this.ball.y >= VB_HITBOX_Y_MIN && this.ball.y <= maxY;
  }

  /** 對手摸球：跟玩家同一套，不准遠距揮空打中 */
  private canOpponentHitBall(
    player: CourtPlayer,
    kind: VolleyballHitKind,
    isJumping: boolean,
  ): boolean {
    return vbCanHitBall(player, this.ball, kind, { isJumping });
  }

  /**
   * 對手漏接：同一觸球只骰一次。
   * 不可用「剛被指派時離落點很遠」當難球——人還在跑就被鎖死不接，會 5:0。
   * 只在落地前極短窗、且仍離落點很遠才算難挖。
   */
  private syncOpponentMissPlan(
    ownerId: string | null,
    land: { x: number; z: number } | null,
    landTimeSec: number | null,
  ): void {
    const local = this.players.find((player) => player.id === this.localPlayerId);
    const owner = ownerId
      ? this.players.find((player) => player.id === ownerId)
      : undefined;
    const isOpponentOwner = Boolean(
      local
      && owner
      && owner.teamId !== local.teamId
      && this.phase === 'rally',
    );
    const planKey = isOpponentOwner && owner
      ? `${owner.id}:${this.hitSerial}`
      : null;

    if (planKey === this.opponentMissPlanKey) {
      return;
    }

    this.opponentMissPlanKey = planKey;

    if (!planKey || !owner) {
      this.opponentMissOwnerId = null;
      return;
    }

    // 預設幾乎不鎖死；真正來不及才偶發漏
    const distToLand = land
      ? Math.hypot(owner.x - land.x, owner.z - land.z)
      : 0;
    const isLateAndFar = landTimeSec != null
      && landTimeSec < 0.28
      && distToLand > 2.4;
    const missRate = isLateAndFar ? 0.35 : 0.04;

    this.opponentMissOwnerId = Math.random() < missRate ? owner.id : null;
  }

  /** 對面半場落點（硬性在對方場內、離邊線遠一點防出界） */
  private opponentLandZ(side: number, depth: number): number {
    const magnitude = clamp(depth, 2.8, COURT_HALF_DEPTH - 2.2);
    return -side * magnitude;
  }

  /**
   * 無瞄準過網球落點。
   * easy：對手 CPU 用——常打向有人的位置／中場，比較好接。
   */
  private pickOpenOpponentLandSpot(
    side: number,
    kind: 'bump' | 'spike' | 'serve',
    defenders: Array<{ x: number; z: number }>,
    easy = false,
  ): { x: number; z: number } {
    // 離邊線遠一點，快殺才不會算出界
    const xLimit = COURT_HALF_WIDTH - 1.9;

    // 放水：多半往防守者附近或中場砸
    if (easy) {
      if (defenders.length > 0 && Math.random() < 0.7) {
        const target = defenders[Math.floor(Math.random() * defenders.length)]!;
        const depth = 3.0 + Math.random() * 1.4;

        return {
          x: clamp(target.x + (Math.random() - 0.5) * 1.4, -xLimit, xLimit),
          z: this.opponentLandZ(side, depth),
        };
      }

      return {
        x: clamp((Math.random() - 0.5) * 2.2, -xLimit, xLimit),
        z: this.opponentLandZ(side, 3.2 + Math.random() * 1.1),
      };
    }

    const xs = [-xLimit, -xLimit * 0.55, -xLimit * 0.2, xLimit * 0.2, xLimit * 0.55, xLimit];
    const depths = kind === 'spike'
      ? [3.0, 3.8, 4.6, 5.4]
      : kind === 'serve'
        ? [3.2, 4.0, 5.0, 5.8]
        : [3.0, 3.8, 4.8, 5.6, 6.2];

    type Candidate = { x: number; z: number; score: number };
    const candidates: Candidate[] = [];

    for (const x of xs) {
      for (const depth of depths) {
        const z = this.opponentLandZ(side, depth);
        let score = 8;

        if (defenders.length > 0) {
          score = Math.min(
            ...defenders.map((defender) => Math.hypot(defender.x - x, defender.z - z)),
          );
        }

        // 邊角略加分，鼓勵拉開
        score += Math.abs(x) / xLimit * 0.35;
        candidates.push({ x, z, score });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const top = candidates.slice(0, Math.min(4, candidates.length));
    const pick = top[Math.floor(Math.random() * top.length)] ?? {
      x: 0,
      z: this.opponentLandZ(side, 4),
      score: 0,
    };

    return {
      x: clamp(pick.x + (Math.random() - 0.5) * 0.7, -xLimit, xLimit),
      z: pick.z,
    };
  }

  private isOpponentCpuPlayer(player: CourtPlayer): boolean {
    const local = this.players.find((entry) => entry.id === this.localPlayerId);
    return Boolean(local && local.teamId !== player.teamId && player.id !== this.localPlayerId);
  }

  /** 把滑鼠落點夾到對面半場可用區（離邊線遠一點，防快殺出界） */
  private clampOpponentAim(
    side: number,
    aimX: number,
    aimZ: number,
  ): { x: number; z: number } {
    const minClear = NET_THICKNESS + 2.2;
    const edgeX = COURT_HALF_WIDTH - 1.85;
    const edgeZ = COURT_HALF_DEPTH - 2.1;

    return {
      x: clamp(aimX, -edgeX, edgeX),
      z: side < 0
        ? clamp(aimZ, minClear, edgeZ)
        : clamp(aimZ, -edgeZ, -minClear),
    };
  }

  /** 把滑鼠落點夾到己方半場（舉球用） */
  private clampOwnAim(
    side: number,
    aimX: number,
    aimZ: number,
  ): { x: number; z: number } {
    return {
      x: clamp(aimX, -COURT_HALF_WIDTH + 0.9, COURT_HALF_WIDTH - 0.9),
      z: clamp(
        aimZ,
        side < 0 ? -COURT_HALF_DEPTH + 1.2 : NET_THICKNESS + 1.2,
        side < 0 ? -NET_THICKNESS - 1.2 : COURT_HALF_DEPTH - 1.2,
      ),
    };
  }

  /** 依目前 y／vy 算出實際落地秒數（水平速度要用這個，才會對準落點） */
  private predictLandTimeSec(startY: number, launchVy: number): number {
    const disc = launchVy * launchVy - 2 * GRAVITY * (VB_BALL_RADIUS - startY);

    if (disc <= 0 || GRAVITY <= 0) {
      return 0.7;
    }

    return Math.max(0.35, (launchVy + Math.sqrt(disc)) / GRAVITY);
  }

  /**
   * 過網球（硬保證）：
   * 1. 起點一定在己方
   * 2. 落點一定在對方場內
   * 3. 過網高度必須高過懸空網（維持拋物線，不穿網）
   * 4. 若預測落地仍在己方 → 強制改 vz
   */
  private launchOverNet(
    side: number,
    targetX: number,
    landDepth: number,
    flightSec: number,
    loft: number,
    targetZOverride?: number,
    options?: { fast?: boolean },
  ): void {
    const fast = Boolean(options?.fast);
    const ownClear = NET_THICKNESS + 1.25;
    const oppClear = NET_THICKNESS + 2.5;
    // 殺球：過網淨空略緊、飛行更短，才砸得快
    const clearY = fast ? NET_TOP_Y + 0.12 : NET_CLEAR_Y;
    const minLandSec = fast ? 0.36 : 0.55;
    const edgePad = fast ? 2.0 : 1.35;

    // 起點：己方、至少離網 ownClear
    const startZ = side < 0
      ? Math.min(this.ball.z, -ownClear)
      : Math.max(this.ball.z, ownClear);
    this.ball.z = startZ;
    this.ball.prevZ = startZ;

    const startY = Math.max(this.ball.y, HIT_LIFT_Y);
    this.ball.y = startY;
    this.ball.x = clamp(this.ball.x, -COURT_HALF_WIDTH + 0.5, COURT_HALF_WIDTH - 0.5);

    const duration = clamp(flightSec, fast ? 0.36 : 0.55, fast ? 0.72 : 1.6);
    this.ball.vy = (VB_BALL_RADIUS - startY) / duration + 0.5 * GRAVITY * duration + Math.max(0, loft);

    let targetZ = targetZOverride ?? this.opponentLandZ(side, landDepth);

    // 落點：對方場內、至少離網 oppClear；快殺再離邊線遠一點
    if (side < 0) {
      targetZ = clamp(Math.max(targetZ, oppClear), oppClear, COURT_HALF_DEPTH - edgePad);
    } else {
      targetZ = clamp(Math.min(targetZ, -oppClear), -COURT_HALF_DEPTH + edgePad, -oppClear);
    }

    const targetXClamped = clamp(
      targetX,
      -COURT_HALF_WIDTH + edgePad,
      COURT_HALF_WIDTH - edgePad,
    );

    // 先對準落點，再抬高 vy 直到過網淨空夠（水平速度跟著重算，弧線仍對準）
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const landSec = Math.max(minLandSec, this.predictLandTimeSec(startY, this.ball.vy));
      this.ball.vx = (targetXClamped - this.ball.x) / landSec;
      this.ball.vz = (targetZ - startZ) / landSec;

      // 快殺水平速度上限，避免數值誤差把球甩出界
      if (fast) {
        const horizontal = Math.hypot(this.ball.vx, this.ball.vz);
        const maxHorizontal = 16.5;

        if (horizontal > maxHorizontal) {
          const scale = maxHorizontal / horizontal;
          this.ball.vx *= scale;
          this.ball.vz *= scale;
        }
      }

      const crossesToOpponent = side < 0
        ? this.ball.vz > 0.8 && startZ + this.ball.vz * landSec >= oppClear
        : this.ball.vz < -0.8 && startZ + this.ball.vz * landSec <= -oppClear;

      if (!crossesToOpponent) {
        const forcedZ = side < 0 ? oppClear + 0.8 : -(oppClear + 0.8);
        this.ball.vz = (forcedZ - startZ) / landSec;
        this.ball.vx = (targetXClamped - this.ball.x) / landSec;
      }

      const tNet = -startZ / this.ball.vz;
      if (tNet <= 0.05 || tNet >= landSec) {
        break;
      }

      const yAtNet = startY + this.ball.vy * tNet - 0.5 * GRAVITY * tNet * tNet;
      if (yAtNet >= clearY) {
        break;
      }

      // 殺球少加 loft，避免又被抬成高拋好接
      this.ball.vy += fast ? 0.35 : 0.65;
    }
  }

  private applyHitVelocity(
    player: CourtPlayer,
    kind: VolleyballHitKind,
    isServe: boolean,
  ): void {
    const side = teamSideSign(player.teamId);
    const teammate = this.players.find(
      (entry) => entry.teamId === player.teamId && entry.id !== player.id,
    );
    const hasAim = player.aimX != null && player.aimZ != null;

    if (kind === 'set' && !isServe) {
      let targetX = player.x;
      let targetZ = player.z - side * 0.4;

      if (hasAim) {
        // 滑鼠點己方落點：舉到該處（通常點在隊友附近）
        const aimed = this.clampOwnAim(side, player.aimX!, player.aimZ!);
        targetX = aimed.x;
        targetZ = aimed.z;
      } else if (teammate) {
        // 舉給隊友：落在隊友身前偏網一點，方便殺球
        targetX = clamp(
          teammate.x,
          -COURT_HALF_WIDTH + 1.2,
          COURT_HALF_WIDTH - 1.2,
        );
        targetZ = clamp(
          teammate.z - side * 0.55,
          side < 0 ? -COURT_HALF_DEPTH + 1.5 : NET_THICKNESS + 1.5,
          side < 0 ? -NET_THICKNESS - 1.5 : COURT_HALF_DEPTH - 1.5,
        );
      }

      targetX = clamp(targetX, -COURT_HALF_WIDTH + 1.0, COURT_HALF_WIDTH - 1.0);
      targetZ = clamp(
        targetZ,
        side < 0 ? -COURT_HALF_DEPTH + 1.4 : NET_THICKNESS + 1.4,
        side < 0 ? -NET_THICKNESS - 1.4 : COURT_HALF_DEPTH - 1.4,
      );

      const startY = Math.max(this.ball.y, HIT_LIFT_Y);
      this.ball.y = startY;
      this.ball.prevZ = this.ball.z;
      // 舉高一點方便殺球，但別高到摸不到
      const duration = hasAim ? 1.1 : 1.15;
      this.ball.vy = (VB_BALL_RADIUS - startY) / duration + 0.5 * GRAVITY * duration + (hasAim ? 0.6 : 1.15);
      const landSec = this.predictLandTimeSec(startY, this.ball.vy);
      this.ball.vx = (targetX - this.ball.x) / landSec;
      this.ball.vz = (targetZ - this.ball.z) / landSec;
      player.aimX = null;
      player.aimZ = null;
      return;
    }

    const defenders = this.players
      .filter((entry) => entry.teamId !== player.teamId)
      .map((entry) => ({ x: entry.x, z: entry.z }));
    const easyAim = this.isOpponentCpuPlayer(player);

    if (kind === 'spike' && !isServe) {
      // 跳躍殺球：接觸點抬高，短平快過網再砸地（別掛太久好接）
      if (player.y > 0.12) {
        this.ball.y = Math.max(this.ball.y, Math.min(player.y + 1.1, 3.35));
      }

      const spikeOpts = { fast: true } as const;

      if (hasAim) {
        const aimed = this.clampOpponentAim(side, player.aimX!, player.aimZ!);
        this.launchOverNet(
          side,
          aimed.x,
          Math.abs(aimed.z),
          0.42,
          0.55,
          aimed.z,
          spikeOpts,
        );
      } else {
        const spot = this.pickOpenOpponentLandSpot(side, 'spike', defenders, easyAim);
        this.launchOverNet(
          side,
          spot.x,
          Math.abs(spot.z),
          0.38 + Math.random() * 0.1,
          0.4 + Math.random() * 0.45,
          spot.z,
          spikeOpts,
        );
      }

      player.aimX = null;
      player.aimZ = null;
      return;
    }

    // 擊球／發球：拉長飛行時間，弧線掛過網再落地
    if (hasAim && !isServe) {
      const aimed = this.clampOpponentAim(side, player.aimX!, player.aimZ!);
      this.launchOverNet(side, aimed.x, Math.abs(aimed.z), 1.15, 1.85, aimed.z);
    } else if (hasAim && isServe) {
      const aimed = this.clampOpponentAim(side, player.aimX!, player.aimZ!);
      this.launchOverNet(side, aimed.x, Math.abs(aimed.z), 1.3, 2.35, aimed.z);
    } else {
      const spot = this.pickOpenOpponentLandSpot(
        side,
        isServe ? 'serve' : 'bump',
        defenders,
        easyAim,
      );
      const flight = isServe ? 1.25 + Math.random() * 0.25 : 1.05 + Math.random() * 0.28;
      const loft = isServe ? 2.4 + Math.random() * 0.7 : 1.9 + Math.random() * 0.85;
      this.launchOverNet(side, spot.x, Math.abs(spot.z), flight, loft, spot.z);
    }

    player.aimX = null;
    player.aimZ = null;
  }

  private tickBall(deltaSec: number): void {
    this.ball.prevZ = this.ball.z;
    this.ball.vy -= GRAVITY * deltaSec;
    this.ball.x += this.ball.vx * deltaSec;
    this.ball.y += this.ball.vy * deltaSec;
    this.ball.z += this.ball.vz * deltaSec;

    // 撞到網面（上下緣之間）才彈；高於網上／低於網底透空區可過
    const crossedNet = (this.ball.prevZ < 0 && this.ball.z >= 0)
      || (this.ball.prevZ > 0 && this.ball.z <= 0);
    if (
      crossedNet
      && this.ball.y < NET_TOP_Y
      && this.ball.y + VB_BALL_RADIUS > NET_BOTTOM_Y
      && Math.abs(this.ball.x) <= COURT_HALF_WIDTH + 0.4
    ) {
      const fromSign = Math.sign(this.ball.prevZ) || 1;
      this.ball.z = fromSign * (NET_THICKNESS + 0.14);
      this.ball.vz = fromSign * Math.abs(this.ball.vz) * 0.5;
      this.ball.vy = Math.max(this.ball.vy + 2.8, 4.2);
      this.ball.vx *= 0.72;
    }

    if (this.ball.y > VB_BALL_RADIUS) {
      return;
    }

    this.ball.y = VB_BALL_RADIUS;
    const outX = Math.abs(this.ball.x) > COURT_HALF_WIDTH;
    const outZ = Math.abs(this.ball.z) > COURT_HALF_DEPTH;

    if (outX || outZ) {
      // 出界：最後觸球方的對手得分（打出界不能給自己加分）
      const last = this.players.find((player) => player.id === this.lastToucherId);
      const scorer: VolleyballTeamId = last
        ? oppositeTeam(last.teamId)
        : this.ball.z >= 0 ? 'b' : 'a';
      this.endPoint(scorer, { kind: 'out' });
      return;
    }

    const scorer: VolleyballTeamId = this.ball.z >= 0 ? 'a' : 'b';
    const isSpikeKill = this.lastHit?.kind === 'spike';
    this.endPoint(scorer, {
      kind: isSpikeKill ? 'spike-kill' : 'land',
      impactX: this.ball.x,
      impactZ: this.ball.z,
    });
  }

  private endPoint(
    scoringTeam: VolleyballTeamId,
    detail: {
      kind: 'out' | 'land' | 'spike-kill';
      impactX?: number;
      impactZ?: number;
    },
  ): void {
    if (this.phase === 'pointPause' || this.phase === 'crownAward' || this.phase === 'finished') {
      return;
    }

    if (scoringTeam === 'a') {
      this.scoreA += 1;
    } else {
      this.scoreB += 1;
    }

    this.servingTeam = scoringTeam;
    this.ball.active = false;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.serveLockMs = 0;
    this.phase = 'pointPause';
    this.pointPauseMs = 0;
    this.scoreFxSerial += 1;
    this.scoringTeam = scoringTeam;
    this.opponentMissPlanKey = null;
    this.opponentMissOwnerId = null;

    if (detail.kind === 'spike-kill' && detail.impactX !== undefined && detail.impactZ !== undefined) {
      // 殺球落地：球留在爆點，炸飛對面，加長暫停看特效
      this.ball.x = detail.impactX;
      this.ball.y = VB_BALL_RADIUS + 0.02;
      this.ball.z = detail.impactZ;
      this.ball.prevZ = detail.impactZ;
      this.spikeBurst = { x: detail.impactX, z: detail.impactZ };
      this.spikeBurstSerial += 1;
      this.blastOpponents(scoringTeam, detail.impactX, detail.impactZ);
      this.pointPauseDurationMs = SPIKE_KILL_PAUSE_MS;
      this.scoreFxKind = 'spike-kill';
      return;
    }

    // 一般得分：球抬到場中央
    this.ball.x = 0;
    this.ball.y = 2.2;
    this.ball.z = 0;
    this.ball.prevZ = 0;
    this.spikeBurst = null;
    this.pointPauseDurationMs = POINT_PAUSE_MS;
    this.scoreFxKind = 'normal';
  }

  private beginCrownAward(): void {
    this.winnerTeam = this.scoreA >= SCORE_TO_WIN ? 'a' : 'b';
    this.phase = 'crownAward';
    this.crownAwardStartedAt = this.elapsedMs;
    this.scoringTeam = null;
  }
}
