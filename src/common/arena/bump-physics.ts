/** 圓形擂台互推：純 2D（x/z）物理 + 衝撞／防衛技能 */

export const BUMP_STAGE_RADIUS = 5.2;
export const BUMP_ACTOR_RADIUS = 0.55;
export const BUMP_MOVE_ACCEL = 34;
export const BUMP_MAX_SPEED = 7.2;
export const BUMP_FRICTION = 0.89;
export const BUMP_PUSH_STRENGTH = 1.55;
export const BUMP_OUTWARD_BIAS = 1.2;
export const BUMP_STALEMATE_SHEAR = 3.4;
export const BUMP_FALL_MARGIN = 0.08;
export const BUMP_SPAWN_GRACE_MS = 1800;

/** 衝撞：短衝刺，沒格擋要被炸飛 */
export const BUMP_CHARGE_DURATION_MS = 340;
export const BUMP_CHARGE_COOLDOWN_MS = 1400;
export const BUMP_CHARGE_SPEED = 15;
export const BUMP_CHARGE_HIT_IMPULSE = 28;
/** 衝撞命中當幀直接彈開的距離 */
export const BUMP_CHARGE_BLAST_POP = 2.6;
/** 衝撞判定距離（略大於碰撞半徑，避免穿模漏判） */
export const BUMP_CHARGE_HIT_RANGE = BUMP_ACTOR_RADIUS * 2.7;
/** 沒格擋被衝到且偏外 → 直接判掉下 */
export const BUMP_CHARGE_FORCE_FALL_RATIO = 0.4;
export const BUMP_CHARGE_STUN_MS = 780;

export const BUMP_DEFEND_MOVE_SCALE = 0.42;
export const BUMP_DEFEND_BLOCK_FACTOR = 0.18;
export const BUMP_STUN_MS = 520;
/** 一般互撞被頂到時的往後彈速度 */
export const BUMP_BUMP_KNOCKBACK = 9;
/** 硬直滑行摩擦（越接近 1 飛越遠） */
export const BUMP_STUN_FRICTION = 0.988;
/** 一般擊退當幀位移 */
export const BUMP_KNOCKBACK_POP = 0.85;
export const BUMP_JUMP_DURATION_MS = 520;
export const BUMP_JUMP_COOLDOWN_MS = 280;

export interface BumpBody {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  alive: boolean;
  fallOrder: number;
  /** 面向（最後有效移動方向） */
  facingX: number;
  facingZ: number;
  isCharging: boolean;
  chargeMsLeft: number;
  chargeCooldownMs: number;
  isDefending: boolean;
  stunMsLeft: number;
  jumpMsLeft: number;
  jumpCooldownMs: number;
}

export interface CpuBumpIntent {
  steer: { x: number; z: number };
  wantJump: boolean;
  wantCharge: boolean;
  wantDefend: boolean;
}

/** 撞擊事件：給畫面播攻擊動畫／粒子 */
export interface BumpHitEvent {
  attackerId: string;
  victimId: string;
  x: number;
  z: number;
  kind: 'bump' | 'charge';
}

/** CPU 狀態：滯後模式 + 平滑轉向，避免 1v1 抽搐 */
export interface CpuBumpBrain {
  mode: 'drive' | 'recover' | 'evade';
  modeUntilMs: number;
  steerX: number;
  steerZ: number;
  chargeCommitUntilMs: number;
}

export function createCpuBumpBrain(): CpuBumpBrain {
  return {
    mode: 'drive',
    modeUntilMs: 0,
    steerX: 0,
    steerZ: 1,
    chargeCommitUntilMs: 0,
  };
}

function pushHit(
  hits: BumpHitEvent[] | undefined,
  attacker: BumpBody,
  victim: BumpBody,
  kind: BumpHitEvent['kind'],
): void {
  if (!hits) {
    return;
  }

  hits.push({
    attackerId: attacker.id,
    victimId: victim.id,
    x: (attacker.x + victim.x) * 0.5,
    z: (attacker.z + victim.z) * 0.5,
    kind,
  });
}

