import {
  awardsForWinningTeam,
  splitIntoTwoTeams,
  type PartyTeamId,
} from '@/common/party/team-split';
import type { MiniGameCreateOptions, MiniGameInstance } from '@/minigames/types';
import {
  BB_COURT_HALF_DEPTH,
  BB_COURT_HALF_WIDTH,
  BB_GRAVITY_PLAYER,
  BB_JUMP_SPEED,
  BB_LIVES,
  BB_MOVE_SPEED,
  BB_NET_THICKNESS,
  BB_PLAYER_RADIUS,
  BB_TEAMMATE_SEPARATION,
  BOMB_BLAST_RADIUS,
  BOMB_COOLDOWN_MS,
  BOMB_FLIGHT_SEC_MAX,
  BOMB_FLIGHT_SEC_MIN,
  BOMB_GRAVITY,
  BOMB_LOFT,
  BOMB_MAX_IN_FLIGHT,
  BOMB_MID_CLEAR_Y,
  BOMB_RADIUS,
  BOMB_SPAWN_HEIGHT,
  BOMB_THROW_SPEED_SCALE,
  COUNTDOWN_MS,
  CPU_AIM_JITTER,
  CPU_AIM_JITTER_HUMAN,
  CPU_AIM_LEAD_SEC_MAX,
  CPU_AIM_LEAD_SEC_MIN,
  CPU_AIM_SPREAD_MAX,
  CPU_AIM_SPREAD_MIN,
  CPU_ARRIVE_DIST,
  CPU_DODGE_BOMB_MAX_Y,
  CPU_DODGE_CHANCE,
  CPU_DODGE_DIST_MAX,
  CPU_DODGE_DIST_MIN,
  CPU_DODGE_RADIUS_PAD,
  CPU_EMERGENCY_DODGE_Y,
  CPU_HOLD_MS_MAX,
  CPU_HOLD_MS_MIN,
  CPU_IDLE_CHANCE,
  CPU_LAND_SEPARATION,
  CPU_REACT_MS_MAX,
  CPU_REACT_MS_MIN,
  CPU_STICK_MAX,
  CPU_THROW_CHANCE,
  CPU_WHIFF_CHANCE,
  CROWN_AWARD_MS,
  INVULN_MS,
  PLAYER_COLOR_HEX,
  RESPAWN_MS,
  TEAM_REVEAL_GO_MS,
  TEAM_REVEAL_MS,
} from '@/minigames/bouncy-bomb/bouncy-bomb-tuning';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

export type BouncyBombPhase =
  | 'teamReveal'
  | 'countdown'
  | 'playing'
  | 'crownAward'
  | 'finished';

export type BouncyBombTeamId = PartyTeamId;

export interface BouncyBombPlayerSnapshot {
  id: string;
  teamId: BouncyBombTeamId;
  slot: number;
  x: number;
  y: number;
  z: number;
  facingY: number;
  /** 依搖桿意圖，不當位移（避免被推開時誤播跑步） */
  isMoving: boolean;
  lives: number;
  alive: boolean;
  /** 重生倒數中（不可動、不可被炸） */
  isRespawning: boolean;
  respawnMsLeft: number;
  /** 預計重生點（倒數期間預覽） */
  respawnX: number | null;
  respawnZ: number | null;
  /** 丟彈冷卻剩餘 */
  cooldownMs: number;
  /** 場上自己的飛行彈數 */
  bombsInFlight: number;
  /** 白閃無敵 */
  invulnerable: boolean;
  isFlashing: boolean;
  color: string;
}

export interface BouncyBombBombSnapshot {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  landX: number;
  landZ: number;
  color: string;
  colorHex: string;
}

export interface BouncyBombAimPreview {
  x: number;
  z: number;
  radius: number;
  colorHex: string;
}

export interface BouncyBombBlastHit {
  victimId: string;
  eliminated: boolean;
}

export interface BouncyBombBlastEvent {
  x: number;
  z: number;
  colorHex: string;
  attackerId: string;
  hits: BouncyBombBlastHit[];
}

export interface BouncyBombSnapshot {
  phase: BouncyBombPhase;
  teamAIds: string[];
  teamBIds: string[];
  localTeamId: BouncyBombTeamId | null;
  localPlayerId: string | null;
  players: BouncyBombPlayerSnapshot[];
  bombs: BouncyBombBombSnapshot[];
  aimPreview: BouncyBombAimPreview | null;
  teamRevealMsLeft: number;
  teamRevealProgress: number;
  showTeamRevealGo: boolean;
  countdownMsLeft: number;
  localRespawnActive: boolean;
  localRespawnMsLeft: number;
  localCooldownMs: number;
  localBombsInFlight: number;
  localBombsMax: number;
  isCrownCeremony: boolean;
  crownWinnerIds: string[];
  blastSerial: number;
  blast: BouncyBombBlastEvent | null;
  throwSerial: number;
  hitSerial: number;
}

