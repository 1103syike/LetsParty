/**
 * 排球出界歸責／撞網假回擊探針（完整幀鏈）
 * 用法：npm run probe:vb-out-trace
 */
import { VolleyballGame } from '../src/minigames/volleyball/volleyball.ts';
import type { Participant } from '../src/types/party.ts';

const NET = 0.12;
const CLOSE = 0.35;
const FAR = 1.2;

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
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
}

function freshGame(): {
  game: VolleyballGame;
  local: { id: string; teamId: 'a' | 'b' };
  cpuAlly: { id: string; teamId: 'a' | 'b' };
  cpuOpp: { id: string; teamId: 'a' | 'b' };
} {
  const game = new VolleyballGame(makeParticipants(), 'p0');
  game.start();
  const players = game.debugListPlayers();
  const local = players.find((player) => player.isLocal);
  const cpuAlly = players.find(
    (player) => !player.isLocal && player.teamId === local?.teamId,
  );
  const cpuOpp = players.find(
    (player) => !player.isLocal && player.teamId !== local?.teamId,
  );

  if (!local || !cpuAlly || !cpuOpp) {
    throw new Error('need local + ally + opp');
  }

  return { game, local, cpuAlly, cpuOpp };
}

function run(): void {
  const results: CaseResult[] = [];

  // --- 1) 本機過網後 CPU 貼身回擊，出界應歸責 CPU ---
  {
    const { game, local, cpuOpp } = freshGame();
    game.debugClearHitTrace();
    const sideLocal = local.teamId === 'a' ? -1 : 1;
    const sideOpp = -sideLocal;

    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: sideLocal * (NET + 1.2) },
      ball: { x: 0, y: 1.1, z: sideLocal * (NET + 1.2 - CLOSE) },
      possessionTeam: cpuOpp.teamId,
    });
    const localHit = game.debugTryHit(local.id, 'bump');

    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: sideOpp * (NET + 1.2) },
      ball: { x: 0, y: 1.1, z: sideOpp * (NET + 1.2 - CLOSE) },
      possessionTeam: local.teamId,
    });
    // 再擺一次，避免上一球殘留 serveLock／missPlan 偶發擋掉 CPU
    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: sideOpp * (NET + 1.2) },
      ball: { x: 0, y: 1.1, z: sideOpp * (NET + 1.2 - CLOSE) },
      possessionTeam: local.teamId,
    });
    const cpuHit = game.debugTryHit(cpuOpp.id, 'bump');
    const out = game.debugForceOutCurrent();
    const commits = game.debugDumpHitTrace().filter((entry) => entry.kind === 'commitHit');

    assertCase(
      'cpu_return_out_blames_cpu',
      localHit.didHit
        && cpuHit.didHit
        && out.outPlayerId === cpuOpp.id
        && commits.some((entry) => entry.actorId === cpuOpp.id),
      `out=${out.outPlayerId} fx=${out.scoreFxKind} localHit=${localHit.didHit} cpuHit=${cpuHit.didHit}`,
      results,
    );
  }

  // --- 2) 本機擊球後無人 commit，出界歸責本機 ---
  {
    const { game, local, cpuOpp } = freshGame();
    const side = local.teamId === 'a' ? -1 : 1;

    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: side * (NET + 1.5) },
      ball: { x: 0, y: 1.1, z: side * (NET + 1.5 - CLOSE) },
      possessionTeam: cpuOpp.teamId,
    });
    const hit = game.debugTryHit(local.id, 'bump');
    const out = game.debugForceOutCurrent();

    assertCase(
      'local_only_out_blames_local',
      hit.didHit && out.outPlayerId === local.id && out.scoreFxKind === 'out',
      `out=${out.outPlayerId} fx=${out.scoreFxKind} didHit=${hit.didHit}`,
      results,
    );
  }

  // --- 3) 打進網帶 → 撞網 → 出界：有 netBounce、無 CPU commit、net-out ---
  {
    const { game, local, cpuOpp } = freshGame();
    game.debugClearHitTrace();
    const side = local.teamId === 'a' ? -1 : 1;
    const towardOpp = -side;

    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: side * (NET + 1.8) },
      ball: { x: 0, y: 1.1, z: side * (NET + 1.8 - CLOSE) },
      possessionTeam: cpuOpp.teamId,
    });
    const hit = game.debugTryHit(local.id, 'bump');

    game.debugInjectBallFlight({
      x: 0,
      y: 1.4,
      z: side * 0.08,
      vx: 0,
      vy: -0.2,
      vz: towardOpp * 6,
      active: true,
    });

    let sawNet = false;
    for (let frame = 0; frame < 40; frame += 1) {
      game.onTick(16);
      if (game.debugDumpHitTrace().some((entry) => entry.kind === 'netBounce')) {
        sawNet = true;
        break;
      }
      if (game.getGameSnapshot().phase === 'pointPause') {
        break;
      }
    }

    const snap = game.getGameSnapshot();
    let outPlayerId = snap.outPlayerId;
    let scoreFxKind = snap.scoreFxKind;

    if (snap.phase !== 'pointPause') {
      const forced = game.debugForceOutCurrent();
      outPlayerId = forced.outPlayerId;
      scoreFxKind = forced.scoreFxKind;
    }

    const cpuCommits = game.debugDumpHitTrace().filter(
      (entry) => entry.kind === 'commitHit' && entry.actorId !== local.id,
    );

    assertCase(
      'net_bounce_out_no_cpu_commit',
      hit.didHit
        && sawNet
        && outPlayerId === local.id
        && scoreFxKind === 'net-out'
        && cpuCommits.length === 0,
      `sawNet=${sawNet} out=${outPlayerId} fx=${scoreFxKind} cpuCommits=${cpuCommits.length}`,
      results,
    );
  }

  // --- 4) CPU 離球遠：排隊 bump + 完整 tick → 不可新增 hitSerial ---
  {
    const { game, local, cpuOpp } = freshGame();
    const side = cpuOpp.teamId === 'a' ? -1 : 1;
    const ballZ = side * (NET + 0.8);

    game.debugSetupHitScene({
      hitterId: cpuOpp.id,
      hitter: { x: 0, z: ballZ + side * FAR },
      ball: { x: 0, y: 1.2, z: ballZ },
      possessionTeam: local.teamId,
    });
    const before = game.getGameSnapshot().hitSerial;
    game.onPlayerInput(cpuOpp.id, {
      type: 'volleyball',
      x: 0,
      y: 0,
      jump: false,
      bump: true,
      set: false,
      spike: false,
    });
    game.onTick(16);
    game.onTick(16);
    const after = game.getGameSnapshot().hitSerial;

    assertCase(
      'cpu_far_queue_no_commit',
      after === before,
      `hitSerial ${before}→${after}`,
      results,
    );
  }

  // --- 5) 本機殺球應能過網（不被幀尾 y 誤卡）---
  {
    const { game, local, cpuOpp } = freshGame();
    game.debugClearHitTrace();
    const side = local.teamId === 'a' ? -1 : 1;
    const oppSign = -side;

    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, y: 0.9, z: side * (NET + 1.6) },
      ball: { x: 0, y: 1.8, z: side * (NET + 1.6 - CLOSE) },
      possessionTeam: cpuOpp.teamId,
    });
    // 對準對方半場深處
    game.onPlayerInput(local.id, {
      type: 'volleyball',
      x: 0,
      y: 0,
      jump: true,
      bump: false,
      set: false,
      spike: true,
      aimX: 0,
      aimZ: oppSign * 4.5,
    });
    // 清掉 hold，直接 tryHit 殺球
    const spikeHit = game.debugTryHit(local.id, 'spike');
    let crossedToOpp = false;
    let sawNet = false;

    for (let frame = 0; frame < 90; frame += 1) {
      game.onTick(16);
      const snap = game.getGameSnapshot();
      if (snap.ball.z * oppSign > NET + 0.3) {
        crossedToOpp = true;
        break;
      }
      if (game.debugDumpHitTrace().some((entry) => entry.kind === 'netBounce')) {
        sawNet = true;
        break;
      }
      if (snap.phase === 'pointPause') {
        break;
      }
    }

    assertCase(
      'local_spike_clears_net',
      spikeHit.didHit && crossedToOpp && !sawNet,
      `didHit=${spikeHit.didHit} crossed=${crossedToOpp} net=${sawNet}`,
      results,
    );
  }

  // --- 6) 撞網後球留在來球側、不高彈假回擊 ---
  {
    const { game, local, cpuOpp } = freshGame();
    const side = local.teamId === 'a' ? -1 : 1;
    const towardOpp = -side;

    game.debugSetupHitScene({
      hitterId: local.id,
      hitter: { x: 0, z: side * (NET + 1.8) },
      ball: { x: 0, y: 1.1, z: side * (NET + 1.8 - CLOSE) },
      possessionTeam: cpuOpp.teamId,
    });
    game.debugTryHit(local.id, 'bump');
    game.debugInjectBallFlight({
      x: 0,
      y: 1.4,
      z: side * 0.08,
      vx: 0,
      vy: 1.0,
      vz: towardOpp * 8,
      active: true,
    });

    let bounceVz: number | null = null;
    let bounceVy: number | null = null;
    for (let frame = 0; frame < 40; frame += 1) {
      game.onTick(16);
      if (game.debugDumpHitTrace().some((entry) => entry.kind === 'netBounce')) {
        const vel = game.debugBallVelocity();
        bounceVz = vel.vz;
        bounceVy = vel.vy;
        break;
      }
      if (game.getGameSnapshot().phase === 'pointPause') {
        break;
      }
    }

    const staysOnAttackerSide = bounceVz != null && Math.sign(bounceVz || side) === side;
    const notRocket = bounceVy != null && bounceVy < 2.5;

    assertCase(
      'net_bounce_no_fake_return',
      bounceVz != null && staysOnAttackerSide && notRocket,
      `vz=${bounceVz?.toFixed(2)} vy=${bounceVy?.toFixed(2)} side=${side}`,
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

  console.log('classify: netBounce fake-return path covered; out attribution uses last commit');
}

run();