export function createBumpBodies(ids: string[]): BumpBody[] {
  const count = ids.length;

  return ids.map((id, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const ring = Math.min(2.05, BUMP_STAGE_RADIUS * 0.38);
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring;
    const mag = Math.hypot(x, z) || 1;

    return {
      id,
      x,
      z,
      vx: 0,
      vz: 0,
      alive: true,
      fallOrder: 0,
      facingX: -x / mag,
      facingZ: -z / mag,
      isCharging: false,
      chargeMsLeft: 0,
      chargeCooldownMs: 800 + index * 120,
      isDefending: false,
      stunMsLeft: 0,
      jumpMsLeft: 0,
      jumpCooldownMs: 0,
    };
  });
}

export function tickBumpSkillTimers(body: BumpBody, deltaMs: number): void {
  if (!body.alive) {
    return;
  }

  if (body.chargeCooldownMs > 0) {
    body.chargeCooldownMs = Math.max(0, body.chargeCooldownMs - deltaMs);
  }

  if (body.jumpCooldownMs > 0) {
    body.jumpCooldownMs = Math.max(0, body.jumpCooldownMs - deltaMs);
  }

  if (body.stunMsLeft > 0) {
    body.stunMsLeft = Math.max(0, body.stunMsLeft - deltaMs);
  }

  if (body.jumpMsLeft > 0) {
    body.jumpMsLeft = Math.max(0, body.jumpMsLeft - deltaMs);

    if (body.jumpMsLeft <= 0) {
      body.jumpCooldownMs = BUMP_JUMP_COOLDOWN_MS;
    }
  }

  if (body.isCharging) {
    body.chargeMsLeft -= deltaMs;

    if (body.chargeMsLeft <= 0) {
      body.isCharging = false;
      body.chargeMsLeft = 0;
    }
  }
}

export function tryStartBumpJump(body: BumpBody): boolean {
  if (
    !body.alive
    || body.jumpMsLeft > 0
    || body.jumpCooldownMs > 0
    || body.isCharging
    || body.stunMsLeft > 0
  ) {
    return false;
  }

  body.jumpMsLeft = BUMP_JUMP_DURATION_MS;
  body.isDefending = false;

  return true;
}

export function tryStartBumpCharge(body: BumpBody): boolean {
  if (
    !body.alive
    || body.isCharging
    || body.chargeCooldownMs > 0
    || body.stunMsLeft > 0
    || body.jumpMsLeft > 0
  ) {
    return false;
  }

  body.isCharging = true;
  body.chargeMsLeft = BUMP_CHARGE_DURATION_MS;
  body.chargeCooldownMs = BUMP_CHARGE_COOLDOWN_MS;
  body.isDefending = false;
  body.vx = body.facingX * BUMP_CHARGE_SPEED;
  body.vz = body.facingZ * BUMP_CHARGE_SPEED;

  return true;
}

export function setBumpDefending(body: BumpBody, isDefending: boolean): void {
  if (!body.alive || body.isCharging || body.stunMsLeft > 0 || body.jumpMsLeft > 0) {
    body.isDefending = false;
    return;
  }

  body.isDefending = isDefending;
}

export function applyBumpSteer(
  body: BumpBody,
  steerX: number,
  steerZ: number,
  deltaSec: number,
): void {
  if (!body.alive) {
    return;
  }

  // 被撞硬直：不能主動走，但要保有往後彈的速度
  if (body.stunMsLeft > 0) {
    body.vx *= BUMP_STUN_FRICTION;
    body.vz *= BUMP_STUN_FRICTION;
    body.x += body.vx * deltaSec;
    body.z += body.vz * deltaSec;
    return;
  }

  if (body.isCharging) {
    body.vx = body.facingX * BUMP_CHARGE_SPEED;
    body.vz = body.facingZ * BUMP_CHARGE_SPEED;
    body.x += body.vx * deltaSec;
    body.z += body.vz * deltaSec;
    return;
  }

  const mag = Math.hypot(steerX, steerZ);
  const moveScale = body.isDefending ? BUMP_DEFEND_MOVE_SCALE : 1;

  if (mag > 0.05) {
    const nx = steerX / mag;
    const nz = steerZ / mag;
    body.facingX = nx;
    body.facingZ = nz;
    body.vx += nx * BUMP_MOVE_ACCEL * moveScale * deltaSec;
    body.vz += nz * BUMP_MOVE_ACCEL * moveScale * deltaSec;
  }

  body.vx *= BUMP_FRICTION;
  body.vz *= BUMP_FRICTION;

  const speed = Math.hypot(body.vx, body.vz);
  const maxSpeed = BUMP_MAX_SPEED * moveScale;

  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    body.vx *= scale;
    body.vz *= scale;
  }

  body.x += body.vx * deltaSec;
  body.z += body.vz * deltaSec;
}