interface CourtPlayer {
  id: string;
  teamId: BouncyBombTeamId;
  slot: number;
  color: string;
  x: number;
  y: number;
  z: number;
  vy: number;
  facingY: number;
  lives: number;
  alive: boolean;
  isRespawning: boolean;
  respawnMsLeft: number;
  respawnX: number | null;
  respawnZ: number | null;
  invulnerableUntilMs: number;
  cooldownMs: number;
  aimX: number | null;
  aimZ: number | null;
  moveX: number;
  moveZ: number;
  jumpQueued: boolean;
  throwQueued: boolean;
  /** CPU 意圖目標（世界座標）；輸出仍走跟人相同的 stick → move */
  cpuTargetX: number;
  cpuTargetZ: number;
  cpuRetargetMs: number;
  /** 類人搖桿：鎖定八向後按住，不每幀重算 */
  cpuStickX: number;
  cpuStickZ: number;
  /** 對某顆炸彈的反應窗 */
  cpuThreatBombId: string | null;
  cpuReactMs: number;
  cpuWillDodge: boolean;
}

interface FlyingBomb {
  id: string;
  ownerId: string;
  teamId: BouncyBombTeamId;
  color: string;
  colorHex: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  landX: number;
  landZ: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 量化成鍵盤八向，避免每幀微調造成晃動 */
function quantizeStick8(dx: number, dz: number): { x: number; z: number } {
  const len = Math.hypot(dx, dz);

  if (len < 0.01) {
    return { x: 0, z: 0 };
  }

  const angle = Math.atan2(dx, dz);
  const sector = Math.PI / 4;
  const snapped = Math.round(angle / sector) * sector;

  return {
    x: Math.sin(snapped),
    z: Math.cos(snapped),
  };
}

function teamSideSign(teamId: BouncyBombTeamId): number {
  return teamId === 'a' ? -1 : 1;
}

function opponentTeam(teamId: BouncyBombTeamId): BouncyBombTeamId {
  return teamId === 'a' ? 'b' : 'a';
}

function halfZBounds(teamId: BouncyBombTeamId): { minZ: number; maxZ: number } {
  const pad = BB_PLAYER_RADIUS;
  const mid = BB_NET_THICKNESS + pad;

  if (teamId === 'a') {
    return { minZ: -BB_COURT_HALF_DEPTH + pad, maxZ: -mid };
  }

  return { minZ: mid, maxZ: BB_COURT_HALF_DEPTH - pad };
}

function spawnCenter(teamId: BouncyBombTeamId): { x: number; z: number } {
  const bounds = halfZBounds(teamId);
  return {
    x: 0,
    z: (bounds.minZ + bounds.maxZ) * 0.5,
  };
}

/** 重生：己方後場隨機點（離中線遠），並盡量避開隊友 */
function pickRespawnSpot(
  teamId: BouncyBombTeamId,
  players: CourtPlayer[],
  selfId: string,
): { x: number; z: number } {
  const bounds = halfZBounds(teamId);
  const depth = bounds.maxZ - bounds.minZ;
  // 後場約 45%（紅隊靠 -Z、藍隊靠 +Z）
  const backMinZ = teamId === 'a' ? bounds.minZ : bounds.maxZ - depth * 0.45;
  const backMaxZ = teamId === 'a' ? bounds.minZ + depth * 0.45 : bounds.maxZ;
  const teammate = players.find(
    (player) => player.teamId === teamId && player.id !== selfId && player.alive,
  );

  let best = { x: 0, z: (backMinZ + backMaxZ) * 0.5 };
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = clampToHalf(
      teamId,
      (Math.random() * 2 - 1) * (BB_COURT_HALF_WIDTH - 1.2),
      backMinZ + Math.random() * (backMaxZ - backMinZ),
    );
    const mateDist = teammate
      ? Math.hypot(candidate.x - teammate.x, candidate.z - teammate.z)
      : 8;
    // 偏愛離隊友遠、離中線遠
    const midDist = Math.abs(candidate.z);
    const score = mateDist * 1.4 + midDist;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function clampToHalf(
  teamId: BouncyBombTeamId,
  x: number,
  z: number,
): { x: number; z: number } {
  const bounds = halfZBounds(teamId);
  return {
    x: clamp(x, -BB_COURT_HALF_WIDTH + BB_PLAYER_RADIUS, BB_COURT_HALF_WIDTH - BB_PLAYER_RADIUS),
    z: clamp(z, bounds.minZ, bounds.maxZ),
  };
}

function clampEnemyLand(
  throwerTeam: BouncyBombTeamId,
  x: number,
  z: number,
): { x: number; z: number } {
  const enemy = opponentTeam(throwerTeam);
  const bounds = halfZBounds(enemy);
  const edge = 0.35;

  return {
    x: clamp(x, -BB_COURT_HALF_WIDTH + edge, BB_COURT_HALF_WIDTH - edge),
    z: clamp(z, bounds.minZ + edge * 0.5, bounds.maxZ - edge * 0.5),
  };
}

function nowMs(): number {
  return performance.now();
}

export class BouncyBombGame implements MiniGameInstance {
  private readonly localPlayerId: string | null;

  /** 人類才做 B 隊相機翻轉；CPU stick 已是世界座標 */
  private readonly humanPlayerIds: Set<string>;

  private readonly skipOpening: boolean;

  private readonly teamAIds: string[];

  private readonly teamBIds: string[];

  private readonly players: CourtPlayer[];

  private readonly colorById: Map<string, string>;

  private bombs: FlyingBomb[] = [];

  private bombSeq = 0;

  private phase: BouncyBombPhase = 'teamReveal';

  private elapsedMs = 0;

  private phaseStartedAt = 0;

  private winnerTeam: BouncyBombTeamId | null = null;

  private blastSerial = 0;

  private blast: BouncyBombBlastEvent | null = null;

  private throwSerial = 0;

  private hitSerial = 0;

  constructor(
    participants: Participant[],
    localPlayerId: string | null = null,
    options: MiniGameCreateOptions = {},
  ) {
    this.localPlayerId = localPlayerId;
    this.skipOpening = Boolean(options.skipOpeningCountdown);
    this.humanPlayerIds = new Set(
      participants
        .filter((participant) => participant.kind === 'human')
        .map((participant) => participant.id),
    );
    this.colorById = new Map(
      participants.map((participant) => [participant.id, participant.color]),
    );
    const teams = splitIntoTwoTeams(participants.map((participant) => participant.id));
    this.teamAIds = teams.teamAIds;
    this.teamBIds = teams.teamBIds;
    this.players = [
      ...this.teamAIds.map((id, index) => this.createPlayer(id, 'a', index)),
      ...this.teamBIds.map((id, index) => this.createPlayer(id, 'b', index)),
    ];
  }

  start(): void {
    this.phase = this.skipOpening ? 'playing' : 'teamReveal';
    this.elapsedMs = 0;
    this.phaseStartedAt = 0;
    this.winnerTeam = null;
    this.bombs = [];
    this.blast = null;
    this.blastSerial = 0;
    this.throwSerial = 0;
    this.hitSerial = 0;

    for (const player of this.players) {
      const spawn = spawnCenter(player.teamId);
      const slotOffset = player.slot === 0 ? -1.4 : 1.4;
      player.x = spawn.x + slotOffset;
      player.z = spawn.z;
      player.y = 0;
      player.vy = 0;
      player.lives = BB_LIVES;
      player.alive = true;
      player.isRespawning = false;
      player.respawnMsLeft = 0;
      player.respawnX = null;
      player.respawnZ = null;
      player.invulnerableUntilMs = 0;
      player.cooldownMs = 0;
      player.aimX = null;
      player.aimZ = null;
      player.moveX = 0;
      player.moveZ = 0;
      player.jumpQueued = false;
      player.throwQueued = false;
      player.facingY = teamSideSign(player.teamId) > 0 ? Math.PI : 0;
      player.cpuTargetX = player.x;
      player.cpuTargetZ = player.z;
      player.cpuRetargetMs = 0;
      player.cpuStickX = 0;
      player.cpuStickZ = 0;
      player.cpuThreatBombId = null;
      player.cpuReactMs = 0;
      player.cpuWillDodge = false;
    }
  }

  onPlayerInput(playerId: string, input: PlayerInput): void {
    if (input.type !== 'bouncy-bomb') {
      return;
    }

    if (
      this.phase === 'teamReveal'
      || this.phase === 'countdown'
      || this.phase === 'crownAward'
      || this.phase === 'finished'
    ) {
      return;
    }

    const player = this.players.find((entry) => entry.id === playerId);

    if (!player || !player.alive || player.isRespawning) {
      return;
    }

    // 本機依相機翻轉；CPU 輸入已是世界座標
    // 人類 B 隊依相機翻轉；CPU stick 已是世界座標
    const flipScreen = player.teamId === 'b' && this.humanPlayerIds.has(playerId) ? -1 : 1;
    player.moveX = clamp(input.x * flipScreen, -1, 1);
    player.moveZ = clamp(input.y * flipScreen, -1, 1);

    if (input.jump) {
      player.jumpQueued = true;
    }

    if (input.aimX != null && input.aimZ != null) {
      const land = clampEnemyLand(player.teamId, input.aimX, input.aimZ);
      player.aimX = land.x;
      player.aimZ = land.z;
    }

    if (input.throwBomb && player.aimX != null && player.aimZ != null) {
      player.throwQueued = true;
    }
  }

  getCpuInput(cpuId: string, deltaMs: number): PlayerInput {
    const player = this.players.find((entry) => entry.id === cpuId);
    const idle: PlayerInput = {
      type: 'bouncy-bomb',
      x: 0,
      y: 0,
      jump: false,
      throwBomb: false,
    };

    if (!player || !player.alive || player.isRespawning || this.phase !== 'playing') {
      return idle;
    }

    player.cpuRetargetMs -= deltaMs;
    this.updateCpuBrain(player, deltaMs);

    // 抵達就改閒置，不要在終點繞圈抖
    const toTarget = Math.hypot(
      player.cpuTargetX - player.x,
      player.cpuTargetZ - player.z,
    );

    if (
      toTarget <= CPU_ARRIVE_DIST
      && (player.cpuStickX !== 0 || player.cpuStickZ !== 0)
    ) {
      // 到點只短停，接著再選下一個點
      this.commitCpuIdle(player, 120 + Math.random() * 220);
    }

    const enemies = this.players.filter(
      (entry) => entry.teamId !== player.teamId && entry.alive && !entry.isRespawning,
    );
    const focus = this.pickCpuThrowTarget(player, enemies);

    const inFlight = this.bombs.filter((bomb) => bomb.ownerId === player.id).length;
    const canThrow = player.cooldownMs <= 0
      && inFlight < BOMB_MAX_IN_FLIGHT
      && focus != null;
    const shouldThrow = Boolean(canThrow && Math.random() < CPU_THROW_CHANCE);

    let land: { x: number; z: number } | null = null;

    if (focus && shouldThrow) {
      if (Math.random() < CPU_WHIFF_CHANCE) {
        const bounds = halfZBounds(opponentTeam(player.teamId));
        land = clampEnemyLand(
          player.teamId,
          (Math.random() * 2 - 1) * BB_COURT_HALF_WIDTH * 0.85,
          bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ),
        );
      } else {
        land = this.pickCpuLandSpot(player, focus);
      }
    }

    return {
      type: 'bouncy-bomb',
      x: player.cpuStickX,
      y: player.cpuStickZ,
      jump: false,
      throwBomb: shouldThrow,
      aimX: land?.x ?? null,
      aimZ: land?.z ?? null,
    };
  }

  /** 換目標時才改方向；走路期間 stick 固定 */
  private commitCpuMove(player: CourtPlayer, targetX: number, targetZ: number, holdMs: number): void {
    const clamped = clampToHalf(player.teamId, targetX, targetZ);
    player.cpuTargetX = clamped.x;
    player.cpuTargetZ = clamped.z;
    player.cpuRetargetMs = holdMs;

    const dir = quantizeStick8(clamped.x - player.x, clamped.z - player.z);
    player.cpuStickX = dir.x * CPU_STICK_MAX;
    player.cpuStickZ = dir.z * CPU_STICK_MAX;
  }

  private commitCpuIdle(player: CourtPlayer, holdMs: number): void {
    player.cpuTargetX = player.x;
    player.cpuTargetZ = player.z;
    player.cpuStickX = 0;
    player.cpuStickZ = 0;
    player.cpuRetargetMs = holdMs;
  }

  /** CPU 只在換意圖時改 stick；移動仍經 onPlayerInput */
  private updateCpuBrain(player: CourtPlayer, deltaMs: number): void {
    const threat = this.findCpuThreatBomb(player);

    if (!threat) {
      player.cpuThreatBombId = null;
      player.cpuReactMs = 0;
      player.cpuWillDodge = false;
    } else if (player.cpuThreatBombId !== threat.id) {
      player.cpuThreatBombId = threat.id;
      player.cpuReactMs = CPU_REACT_MS_MIN
        + Math.random() * (CPU_REACT_MS_MAX - CPU_REACT_MS_MIN);
      player.cpuWillDodge = Math.random() < CPU_DODGE_CHANCE;
    } else {
      player.cpuReactMs = Math.max(0, player.cpuReactMs - deltaMs);

      // 還在爆風內且球已很低 → 若當前目標仍不安全，再躲一次
      const distToLand = Math.hypot(player.x - threat.landX, player.z - threat.landZ);
      const targetDist = Math.hypot(
        player.cpuTargetX - threat.landX,
        player.cpuTargetZ - threat.landZ,
      );
      const clearNeed = BOMB_BLAST_RADIUS + BB_PLAYER_RADIUS + 0.35;

      if (
        !player.cpuWillDodge
        && threat.y <= CPU_EMERGENCY_DODGE_Y
        && distToLand <= clearNeed
        && targetDist < clearNeed
      ) {
        player.cpuWillDodge = true;
        player.cpuReactMs = 0;
      }
    }

    if (
      threat
      && player.cpuThreatBombId === threat.id
      && player.cpuReactMs <= 0
      && player.cpuWillDodge
    ) {
      this.commitCpuDodge(player, threat);
      player.cpuWillDodge = false;
      return;
    }

    if (player.cpuRetargetMs > 0) {
      return;
    }

    if (Math.random() < CPU_IDLE_CHANCE) {
      this.commitCpuIdle(player, 120 + Math.random() * 220);
      return;
    }

    const bounds = halfZBounds(player.teamId);
    const depth = bounds.maxZ - bounds.minZ;
    const frontMin = player.teamId === 'a'
      ? bounds.maxZ - depth * 0.65
      : bounds.minZ;
    const frontMax = player.teamId === 'a'
      ? bounds.maxZ
      : bounds.minZ + depth * 0.65;
    const slotBias = player.slot === 0 ? -0.7 : 0.7;
    const teammate = this.players.find(
      (entry) =>
        entry.teamId === player.teamId
        && entry.id !== player.id
        && entry.alive
        && !entry.isRespawning,
    );

    let nextX = clamp(
      (Math.random() - 0.5) * BB_COURT_HALF_WIDTH * 1.6 + slotBias * 2.4,
      -BB_COURT_HALF_WIDTH + 1,
      BB_COURT_HALF_WIDTH - 1,
    );
    let nextZ = frontMin + Math.random() * Math.max(0.5, frontMax - frontMin);

    if (teammate) {
      const mateDist = Math.hypot(nextX - teammate.x, nextZ - teammate.z);

      if (mateDist < BB_TEAMMATE_SEPARATION + 1.2) {
        nextX = clamp(
          teammate.x + (nextX >= teammate.x ? 2.4 : -2.4),
          -BB_COURT_HALF_WIDTH + 1,
          BB_COURT_HALF_WIDTH - 1,
        );
      }
    }

    this.commitCpuMove(
      player,
      nextX,
      nextZ,
      CPU_HOLD_MS_MIN + Math.random() * (CPU_HOLD_MS_MAX - CPU_HOLD_MS_MIN),
    );
  }

  /** 往爆風外衝：距離至少清出爆炸半徑 */
  private commitCpuDodge(player: CourtPlayer, threat: FlyingBomb): void {
    const dx = player.x - threat.landX;
    const dz = player.z - threat.landZ;
    const fromLand = Math.hypot(dx, dz) || 0.01;
    const awayX = dx / fromLand;
    const awayZ = dz / fromLand;
    const clearNeed = BOMB_BLAST_RADIUS + BB_PLAYER_RADIUS + 0.55;
    const base = Math.max(
      clearNeed - fromLand,
      CPU_DODGE_DIST_MIN,
    );
    const distance = base
      + Math.random() * Math.max(0.4, CPU_DODGE_DIST_MAX - CPU_DODGE_DIST_MIN);
    // 輕微側步，但主方向仍離開落點
    const side = Math.random() < 0.5 ? 1 : -1;
    const lateral = 0.08 + Math.random() * 0.28;
    const mixX = awayX + (-awayZ) * lateral * side;
    const mixZ = awayZ + awayX * lateral * side;
    const mixLen = Math.hypot(mixX, mixZ) || 1;

    this.commitCpuMove(
      player,
      player.x + (mixX / mixLen) * distance,
      player.z + (mixZ / mixLen) * distance,
      520 + Math.random() * 220,
    );
  }

  private pickCpuThrowTarget(
    player: CourtPlayer,
    enemies: CourtPlayer[],
  ): CourtPlayer | null {
    if (enemies.length === 0) {
      return null;
    }

    const human = enemies.find((enemy) => enemy.id === this.localPlayerId) ?? null;
    const others = enemies.filter((enemy) => enemy.id !== this.localPlayerId);

    // 同隊兩人別永遠鎖定同一人：slot1 較常打另一隻
    if (player.slot === 1 && others.length > 0 && Math.random() < 0.62) {
      return others[Math.floor(Math.random() * others.length)]!;
    }

    // 人類身上已有多枚同隊彈在飛 → 改壓另一隻，散開火力
    if (human) {
      const bombsOnHuman = this.bombs.filter(
        (bomb) =>
          bomb.teamId === player.teamId
          && Math.hypot(bomb.landX - human.x, bomb.landZ - human.z)
            < BOMB_BLAST_RADIUS + 1.2,
      ).length;

      if (bombsOnHuman >= 2 && others.length > 0) {
        return others[Math.floor(Math.random() * others.length)]!;
      }
    }

    let best: CourtPlayer = enemies[0]!;
    let bestScore = -Infinity;

    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      const isHuman = enemy.id === this.localPlayerId;
      const score = (isHuman ? 14 : 0)
        + (BB_LIVES - enemy.lives) * 5
        - dist * 0.1
        + Math.random() * 0.8;

      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }

    return best;
  }

