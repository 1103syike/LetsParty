/**
 * 排球 CPU 擊球探針：自動取證／回歸（不需開瀏覽器）
 * 用法：npm run probe:vb-cpu-hit
 *
 * 歸類（腳本斷言對應）：
 * - 接觸：遠拒／近允／貼網遠 xz 拒／CPU 嚴於本機
 * - 瞬移：貼身擊球後 ball 位移不可暴增
 * - emergency：遠拒／近允（與 tryHit 同一實心距離）
 */
import { VolleyballGame } from '../src/minigames/volleyball/volleyball.ts';
import type { Participant } from '../src/types/party.ts';

const NET = 0.12;
/** 貼身期望可打；比 VB_CPU_SOLID_CONTACT(≈0.43) 略緊 */
const CLOSE = 0.35;
/** 明顯隔空 */
const FAR = 1.2;
/** 擊球後球心相對角色允許的最大位移（禁瞬移） */
const MAX_SHIFT_AFTER_HIT = 0.55;

function makeParticipants(): Participant[] {
  const colors = ['player-1', 'player-2', 'player-3', 'player-4'] as const;
  const animals = ['cat', 'dog', 'sheep', 'wolf'] as const;

  return [0, 1, 2, 3].map((index) => ({
    id: `p${index}`,
    displayName: `P${index}`,
    kind: index === 0 ? 'human' : 'cpu',
    color: colors[index],
    animalId: animals[index],
    crownCount: 0,
  }));
}

interface CaseResult {
  name: string;
  pass: boolean;
  detail: string;
}