function bodyMass(body: BumpBody): number {
  const dist = Math.hypot(body.x, body.z);
  const edge = Math.min(1, dist / BUMP_STAGE_RADIUS);
  let mass = 1.2 - edge * 0.55;

  if (body.isDefending) {
    mass *= 1.45;
  }

  if (body.isCharging) {
    mass *= 1.25;
  }

  return mass;
}

/** 被撞往後彈：覆寫速度 + 當幀位移，並給硬直避免立刻用搖桿抵銷 */
function applyKnockback(
  body: BumpBody,
  dirX: number,
  dirZ: number,
  strength: number,
  stunMs: number,
  pop = BUMP_KNOCKBACK_POP,
): void {
  const mag = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / mag;
  const nz = dirZ / mag;
  body.vx = nx * strength;
  body.vz = nz * strength;
  body.x += nx * pop;
  body.z += nz * pop;
  body.isCharging = false;
  body.chargeMsLeft = 0;
  body.isDefending = false;
  body.jumpMsLeft = 0;
  body.stunMsLeft = Math.max(body.stunMsLeft, stunMs);
}

function forceFallSoon(body: BumpBody): void {
  const dist = Math.hypot(body.x, body.z) || 1;
  const rx = body.x / dist;
  const rz = body.z / dist;
  // 直接推過邊界外側，下一幀 applyBumpFalls 會判出局
  body.x = rx * (BUMP_STAGE_RADIUS + BUMP_FALL_MARGIN + 0.35);
  body.z = rz * (BUMP_STAGE_RADIUS + BUMP_FALL_MARGIN + 0.35);
  body.vx = rx * 4;
  body.vz = rz * 4;
  body.isCharging = false;
  body.isDefending = false;
}

/**
 * 衝撞專用：前方扇形掃擊，不依賴精確重疊（避免高速穿模沒擊退）
 * 須在 tickBumpSkillTimers 清掉 isCharging 之前呼叫。
 */
export function resolveChargeSweeps(
  bodies: BumpBody[],
  hits?: BumpHitEvent[],
): void {
  for (const attacker of bodies) {
    if (!attacker.alive || !attacker.isCharging) {
      continue;
    }

    for (const victim of bodies) {
      if (!victim.alive || victim.id === attacker.id) {
        continue;
      }

      const dx = victim.x - attacker.x;
      const dz = victim.z - attacker.z;
      const dist = Math.hypot(dx, dz);

      if (dist > BUMP_CHARGE_HIT_RANGE || dist < 0.0001) {
        continue;
      }

      // 跳躍中躲過衝撞
      if (victim.jumpMsLeft > 0) {
        continue;
      }

      const nx = dx / dist;
      const nz = dz / dist;
      // 要在衝撞者面前，背撞不算
      const align = attacker.facingX * nx + attacker.facingZ * nz;

      if (align < 0.2) {
        continue;
      }

      resolveChargeHit(attacker, victim, nx, nz, hits);

      // 一次衝撞只打一人，避免連鎖吃掉整場
      break;
    }
  }
}