  /** 預判落點＋散開，避開同隊已有落點 */
  private pickCpuLandSpot(
    player: CourtPlayer,
    focus: CourtPlayer,
  ): { x: number; z: number } {
    const isHuman = focus.id === this.localPlayerId;
    const jitterRange = isHuman ? CPU_AIM_JITTER_HUMAN : CPU_AIM_JITTER;
    const leadSec = CPU_AIM_LEAD_SEC_MIN
      + Math.random() * (CPU_AIM_LEAD_SEC_MAX - CPU_AIM_LEAD_SEC_MIN);
    const predictedX = focus.x + focus.moveX * BB_MOVE_SPEED * leadSec;
    const predictedZ = focus.z + focus.moveZ * BB_MOVE_SPEED * leadSec;
    const teamLands = this.bombs
      .filter((bomb) => bomb.teamId === player.teamId)
      .map((bomb) => ({ x: bomb.landX, z: bomb.landZ }));
    // slot 偏向左／右切球，兩人不會砸同一點
    const slotAngle = player.slot === 0 ? -0.55 : 0.55;
    const candidates: Array<{ x: number; z: number }> = [];

    for (let i = 0; i < 10; i += 1) {
      const angle = slotAngle + (Math.PI * 2 * i) / 10 + Math.random() * 0.35;
      const radius = i === 0
        ? Math.random() * 0.45
        : CPU_AIM_SPREAD_MIN
          + Math.random() * (CPU_AIM_SPREAD_MAX - CPU_AIM_SPREAD_MIN);
      const jitterX = (Math.random() - 0.5) * jitterRange;
      const jitterZ = (Math.random() - 0.5) * jitterRange * 0.65;
      candidates.push(
        clampEnemyLand(
          player.teamId,
          predictedX + Math.cos(angle) * radius + jitterX,
          predictedZ + Math.sin(angle) * radius + jitterZ,
        ),
      );
    }

    let best = candidates[0]!;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      let nearest = Infinity;

      for (const land of teamLands) {
        const dist = Math.hypot(candidate.x - land.x, candidate.z - land.z);
        nearest = Math.min(nearest, dist);
      }

      if (teamLands.length === 0) {
        nearest = CPU_LAND_SEPARATION + 2;
      }

      const toFocus = Math.hypot(candidate.x - predictedX, candidate.z - predictedZ);
      // 要散開，但仍落在能炸到預判點附近
      const cover = toFocus <= BOMB_BLAST_RADIUS * 0.95 ? 3 : 0;
      const separation = Math.min(nearest, CPU_LAND_SEPARATION + 1.5);
      const score = separation * 2.2 + cover - toFocus * 0.35 + Math.random() * 0.4;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  private findCpuThreatBomb(player: CourtPlayer): FlyingBomb | null {
    let best: FlyingBomb | null = null;
    let bestDist = Infinity;

    for (const bomb of this.bombs) {
      if (bomb.teamId === player.teamId) {
        continue;
      }

      if (bomb.y > CPU_DODGE_BOMB_MAX_Y) {
        continue;
      }

      const dist = Math.hypot(bomb.landX - player.x, bomb.landZ - player.z);

      if (dist > BOMB_BLAST_RADIUS + CPU_DODGE_RADIUS_PAD) {
        continue;
      }

      if (dist < bestDist) {
        bestDist = dist;
        best = bomb;
      }
    }

    return best;
  }

  onTick(deltaMs: number): void {
    this.elapsedMs += deltaMs;

    if (this.phase === 'teamReveal') {
      if (this.elapsedMs >= TEAM_REVEAL_MS) {
        this.phase = 'countdown';
        this.phaseStartedAt = this.elapsedMs;
      }
      return;
    }

    if (this.phase === 'countdown') {
      if (this.elapsedMs - this.phaseStartedAt >= COUNTDOWN_MS) {
        this.phase = 'playing';
        this.phaseStartedAt = this.elapsedMs;
      }
      return;
    }

    if (this.phase === 'crownAward') {
      if (this.elapsedMs - this.phaseStartedAt >= CROWN_AWARD_MS) {
        this.phase = 'finished';
      }
      return;
    }

    if (this.phase !== 'playing') {
      return;
    }

    this.tickPlayers(deltaMs);
    this.tickBombs(deltaMs);
    this.checkTeamWipe();
  }

  getRankings(): string[] {
    const winners = this.winnerTeam === 'a'
      ? this.teamAIds
      : this.winnerTeam === 'b'
        ? this.teamBIds
        : [...this.teamAIds, ...this.teamBIds];
    const losers = this.winnerTeam === 'a'
      ? this.teamBIds
      : this.winnerTeam === 'b'
        ? this.teamAIds
        : [];

    return [...winners, ...losers];
  }

  getCrownAwards(): Record<string, number> {
    const winnerIds = this.winnerTeam === 'a'
      ? this.teamAIds
      : this.winnerTeam === 'b'
        ? this.teamBIds
        : null;

    return awardsForWinningTeam(
      this.players.map((player) => player.id),
      winnerIds,
    );
  }

  getRoundResults(): Record<string, 'win' | 'lose'> {
    const results: Record<string, 'win' | 'lose'> = {};

    for (const player of this.players) {
      results[player.id] = this.winnerTeam && player.teamId === this.winnerTeam
        ? 'win'
        : 'lose';
    }

    return results;
  }

  getScores(): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const player of this.players) {
      scores[player.id] = player.lives;
    }

