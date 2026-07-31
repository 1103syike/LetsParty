/** 蹦蹦炸彈手感常數 — 調拋物線／爆炸／重生只改這裡 */

/** 半場尺寸（全場約 20 × 25） */
export const BB_COURT_HALF_WIDTH = 10;
export const BB_COURT_HALF_DEPTH = 12.5;
export const BB_NET_THICKNESS = 0.22;
export const BB_PLAYER_RADIUS = 0.55;
/** 只防身體重疊；太大的軟泡泡會跟走路意圖對打，看起來像晃 */
export const BB_TEAMMATE_SEPARATION = BB_PLAYER_RADIUS * 2.05;
export const BB_MOVE_SPEED = 8.6;
export const BB_JUMP_SPEED = 7.4;
export const BB_GRAVITY_PLAYER = 18;

export const BB_LIVES = 3;

export const BOMB_RADIUS = 0.32;
export const BOMB_GRAVITY = 18;
export const BOMB_FLIGHT_SEC_MIN = 0.4;
export const BOMB_FLIGHT_SEC_MAX = 1.05;
export const BOMB_LOFT = 1.1;
export const BOMB_THROW_SPEED_SCALE = 1;
export const BOMB_SPAWN_HEIGHT = 1.15;
export const BOMB_BLAST_RADIUS = 2.7;
/** 每人場上同時飛行上限（人類／CPU 同一規則） */
export const BOMB_MAX_IN_FLIGHT = 3;
/** 略短冷卻，方便連丟 */
export const BOMB_COOLDOWN_MS = 560;
/** 過中線時球心最低高度（淨空矮牆） */
export const BOMB_MID_CLEAR_Y = 1.85;

/** 扣命星星飛：高拋物線、翻轉飛出場外 */
export const HIT_KNOCKBACK_DISTANCE = 18;
export const HIT_KNOCKBACK_PEAK_Y = 9.5;
export const HIT_KNOCKBACK_DURATION_MS = 1100;
export const HIT_KNOCKBACK_SPIN_REVS = 2.4;
export const ELIM_KNOCKBACK_DISTANCE = 22;
export const ELIM_KNOCKBACK_DURATION_MS = 1250;

/** CPU：要能壓到人類，也要夠會躲（仍偶爾晚半拍） */
export const CPU_DODGE_CHANCE = 0.9;
export const CPU_REACT_MS_MIN = 40;
export const CPU_REACT_MS_MAX = 160;
/** 落點進爆風外緣就開始躲 */
export const CPU_DODGE_RADIUS_PAD = 1.35;
/** 彈還很高就開始反應 */
export const CPU_DODGE_BOMB_MAX_Y = 5.5;
/** 閃避距離：至少要離開爆風 */
export const CPU_DODGE_DIST_MIN = 2.8;
export const CPU_DODGE_DIST_MAX = 5.2;
/** 緊急閃：球很低且仍在圈內一定躲 */
export const CPU_EMERGENCY_DODGE_Y = 1.8;
/** 搖桿最大出力 */
export const CPU_STICK_MAX = 1;
/** 冷卻好幾乎必丟 */
export const CPU_THROW_CHANCE = 0.88;
/** 瞄準偏移（對人類更準，見程式） */
export const CPU_AIM_JITTER = 0.55;
export const CPU_AIM_JITTER_HUMAN = 0.28;
/** 預判敵人移動的秒數 */
export const CPU_AIM_LEAD_SEC_MIN = 0.45;
export const CPU_AIM_LEAD_SEC_MAX = 0.85;
/** 偶爾亂丟空地 */
export const CPU_WHIFF_CHANCE = 0.02;
/** 同隊落點至少隔這麼遠，避免全砸同一點 */
export const CPU_LAND_SEPARATION = 2.4;
/** 散彈候選：繞預判點的半徑 */
export const CPU_AIM_SPREAD_MIN = 0.8;
export const CPU_AIM_SPREAD_MAX = 2.6;
/** 到點後發呆機率 */
export const CPU_IDLE_CHANCE = 0.03;
/** 走到多近算抵達 */
export const CPU_ARRIVE_DIST = 0.85;
/** 一次走路最短／最長持向時間 */
export const CPU_HOLD_MS_MIN = 380;
export const CPU_HOLD_MS_MAX = 820;

export const RESPAWN_MS = 3000;
export const INVULN_MS = 1800;

export const TEAM_REVEAL_MS = 3600;
export const TEAM_REVEAL_GO_MS = 700;
export const COUNTDOWN_MS = 1200;
export const CROWN_AWARD_MS = 3400;

export const PLAYER_COLOR_HEX: Record<string, string> = {
  'player-1': '#e86b8a',
  'player-2': '#9b7fd4',
  'player-3': '#6ba8e8',
  'player-4': '#7ecf9a',
};