/** 一般推擠 + 殘餘衝撞接觸結算 */
export function resolveBumpCollisions(
  bodies: BumpBody[],
  hits?: BumpHitEvent[],
): void {
  for (let i = 0; i < bodies.length; i += 1) {
    const a = bodies[i];

    if (!a.alive) {
      continue;
    }

    for (let j = i + 1; j < bodies.length; j += 1) {
      const b = bodies[j];

      if (!b.alive) {
        continue;
      }

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const minDist = BUMP_ACTOR_RADIUS * 2;

      if (dist >= minDist || dist < 0.0001) {
        continue;
      }

      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;
      const aMass = bodyMass(a);
      const bMass = bodyMass(b);
      const massSum = aMass + bMass;

      a.x -= nx * overlap * (bMass / massSum);
      a.z -= nz * overlap * (bMass / massSum);
      b.x += nx * overlap * (aMass / massSum);
      b.z += nz * overlap * (aMass / massSum);

      // 衝撞命中（掃擊沒打到時的補刀）
      if (a.isCharging && !b.isCharging) {
        resolveChargeHit(a, b, nx, nz, hits);
        continue;
      }

      if (b.isCharging && !a.isCharging) {
        resolveChargeHit(b, a, -nx, -nz, hits);
        continue;
      }

      if (a.isCharging && b.isCharging) {
        // 互撞：雙方往後彈開
        a.isCharging = false;
        b.isCharging = false;
        applyKnockback(a, -nx, -nz, 8.5, BUMP_STUN_MS * 0.75);
        applyKnockback(b, nx, nz, 8.5, BUMP_STUN_MS * 0.75);
        pushHit(hits, a, b, 'charge');
        pushHit(hits, b, a, 'charge');
        continue;
      }

      const relVx = a.vx - b.vx;
      const relVz = a.vz - b.vz;
      const impact = relVx * nx + relVz * nz;
      const relSpeed = Math.hypot(relVx, relVz);
      // A 朝 B 的相對速度（>0 表示 A 撞進 B）
      const aIntoB = a.vx * nx + a.vz * nz;
      const bIntoA = -(b.vx * nx + b.vz * nz);

      if (impact < 0) {
        const invA = 1 / aMass;
        const invB = 1 / bMass;
        const impulse = (-impact * BUMP_PUSH_STRENGTH) / (invA + invB);
        a.vx -= impulse * invA * nx;
        a.vz -= impulse * invA * nz;
        b.vx += impulse * invB * nx;
        b.vz += impulse * invB * nz;
      }

      // 有明顯撞擊時：被撞的一方沿法線往後彈開（手感重點）
      if (aIntoB > 1.4 && aIntoB >= bIntoA) {
        const strength = Math.min(
          BUMP_BUMP_KNOCKBACK,
          4.5 + aIntoB * 0.85,
        ) * (b.isDefending ? BUMP_DEFEND_BLOCK_FACTOR + 0.35 : 1);
        applyKnockback(b, nx, nz, strength, b.isDefending ? 120 : 260);
        a.vx *= 0.55;
        a.vz *= 0.55;
        pushHit(hits, a, b, 'bump');
      } else if (bIntoA > 1.4) {
        const strength = Math.min(
          BUMP_BUMP_KNOCKBACK,
          4.5 + bIntoA * 0.85,
        ) * (a.isDefending ? BUMP_DEFEND_BLOCK_FACTOR + 0.35 : 1);
        applyKnockback(a, -nx, -nz, strength, a.isDefending ? 120 : 260);
        b.vx *= 0.55;
        b.vz *= 0.55;
        pushHit(hits, b, a, 'bump');
      }

      const midX = (a.x + b.x) * 0.5;
      const midZ = (a.z + b.z) * 0.5;
      const midDist = Math.hypot(midX, midZ);

      if (midDist > 0.7 && relSpeed > 0.8) {
        const rx = midX / midDist;
        const rz = midZ / midDist;
        const aDist = Math.hypot(a.x, a.z);
        const bDist = Math.hypot(b.x, b.z);
        const bias = BUMP_OUTWARD_BIAS * (0.25 + overlap);

        if (aDist >= bDist) {
          a.vx += rx * bias * (bMass / massSum);
          a.vz += rz * bias * (bMass / massSum);
        } else {
          b.vx += rx * bias * (aMass / massSum);
          b.vz += rz * bias * (aMass / massSum);
        }
      }

      // 僵持互頂（尤其中心肉球）：大力側推 + 往外踹，別永遠頂著不動
      if (overlap > 0.05 && relSpeed < 1.15) {
        const tx = -nz;
        const tz = nx;
        const centerFactor = midDist < 1.4 ? 1.55 : 1;
        const shear = BUMP_STALEMATE_SHEAR * 0.7 * centerFactor;
        a.vx -= tx * shear * 0.55;
        a.vz -= tz * shear * 0.55;
        b.vx += tx * shear * 0.55;
        b.vz += tz * shear * 0.55;

        if (midDist < 1.6 && midDist > 0.0001) {
          const rx = midX / midDist;
          const rz = midZ / midDist;
          a.vx += rx * 1.1;
          a.vz += rz * 1.1;
          b.vx += rx * 1.1;
          b.vz += rz * 1.1;
        }
      }
    }
  }
}