function assertCase(
  name: string,
  pass: boolean,
  detail: string,
  results: CaseResult[],
): void {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

function run(): void {
  const results: CaseResult[] = [];
  const game = new VolleyballGame(makeParticipants(), 'p0');
  game.start();

  const players = game.debugListPlayers();
  const local = players.find((player) => player.isLocal);

  if (!local) {
    throw new Error('no local player');
  }

  const cpuAlly = players.find(
    (player) => !player.isLocal && player.teamId === local.teamId,
  );
  const cpuOpp = players.find(
    (player) => !player.isLocal && player.teamId !== local.teamId,
  );

  if (!cpuAlly || !cpuOpp) {
    throw new Error('need ally + opponent CPU');
  }

  console.log('solidContact threshold will be reported per hit');
  console.log('local', local.id, local.teamId);
  console.log('ally', cpuAlly.id, cpuAlly.teamId);
  console.log('opp', cpuOpp.id, cpuOpp.teamId);

  // --- 1) CPU 隔空 bump：應失敗 ---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 0.8);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ + side * FAR },
      ball: { x: 0, z: ballZ },
      possessionTeam: local.teamId,
    });
    const hit = game.debugTryHit(cpuOpp.id, 'bump');
    assertCase(
      'cpu_far_bump_rejected',
      hit.didHit === false,
      `didHit=${hit.didHit} dist=${hit.distBefore.toFixed(3)} solid=${hit.solidContact.toFixed(3)} owner=${hit.ownerId}`,
      results,
    );
  }

  // --- 2) CPU 貼身 bump：應成功（允許直擊）---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 1.2);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ - side * CLOSE },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: local.teamId,
    });
    const hit = game.debugTryHit(cpuOpp.id, 'bump');
    const shift = Math.hypot(
      hit.ballAfter.x - hit.ballBefore.x,
      hit.ballAfter.z - hit.ballBefore.z,
    );
    assertCase(
      'cpu_close_bump_allowed',
      hit.didHit === true && hit.distBefore <= hit.solidContact + 0.02,
      `didHit=${hit.didHit} dist=${hit.distBefore.toFixed(3)} shiftXZ=${shift.toFixed(3)} owner=${hit.ownerId}`,
      results,
    );
  }

  // --- 3) CPU 貼身 set：應成功 ---
  {
    const side = cpuAlly.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 1.2);
    game.debugSetupHitScene({
      hitterId: cpuAlly.id,
      hitter: { x: 0, z: ballZ - side * CLOSE },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: cpuOpp.teamId,
    });
    const hit = game.debugTryHit(cpuAlly.id, 'set');
    assertCase(
      'cpu_close_set_allowed',
      hit.didHit === true,
      `didHit=${hit.didHit} dist=${hit.distBefore.toFixed(3)} owner=${hit.ownerId}`,
      results,
    );
  }

  // --- 4) 本機略寬距離仍可打（local reach，不解本機）---
  {
    const side = local.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 1.2);
    // local reach ≈ 0.46+0.24+0.16 = 0.86；取 0.70 本機應可、CPU 實心不可
    const localReachDist = 0.7;
    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: ballZ - side * localReachDist },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: cpuOpp.teamId,
    });
    const hit = game.debugTryHit(local.id, 'bump');
    assertCase(
      'local_mid_reach_allowed',
      hit.didHit === true,
      `didHit=${hit.didHit} dist=${hit.distBefore.toFixed(3)}`,
      results,
    );
  }

  // --- 5) 貼網剛過網 + CPU 站網邊但離球遠：應失敗 ---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 0.15);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 2.5, z: side * (NET + 0.9) },
      ball: { x: 0, y: 1.4, z: ballZ },
      possessionTeam: local.teamId,
    });
    const hit = game.debugTryHit(cpuOpp.id, 'bump');
    assertCase(
      'cpu_near_net_but_far_xz_rejected',
      hit.didHit === false,
      `didHit=${hit.didHit} dist=${hit.distBefore.toFixed(3)}`,
      results,
    );
  }

  // --- 6) 貼身擊球後球不可大瞬移 ---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 1.5);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ - side * CLOSE },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: local.teamId,
    });
    const hit = game.debugTryHit(cpuOpp.id, 'bump');
    const shift = Math.hypot(
      hit.ballAfter.x - hit.ballBefore.x,
      hit.ballAfter.z - hit.ballBefore.z,
    );
    assertCase(
      'cpu_hit_no_teleport',
      hit.didHit === true && shift <= MAX_SHIFT_AFTER_HIT,
      `didHit=${hit.didHit} shiftXZ=${shift.toFixed(3)} max=${MAX_SHIFT_AFTER_HIT}`,
      results,
    );
  }

  // --- 7) 緊急救球：離太遠不可命中 ---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 2);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ + side * FAR },
      ball: { x: 0, y: 0.45, z: ballZ },
      possessionTeam: local.teamId,
      forEmergency: true,
    });
    // 本機拉開：debugSetup 已把非 hitter 拉遠；owner 應是離球近的——但 hitter 很遠
    // 再把 ally on opp team... only one opp might be owner if closer after setup
    // 把另一個同隊也拉開已做；owner 會是較近的那個 opp。我們把兩個 opp 都弄遠：
    const otherOpp = game.debugListPlayers().find(
      (player) => player.teamId === cpuOpp.teamId && player.id !== cpuOpp.id,
    );
    if (otherOpp) {
      game.debugSetupHitScene({
        hitterId: cpuOpp.id,
        hitter: { x: 0, z: ballZ + side * FAR },
        ball: { x: 0, y: 0.45, z: ballZ },
        possessionTeam: local.teamId,
        forEmergency: true,
      });
    }
    const emerg = game.debugTryEmergency();
    assertCase(
      'emergency_far_rejected',
      emerg.didHit === false,
      `didHit=${emerg.didHit} distBefore=${Number.isFinite(emerg.distBefore) ? emerg.distBefore.toFixed(3) : 'inf'}`,
      results,
    );
  }

  // --- 8) 緊急救球：貼身可救 ---
  {
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 2);
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ - side * CLOSE },
      ball: { x: 0, y: 0.45, z: ballZ },
      possessionTeam: local.teamId,
      forEmergency: true,
    });
    const emerg = game.debugTryEmergency();
    assertCase(
      'emergency_close_allowed',
      emerg.didHit === true,
      `didHit=${emerg.didHit} distBefore=${emerg.distBefore.toFixed(3)} kind=${emerg.lastHitKind}`,
      results,
    );
  }

  // --- 9) 同距離：CPU 實心拒、本機可（對照）---
  {
    const side = local.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 1.2);
    const mid = 0.65;
    game.debugSetupHitScene({
      hitterId: cpuAlly.id,
      hitter: { x: 0, z: ballZ - side * mid },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: cpuOpp.teamId,
    });
    const cpuHit = game.debugTryHit(cpuAlly.id, 'bump');
    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: ballZ - side * mid },
      ball: { x: 0, y: 1.1, z: ballZ },
      possessionTeam: cpuOpp.teamId,
    });
    const localHit = game.debugTryHit(local.id, 'bump');
    assertCase(
      'cpu_solid_stricter_than_local',
      cpuHit.didHit === false && localHit.didHit === true,
      `cpuDid=${cpuHit.didHit}(d=${cpuHit.distBefore.toFixed(2)}) localDid=${localHit.didHit}(d=${localHit.distBefore.toFixed(2)})`,
      results,
    );
  }

  const failed = results.filter((entry) => !entry.pass);
  console.log('');
  console.log(`done: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    console.log('FAILED:');
    for (const entry of failed) {
      console.log(` - ${entry.name}: ${entry.detail}`);
    }
    process.exit(1);
  }
}

run();