    return scores;
  }

  getGameSnapshot(viewerId?: string | null): BouncyBombSnapshot {
    const viewPlayerId = viewerId === undefined ? this.localPlayerId : viewerId;
    const local = viewPlayerId
      ? this.players.find((player) => player.id === viewPlayerId) ?? null
      : null;
    const localTeamId = local?.teamId ?? null;
    const revealElapsed = this.phase === 'teamReveal' ? this.elapsedMs : TEAM_REVEAL_MS;
    const countdownElapsed = this.phase === 'countdown'
      ? this.elapsedMs - this.phaseStartedAt
      : COUNTDOWN_MS;

    return {
      phase: this.phase,
      teamAIds: this.teamAIds,
      teamBIds: this.teamBIds,
      localTeamId,
      localPlayerId: viewPlayerId,
      players: this.players.map((player) => {
        const invulnerable = player.alive
          && !player.isRespawning
          && nowMs() < player.invulnerableUntilMs;
        const bombsInFlight = this.bombs.filter((bomb) => bomb.ownerId === player.id).length;

        return {
          id: player.id,
          teamId: player.teamId,
          slot: player.slot,
          x: player.x,
          y: player.y,
          z: player.z,
          facingY: player.facingY,
          isMoving: Math.hypot(player.moveX, player.moveZ) > 0.08,
          lives: player.lives,
          alive: player.alive,
          isRespawning: player.isRespawning,
          respawnMsLeft: player.respawnMsLeft,
          respawnX: player.respawnX,
          respawnZ: player.respawnZ,
          cooldownMs: player.cooldownMs,
          bombsInFlight,
          invulnerable,
          isFlashing: invulnerable,
          color: player.color,
        };
      }),
      bombs: this.bombs.map((bomb) => ({
        id: bomb.id,
        ownerId: bomb.ownerId,
        x: bomb.x,
        y: bomb.y,
        z: bomb.z,
        landX: bomb.landX,
        landZ: bomb.landZ,
        color: bomb.color,
        colorHex: bomb.colorHex,
      })),
      aimPreview: this.buildAimPreview(local),
      teamRevealMsLeft: Math.max(0, TEAM_REVEAL_MS - revealElapsed),
      teamRevealProgress: clamp(revealElapsed / TEAM_REVEAL_MS, 0, 1),
      showTeamRevealGo: revealElapsed >= TEAM_REVEAL_MS - TEAM_REVEAL_GO_MS,
      countdownMsLeft: Math.max(0, COUNTDOWN_MS - countdownElapsed),
      localRespawnActive: Boolean(local?.isRespawning),
      localRespawnMsLeft: local?.respawnMsLeft ?? 0,
      localCooldownMs: local?.cooldownMs ?? 0,
      localBombsInFlight: local
        ? this.bombs.filter((bomb) => bomb.ownerId === local.id).length
        : 0,
      localBombsMax: BOMB_MAX_IN_FLIGHT,
      isCrownCeremony: this.phase === 'crownAward',
      crownWinnerIds: this.winnerTeam === 'a'
        ? this.teamAIds
        : this.winnerTeam === 'b'
          ? this.teamBIds
          : [],
      blastSerial: this.blastSerial,
      blast: this.blast,
      throwSerial: this.throwSerial,
      hitSerial: this.hitSerial,
    };
  }

  dispose(): void {
    this.bombs = [];
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  private createPlayer(id: string, teamId: BouncyBombTeamId, slot: number): CourtPlayer {
    const spawn = spawnCenter(teamId);
    const slotOffset = slot === 0 ? -1.4 : 1.4;

    return {
      id,
      teamId,
      slot,
      color: this.colorById.get(id) ?? 'player-1',
      x: spawn.x + slotOffset,
      y: 0,
      z: spawn.z,
      vy: 0,
      facingY: teamSideSign(teamId) > 0 ? Math.PI : 0,
      lives: BB_LIVES,
      alive: true,
      isRespawning: false,
      respawnMsLeft: 0,
      respawnX: null,
      respawnZ: null,
      invulnerableUntilMs: 0,
      cooldownMs: 0,
      aimX: null,
      aimZ: null,
      moveX: 0,
      moveZ: 0,
      jumpQueued: false,
      throwQueued: false,
      cpuTargetX: spawn.x + slotOffset,
      cpuTargetZ: spawn.z,
      cpuRetargetMs: 0,
      cpuStickX: 0,
      cpuStickZ: 0,
      cpuThreatBombId: null,
      cpuReactMs: 0,
      cpuWillDodge: false,
    };
  }

  private buildAimPreview(local: CourtPlayer | null): BouncyBombAimPreview | null {
    if (!local || !local.alive || local.isRespawning || local.aimX == null || local.aimZ == null) {
      return null;
    }

    return {
      x: local.aimX,
      z: local.aimZ,
      radius: BOMB_BLAST_RADIUS,
      colorHex: PLAYER_COLOR_HEX[local.color] ?? '#9b7fd4',
    };
  }

  private tickPlayers(deltaMs: number): void {
    const dt = deltaMs / 1000;

    for (const player of this.players) {
      if (!player.alive) {
        continue;
      }

      if (player.isRespawning) {
        player.respawnMsLeft = Math.max(0, player.respawnMsLeft - deltaMs);

        if (player.respawnMsLeft <= 0) {
          this.finishRespawn(player);
        }

        continue;
      }

      player.cooldownMs = Math.max(0, player.cooldownMs - deltaMs);

      if (player.jumpQueued && player.y <= 0.01) {
        player.vy = BB_JUMP_SPEED;
        player.jumpQueued = false;
      } else {
        player.jumpQueued = false;
      }

      player.vy -= BB_GRAVITY_PLAYER * dt;
      player.y = Math.max(0, player.y + player.vy * dt);

      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
      }

      const speed = BB_MOVE_SPEED;
      player.x += player.moveX * speed * dt;
      player.z += player.moveZ * speed * dt;

      const clamped = clampToHalf(player.teamId, player.x, player.z);
      player.x = clamped.x;
      player.z = clamped.z;

      if (Math.hypot(player.moveX, player.moveZ) > 0.08) {
        player.facingY = Math.atan2(player.moveX, player.moveZ);
      }

      if (player.throwQueued) {
        this.tryThrow(player);
        player.throwQueued = false;
      }
    }

    this.separateTeammates();
  }

  private separateTeammates(): void {
    for (const teamId of ['a', 'b'] as const) {
      const pair = this.players.filter(
        (player) => player.teamId === teamId && player.alive && !player.isRespawning,
      );

      if (pair.length < 2) {
        continue;
      }

      const [left, right] = pair;
      const dx = right.x - left.x;
      const dz = right.z - left.z;
      const dist = Math.hypot(dx, dz) || 0.0001;

      if (dist >= BB_TEAMMATE_SEPARATION) {
        continue;
      }

      // 一次拆到剛好不重疊，避免每幀彈簧推擠造成晃動
      const nx = dx / dist;
      const nz = dz / dist;
      const half = (BB_TEAMMATE_SEPARATION - dist) * 0.5;
      left.x -= nx * half;
      left.z -= nz * half;
      right.x += nx * half;
      right.z += nz * half;

      const leftClamped = clampToHalf(teamId, left.x, left.z);
      const rightClamped = clampToHalf(teamId, right.x, right.z);
      left.x = leftClamped.x;
      left.z = leftClamped.z;
      right.x = rightClamped.x;
      right.z = rightClamped.z;
    }
  }

  private tryThrow(player: CourtPlayer): void {
    if (player.cooldownMs > 0 || player.aimX == null || player.aimZ == null) {
      return;
    }

    const inFlight = this.bombs.filter((bomb) => bomb.ownerId === player.id).length;

    if (inFlight >= BOMB_MAX_IN_FLIGHT) {
      return;
    }

    const land = clampEnemyLand(player.teamId, player.aimX, player.aimZ);
    const startX = player.x;
    const startY = BOMB_SPAWN_HEIGHT + player.y;
    const startZ = player.z;
    const dx = land.x - startX;
    const dz = land.z - startZ;
    const dist = Math.hypot(dx, dz);
    const flightSec = clamp(
      0.28 + dist * 0.055,
      BOMB_FLIGHT_SEC_MIN,
      BOMB_FLIGHT_SEC_MAX,
    ) / BOMB_THROW_SPEED_SCALE;

    let vy = (BOMB_RADIUS - startY) / flightSec + 0.5 * BOMB_GRAVITY * flightSec + BOMB_LOFT;
    let vx = (dx / flightSec) * BOMB_THROW_SPEED_SCALE;
    let vz = (dz / flightSec) * BOMB_THROW_SPEED_SCALE;

    // 抬高弧線直到過中線淨空
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const midT = Math.abs(startZ) / (Math.abs(startZ) + Math.abs(land.z) || 1);
      const t = clamp(midT, 0.15, 0.85);
      const midY = startY + vy * t - 0.5 * BOMB_GRAVITY * t * t;

      if (midY >= BOMB_MID_CLEAR_Y) {
        break;
      }

      vy += 0.55;
    }

    const colorHex = PLAYER_COLOR_HEX[player.color] ?? '#9b7fd4';
    this.bombSeq += 1;
    this.bombs.push({
      id: `bomb-${this.bombSeq}`,
      ownerId: player.id,
      teamId: player.teamId,
      color: player.color,
      colorHex,
      x: startX,
      y: startY,
      z: startZ,
      vx,
      vy,
      vz,
      landX: land.x,
      landZ: land.z,
    });
    player.cooldownMs = BOMB_COOLDOWN_MS;
    this.throwSerial += 1;
  }

  private tickBombs(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const remaining: FlyingBomb[] = [];

    for (const bomb of this.bombs) {
      bomb.vy -= BOMB_GRAVITY * dt;
      bomb.x += bomb.vx * dt;
      bomb.y += bomb.vy * dt;
      bomb.z += bomb.vz * dt;

      if (bomb.y > BOMB_RADIUS) {
        remaining.push(bomb);
        continue;
      }

      bomb.x = bomb.landX;
      bomb.z = bomb.landZ;
      this.explode(bomb);
    }

    this.bombs = remaining;
  }

  private explode(bomb: FlyingBomb): void {
    const hits: BouncyBombBlastHit[] = [];
    const clock = nowMs();

    for (const player of this.players) {
      if (!player.alive || player.isRespawning) {
        continue;
      }

      if (player.teamId === bomb.teamId) {
        continue;
      }

      if (clock < player.invulnerableUntilMs) {
        continue;
      }

      const dist = Math.hypot(player.x - bomb.landX, player.z - bomb.landZ);

      if (dist > BOMB_BLAST_RADIUS + BB_PLAYER_RADIUS * 0.35) {
        continue;
      }

      const eliminated = this.applyHit(player);
      hits.push({ victimId: player.id, eliminated });
    }

    this.blastSerial += 1;
    this.blast = {
      x: bomb.landX,
      z: bomb.landZ,
      colorHex: bomb.colorHex,
      attackerId: bomb.ownerId,
      hits,
    };

    if (hits.length > 0) {
      this.hitSerial += 1;
    }
  }

  /** @returns 是否陣亡 */
  private applyHit(player: CourtPlayer): boolean {
    player.lives = Math.max(0, player.lives - 1);

    if (player.lives <= 0) {
      player.alive = false;
      player.isRespawning = false;
      player.respawnMsLeft = 0;
      player.respawnX = null;
      player.respawnZ = null;
      return true;
    }

    const spawn = pickRespawnSpot(player.teamId, this.players, player.id);
    player.isRespawning = true;
    player.respawnMsLeft = RESPAWN_MS;
    player.respawnX = spawn.x;
    player.respawnZ = spawn.z;
    player.moveX = 0;
    player.moveZ = 0;
    player.throwQueued = false;
    return false;
  }

  private finishRespawn(player: CourtPlayer): void {
    const spawn = player.respawnX != null && player.respawnZ != null
      ? { x: player.respawnX, z: player.respawnZ }
      : pickRespawnSpot(player.teamId, this.players, player.id);
    player.x = spawn.x;
    player.z = spawn.z;
    player.y = 0;
    player.vy = 0;
    player.isRespawning = false;
    player.respawnMsLeft = 0;
    player.respawnX = null;
    player.respawnZ = null;
    player.invulnerableUntilMs = nowMs() + INVULN_MS;
    player.cpuTargetX = spawn.x;
    player.cpuTargetZ = spawn.z;
    player.cpuRetargetMs = 400;
  }

  private checkTeamWipe(): void {
    const teamAAlive = this.players.some(
      (player) => player.teamId === 'a' && player.alive,
    );
    const teamBAlive = this.players.some(
      (player) => player.teamId === 'b' && player.alive,
    );

    if (teamAAlive && teamBAlive) {
      return;
    }

    this.winnerTeam = teamAAlive ? 'a' : teamBAlive ? 'b' : 'a';
    this.phase = 'crownAward';
    this.phaseStartedAt = this.elapsedMs;
    this.bombs = [];
  }
}