function resolveChargeHit(
  attacker: BumpBody,
  victim: BumpBody,
  dirX: number,
  dirZ: number,
  hits?: BumpHitEvent[],
): void {
  if (!attacker.isCharging) {
    return;
  }

  pushHit(hits, attacker, victim, 'charge');
  attacker.isCharging = false;
  attacker.chargeMsLeft = 0;
  // 攻擊者撞實後刹住，自己不要被一起炸飛
  const hitMag = Math.hypot(dirX, dirZ) || 1;
  const hitX = dirX / hitMag;
  const hitZ = dirZ / hitMag;
  attacker.vx = -hitX * 2.4;
  attacker.vz = -hitZ * 2.4;
  attacker.stunMsLeft = Math.max(attacker.stunMsLeft, 140);
  attacker.isDefending = false;

  if (victim.isDefending) {
    applyKnockback(
      victim,
      hitX,
      hitZ,
      BUMP_CHARGE_HIT_IMPULSE * BUMP_DEFEND_BLOCK_FACTOR,
      180,
      0.7,
    );
    attacker.stunMsLeft = Math.max(attacker.stunMsLeft, BUMP_STUN_MS);
    return;
  }

  // 沒格擋：沿撞擊方向炸飛，並往台外再踹一腳
  const victimDist = Math.hypot(victim.x, victim.z) || 1;
  const outX = victim.x / victimDist;
  const outZ = victim.z / victimDist;
  const knockX = hitX * 0.62 + outX * 0.38;
  const knockZ = hitZ * 0.62 + outZ * 0.38;
  applyKnockback(
    victim,
    knockX,
    knockZ,
    BUMP_CHARGE_HIT_IMPULSE,
    BUMP_CHARGE_STUN_MS,
    BUMP_CHARGE_BLAST_POP,
  );
  // 再追加台外推力，確保有「被轟出去」的感覺
  victim.vx += outX * 9;
  victim.vz += outZ * 9;

  if (victimDist >= BUMP_STAGE_RADIUS * BUMP_CHARGE_FORCE_FALL_RATIO) {
    forceFallSoon(victim);
  }
}

export function softClampBodiesInside(bodies: BumpBody[]): void {
  const limit = BUMP_STAGE_RADIUS - 0.55;

  for (const body of bodies) {
    if (!body.alive) {
      continue;
    }

    const dist = Math.hypot(body.x, body.z);

    if (dist <= limit || dist < 0.0001) {
      continue;
    }

    const scale = limit / dist;
    body.x *= scale;
    body.z *= scale;
    const radial = (body.vx * body.x + body.vz * body.z) / (limit * limit);

    if (radial > 0) {
      body.vx -= body.x * radial * 1.6;
      body.vz -= body.z * radial * 1.6;
    }
  }
}

export function applyBumpFalls(bodies: BumpBody[], nextFallOrder: number): number {
  let fallOrder = nextFallOrder;
  const limit = BUMP_STAGE_RADIUS + BUMP_FALL_MARGIN;

  for (const body of bodies) {
    if (!body.alive) {
      continue;
    }

    if (Math.hypot(body.x, body.z) > limit) {
      body.alive = false;
      body.vx = 0;
      body.vz = 0;
      body.isCharging = false;
      body.isDefending = false;
      body.fallOrder = fallOrder;
      fallOrder += 1;
    }
  }

  return fallOrder;
}

export function countAliveBodies(bodies: BumpBody[]): number {
  return bodies.filter((body) => body.alive).length;
}

/** 最後倖存者；超時多人仍在台上則取最靠中心者 */
export function resolveArenaWinnerId(bodies: BumpBody[]): string | null {
  const alive = bodies.filter((body) => body.alive);

  if (alive.length === 1) {
    return alive[0].id;
  }

  if (alive.length > 1) {
    return [...alive].sort((left, right) => {
      const distDiff = Math.hypot(left.x, left.z) - Math.hypot(right.x, right.z);

      if (Math.abs(distDiff) > 0.01) {
        return distDiff;
      }

      return left.id.localeCompare(right.id);
    })[0]?.id ?? null;
  }

  // 全員掉下：最後掉的人算撐最久
  return [...bodies].sort((left, right) => {
    if (left.fallOrder !== right.fallOrder) {
      return right.fallOrder - left.fallOrder;
    }

    return left.id.localeCompare(right.id);
  })[0]?.id ?? null;
}

export function rankBumpBodies(bodies: BumpBody[]): string[] {
  const winnerId = resolveArenaWinnerId(bodies);
  const others = bodies
    .filter((body) => body.id !== winnerId)
    .sort((left, right) => {
      if (left.alive !== right.alive) {
        return left.alive ? -1 : 1;
      }

      if (!left.alive && !right.alive) {
        return right.fallOrder - left.fallOrder;
      }

      const distDiff = Math.hypot(left.x, left.z) - Math.hypot(right.x, right.z);

      if (Math.abs(distDiff) > 0.01) {
        return distDiff;
      }

      return left.id.localeCompare(right.id);
    })
    .map((body) => body.id);

  return winnerId ? [winnerId, ...others] : others;
}

function stableHash(text: string): number {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }

  return hash;
}

function stableSideSign(id: string): number {
  return stableHash(id) % 2 === 0 ? 1 : -1;
}

function normalizeSteer(x: number, z: number): { x: number; z: number } {
  const mag = Math.hypot(x, z) || 1;

  return { x: x / mag, z: z / mag };
}

/** 每隔幾秒抽一個集火獵物，同時間內大家目標一致（隨便幹死一個人） */
export function pickHuntVictim(alive: BumpBody[], elapsedMs: number): BumpBody | null {
  if (alive.length < 2) {
    return null;
  }

  const epoch = Math.floor(elapsedMs / 2800);
  const ranked = [...alive].sort((left, right) => left.id.localeCompare(right.id));
  const index = Math.abs(stableHash(`hunt:${epoch}:${ranked.length}`)) % ranked.length;

  return ranked[index] ?? null;
}

/** 相容舊名 */
export function pickGangFocusTarget(alive: BumpBody[]): BumpBody | null {
  return pickHuntVictim(alive, 0);
}

function smoothSteer(
  brain: CpuBumpBrain,
  rawX: number,
  rawZ: number,
  blend = 0.38,
): { x: number; z: number } {
  const target = normalizeSteer(rawX, rawZ);
  brain.steerX = brain.steerX * (1 - blend) + target.x * blend;
  brain.steerZ = brain.steerZ * (1 - blend) + target.z * blend;
  return normalizeSteer(brain.steerX, brain.steerZ);
}

function rivalOutward(rival: BumpBody, fallbackAngle: number): { x: number; z: number } {
  const dist = Math.hypot(rival.x, rival.z);

  if (dist < 0.4) {
    return normalizeSteer(Math.cos(fallbackAngle), Math.sin(fallbackAngle));
  }

  return normalizeSteer(rival.x, rival.z);
}

/**
 * CPU 意圖（有腦狀態）：
 * - 1v1：死咬對手往外推，敢衝；邊緣回收／閃躲用滯後，避免抽搐
 * - 3+：集火一人轟下台
 */
export function computeCpuBumpIntent(
  self: BumpBody,
  others: BumpBody[],
  elapsedMs = 0,
  brain: CpuBumpBrain = createCpuBumpBrain(),
): CpuBumpIntent {
  const idle: CpuBumpIntent = {
    steer: { x: 0, z: 0 },
    wantJump: false,
    wantCharge: false,
    wantDefend: false,
  };

  if (!self.alive) {
    return idle;
  }

  const alive = others.filter((body) => body.alive);
  const rivals = alive.filter((body) => body.id !== self.id);
  const selfDist = Math.hypot(self.x, self.z);
  const side = stableSideSign(self.id);
  const slotAngle = (Math.abs(stableHash(self.id)) % 628) / 100;

  if (rivals.length === 0) {
    return idle;
  }

  // ── 閃躲：對手真的在衝自己才進，並鎖一小段時間 ──
  const incoming = rivals.find((rival) => {
    if (!rival.isCharging) {
      return false;
    }

    const dist = Math.hypot(rival.x - self.x, rival.z - self.z);

    if (dist > 2.6) {
      return false;
    }

    const toSelfX = self.x - rival.x;
    const toSelfZ = self.z - rival.z;
    return rival.facingX * toSelfX + rival.facingZ * toSelfZ > 0.15;
  });

  if (incoming && brain.mode !== 'evade') {
    brain.mode = 'evade';
    brain.modeUntilMs = elapsedMs + 420;
  }

  if (brain.mode === 'evade' && elapsedMs < brain.modeUntilMs && incoming) {
    const flee = normalizeSteer(self.x - incoming.x, self.z - incoming.z);
    const tangent = normalizeSteer(-flee.z * side, flee.x * side);
    const canJump = self.jumpMsLeft <= 0 && self.jumpCooldownMs <= 0;
    const steer = smoothSteer(brain, flee.x * 0.35 + tangent.x, flee.z * 0.35 + tangent.z, 0.5);

    return {
      steer,
      wantJump: canJump,
      wantCharge: false,
      wantDefend: !canJump,
    };
  }

  if (brain.mode === 'evade' && elapsedMs >= brain.modeUntilMs) {
    brain.mode = 'drive';
  }

  // ── 1v1：攻擊性對決 ──
  if (rivals.length === 1) {
    const foe = rivals[0];
    const foeDist = Math.hypot(foe.x - self.x, foe.z - self.z) || 1;
    const toFoeX = (foe.x - self.x) / foeDist;
    const toFoeZ = (foe.z - self.z) / foeDist;
    const out = rivalOutward(foe, slotAngle);
    const foeEdge = Math.hypot(foe.x, foe.z);

    // 邊緣回收滯後：進 0.86、出 0.74，避免在邊界抖
    if (brain.mode === 'recover') {
      if (selfDist < BUMP_STAGE_RADIUS * 0.74) {
        brain.mode = 'drive';
      }
    } else if (selfDist > BUMP_STAGE_RADIUS * 0.86 && foeEdge + 0.35 < selfDist) {
      // 自己比對手更外側才回收，正在推人下台時不要逃
      brain.mode = 'recover';
      brain.modeUntilMs = elapsedMs + 500;
    }

    if (brain.mode === 'recover') {
      const inward = normalizeSteer(-self.x, -self.z);
      const tangent = normalizeSteer(-inward.z * side, inward.x * side);
      const steer = smoothSteer(
        brain,
        inward.x * 0.7 + tangent.x * 0.45 + toFoeX * 0.25,
        inward.z * 0.7 + tangent.z * 0.45 + toFoeZ * 0.25,
        0.42,
      );

      return {
        steer,
        wantJump: false,
        wantCharge: false,
        wantDefend: selfDist > BUMP_STAGE_RADIUS * 0.9,
      };
    }

    // 站在對手內側，往台外方向撞
    const insideX = foe.x - out.x * 1.15;
    const insideZ = foe.z - out.z * 1.15;
    const driveX = foe.x + out.x * 2.2;
    const driveZ = foe.z + out.z * 2.2;
    const selfIsInside = selfDist + 0.25 < foeEdge;
    const aimX = selfIsInside || foeDist < 1.7 ? driveX : insideX;
    const aimZ = selfIsInside || foeDist < 1.7 ? driveZ : insideZ;
    const steer = smoothSteer(brain, aimX - self.x, aimZ - self.z, 0.4);
    const aligned = self.facingX * toFoeX + self.facingZ * toFoeZ;

    let wantCharge = false;

    if (elapsedMs < brain.chargeCommitUntilMs) {
      wantCharge = self.chargeCooldownMs <= 0 && !self.isDefending;
    } else if (
      !foe.isDefending
      && !self.isDefending
      && self.chargeCooldownMs <= 0
      && foeDist < 2.7
      && foeDist > 0.5
      && aligned > 0.22
    ) {
      wantCharge = true;
      brain.chargeCommitUntilMs = elapsedMs + 280;
    }

    return {
      steer,
      wantJump: false,
      wantCharge,
      wantDefend: false,
    };
  }

  // ── 3+：集火 ──
  const victim = pickHuntVictim(alive, elapsedMs);

  if (!victim) {
    return idle;
  }

  if (victim.id === self.id) {
    const threatCx = rivals.reduce((sum, rival) => sum + rival.x, 0) / rivals.length;
    const threatCz = rivals.reduce((sum, rival) => sum + rival.z, 0) / rivals.length;
    const flee = normalizeSteer(self.x - threatCx, self.z - threatCz);
    const outward = normalizeSteer(self.x || Math.cos(slotAngle), self.z || Math.sin(slotAngle));
    const steer = smoothSteer(
      brain,
      flee.x * 0.55 + outward.x * 0.55,
      flee.z * 0.55 + outward.z * 0.55,
      0.4,
    );
    const threatDist = Math.hypot(threatCx - self.x, threatCz - self.z);

    return {
      steer,
      wantJump: threatDist < 1.5 && self.jumpCooldownMs <= 0,
      wantCharge: self.chargeCooldownMs <= 0 && threatDist < 1.6,
      wantDefend: true,
    };
  }

  if (selfDist > BUMP_STAGE_RADIUS * 0.88) {
    const inward = normalizeSteer(-self.x, -self.z);
    const steer = smoothSteer(brain, inward.x, inward.z, 0.45);

    return {
      steer,
      wantJump: false,
      wantCharge: false,
      wantDefend: true,
    };
  }

  const out = rivalOutward(victim, slotAngle);
  const toVictimX = victim.x - self.x;
  const toVictimZ = victim.z - self.z;
  const dist = Math.hypot(toVictimX, toVictimZ) || 1;
  const toVx = toVictimX / dist;
  const toVz = toVictimZ / dist;
  const hunterIds = alive
    .filter((body) => body.id !== victim.id)
    .map((body) => body.id)
    .sort((left, right) => left.localeCompare(right));
  const hunterRank = Math.max(0, hunterIds.indexOf(self.id));
  const flankSign = hunterRank % 2 === 0 ? side : -side;
  const driveX = victim.x + out.x * 2.3;
  const driveZ = victim.z + out.z * 2.3;
  const flankX = victim.x - out.x * 0.8 + -out.z * flankSign * 1.2;
  const flankZ = victim.z - out.z * 0.8 + out.x * flankSign * 1.2;
  const useFlank = dist > 2.3 && hunterRank > 0;
  const steer = smoothSteer(
    brain,
    (useFlank ? flankX : driveX) - self.x,
    (useFlank ? flankZ : driveZ) - self.z,
    0.36,
  );
  const aligned = self.facingX * toVx + self.facingZ * toVz;

  let wantCharge = false;

  if (elapsedMs < brain.chargeCommitUntilMs) {
    wantCharge = self.chargeCooldownMs <= 0 && !self.isDefending;
  } else if (
    !victim.isDefending
    && !self.isDefending
    && self.chargeCooldownMs <= 0
    && dist < 2.6
    && dist > 0.55
    && aligned > 0.25
  ) {
    wantCharge = true;
    brain.chargeCommitUntilMs = elapsedMs + 260;
  }

  return {
    steer,
    wantJump: false,
    wantCharge,
    wantDefend: false,
  };
}
