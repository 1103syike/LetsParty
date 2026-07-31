import { useMachine } from '@xstate/vue';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';

import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import type { BouncyBombSnapshot } from '@/minigames/bouncy-bomb';
import { BOUNCY_BOMB_ID } from '@/minigames/bouncy-bomb/bouncy-bomb-id';
import { getMiniGameById, pickRandomMiniGame } from '@/minigames/registry';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import type { RockPaperScissorsSnapshot } from '@/minigames/rock-paper-scissors';
import type { MiniGameDefinition, MiniGameInstance } from '@/minigames/types';
import type { VolleyballSnapshot } from '@/minigames/volleyball';
import { VolleyballGame } from '@/minigames/volleyball/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import {
  partyMachine,
  type PartyMachinePhase,
} from '@/party/party-machine/party-machine';
import { usePartyNetwork } from '@/composables/use-party-network';
import { evaluatePartyRound } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { SessionSnapshotPayload } from '@/types/peer-messages';
import type { PlayerInput, RpsChoice } from '@/types/player-input';

const ROUND_RESULT_AUTO_MS = 3600;
/** 測試模式結算後稍停再回選單 */
const TEST_RETURN_LOBBY_MS = 2200;

function resolveMiniGameDefinition(
  miniGameId: string | null,
  enabledIds?: string[],
): MiniGameDefinition {
  if (miniGameId) {
    const matched = getMiniGameById(miniGameId);

    if (matched) {
      return matched;
    }
  }

  return pickRandomMiniGame(enabledIds);
}

export function usePartySession() {
  const partyStore = usePartyStore();
  const network = usePartyNetwork();
  const { snapshot, send } = useMachine(partyMachine);

  /** shallow：避免 class instance 被 deep reactive 弄丟方法 */
  const miniGameInstance = shallowRef<MiniGameInstance | null>(null);
  const currentDefinition = ref<MiniGameDefinition | null>(null);
  const tickFrameId = ref<number | null>(null);
  const lastTickAt = ref<number | null>(null);
  const roundResultAutoTimeoutId = ref<number | null>(null);
  const lastCrownAwards = ref<Record<string, number>>({});
  const lastRoundResults = ref<Record<string, string>>({});
  const uiTick = ref(0);
  /** Host：本關 loading 已就緒的真人 */
  const introReadyIds = ref<string[]>([]);

  /** 網路訪客：不跑本機 sim，畫面跟 Host snapshot */
  const isNetworkGuest = computed(
    () => !partyStore.isHost && !partyStore.isTestMode,
  );

  const localPhase = computed(
    (): PartyMachinePhase => snapshot.value.value as PartyMachinePhase,
  );

  const phase = computed((): PartyMachinePhase => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.phase as PartyMachinePhase;
    }

    return localPhase.value;
  });

  const roundIndex = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.roundIndex;
    }

    return snapshot.value.context.roundIndex;
  });

  const lastRankings = computed(() => snapshot.value.context.lastRankings);

  const winnerIds = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.winnerIds;
    }

    return snapshot.value.context.winnerIds;
  });

  const isSuddenDeath = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.isSuddenDeath;
    }

    return snapshot.value.context.isSuddenDeath;
  });

  const currentGameId = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote?.gameId) {
      return remote.gameId;
    }

    return currentDefinition.value?.id ?? null;
  });

  const liveScores = computed((): Record<string, number> => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.liveScores;
    }

    return miniGameInstance.value?.getScores?.() ?? {};
  });

  const displayLastCrownAwards = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.lastCrownAwards;
    }

    return lastCrownAwards.value;
  });

  const displayLastRoundResults = computed(() => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.lastRoundResults;
    }

    return lastRoundResults.value;
  });

  const rpsSnapshot = computed((): RockPaperScissorsSnapshot | null => {
    uiTick.value;
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value) {
      if (remote?.gameId !== ROCK_PAPER_SCISSORS_ID) {
        return null;
      }

      return (remote.gameSnapshot as RockPaperScissorsSnapshot | null) ?? null;
    }

    if (currentGameId.value !== ROCK_PAPER_SCISSORS_ID || !miniGameInstance.value?.getGameSnapshot) {
      return null;
    }

    return miniGameInstance.value.getGameSnapshot() as RockPaperScissorsSnapshot;
  });

  const arenaBumpSnapshot = computed((): ArenaBumpSnapshot | null => {
    uiTick.value;
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value) {
      if (remote?.gameId !== ARENA_BUMP_ID) {
        return null;
      }

      return (remote.gameSnapshot as ArenaBumpSnapshot | null) ?? null;
    }

    const instance = miniGameInstance.value;

    if (currentGameId.value !== ARENA_BUMP_ID || !instance) {
      return null;
    }

    if (typeof instance.getGameSnapshot !== 'function') {
      return null;
    }

    return instance.getGameSnapshot() as ArenaBumpSnapshot;
  });

  const volleyballSnapshot = computed((): VolleyballSnapshot | null => {
    uiTick.value;
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value) {
      if (remote?.gameId !== VOLLEYBALL_ID) {
        return null;
      }

      return (remote.gameSnapshot as VolleyballSnapshot | null) ?? null;
    }

    const instance = miniGameInstance.value;

    if (currentGameId.value !== VOLLEYBALL_ID || !instance?.getGameSnapshot) {
      return null;
    }

    return instance.getGameSnapshot() as VolleyballSnapshot;
  });

  const bouncyBombSnapshot = computed((): BouncyBombSnapshot | null => {
    uiTick.value;
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value) {
      if (remote?.gameId !== BOUNCY_BOMB_ID) {
        return null;
      }

      return (remote.gameSnapshot as BouncyBombSnapshot | null) ?? null;
    }

    const instance = miniGameInstance.value;

    if (currentGameId.value !== BOUNCY_BOMB_ID || !instance?.getGameSnapshot) {
      return null;
    }

    return instance.getGameSnapshot() as BouncyBombSnapshot;
  });

  const displayIntroReadyIds = computed((): string[] => {
    const remote = network.remoteSession.value;

    if (isNetworkGuest.value && remote) {
      return remote.introReadyIds ?? [];
    }

    return introReadyIds.value;
  });

  const introReadyTotal = computed(
    () => partyStore.participants.filter((participant) => participant.kind === 'human').length,
  );

  const introReadyCount = computed(() => displayIntroReadyIds.value.length);

  const hasLocalIntroReady = computed(() => {
    const localId = partyStore.localParticipantId;

    return Boolean(localId && displayIntroReadyIds.value.includes(localId));
  });

  function clearIntroReady(): void {
    introReadyIds.value = [];
  }

  function buildHostSessionSnapshot(viewerId: string | null): SessionSnapshotPayload {
    return {
      phase: localPhase.value,
      roundIndex: snapshot.value.context.roundIndex,
      winnerIds: [...snapshot.value.context.winnerIds],
      isSuddenDeath: snapshot.value.context.isSuddenDeath,
      gameId: currentDefinition.value?.id ?? null,
      gameName: currentDefinition.value?.name ?? '',
      gameRules: currentDefinition.value?.rules ?? '',
      liveScores: miniGameInstance.value?.getScores?.() ?? {},
      lastCrownAwards: { ...lastCrownAwards.value },
      lastRoundResults: { ...lastRoundResults.value },
      introReadyIds: [...introReadyIds.value],
      gameSnapshot: miniGameInstance.value?.getGameSnapshot?.(viewerId) ?? null,
    };
  }

  function publishHostSession(): void {
    if (!partyStore.isHost || partyStore.isTestMode) {
      return;
    }

    if (localPhase.value === 'lobby') {
      return;
    }

    network.publishSessionSnapshot((viewerId) => buildHostSessionSnapshot(viewerId));
  }
  function clearRoundResultAutoAdvance(): void {
    if (roundResultAutoTimeoutId.value !== null) {
      window.clearTimeout(roundResultAutoTimeoutId.value);
      roundResultAutoTimeoutId.value = null;
    }
  }

  function scheduleRoundResultAutoAdvance(): void {
    clearRoundResultAutoAdvance();

    if (
      currentGameId.value !== ROCK_PAPER_SCISSORS_ID
      && currentGameId.value !== ARENA_BUMP_ID
      && currentGameId.value !== VOLLEYBALL_ID
      && currentGameId.value !== BOUNCY_BOMB_ID
    ) {
      return;
    }

    // 測試模式：看完結算就回選遊戲，不連戰
    if (partyStore.isTestMode) {
      roundResultAutoTimeoutId.value = window.setTimeout(() => {
        roundResultAutoTimeoutId.value = null;
        returnToTestLobby();
      }, TEST_RETURN_LOBBY_MS);
      return;
    }

    roundResultAutoTimeoutId.value = window.setTimeout(() => {
      roundResultAutoTimeoutId.value = null;
      acknowledgeRoundResult();
    }, ROUND_RESULT_AUTO_MS);
  }

  function stopTickLoop(): void {
    if (tickFrameId.value !== null) {
      cancelAnimationFrame(tickFrameId.value);
      tickFrameId.value = null;
    }

    lastTickAt.value = null;
  }

  function disposeMiniGame(): void {
    stopTickLoop();
    miniGameInstance.value?.dispose();
    miniGameInstance.value = null;
  }

  function captureRoundOutcome(instance: MiniGameInstance, rankings: string[]): void {
    lastCrownAwards.value = instance.getCrownAwards?.(rankings) ?? {
      [rankings[0]]: 1,
    };
    lastRoundResults.value = instance.getRoundResults?.() ?? {};
  }

  function startTickLoop(): void {
    stopTickLoop();

    const tick = (timestamp: number): void => {
      const instance = miniGameInstance.value;

      if (!instance) {
        return;
      }

      if (lastTickAt.value === null) {
        lastTickAt.value = timestamp;
      }

      const deltaMs = timestamp - lastTickAt.value;
      lastTickAt.value = timestamp;

      for (const participant of partyStore.participants) {
        if (participant.kind === 'cpu' && instance.getCpuInput) {
          const input = instance.getCpuInput(participant.id, deltaMs);
          instance.onPlayerInput(participant.id, input);
        }
      }

      instance.onTick(deltaMs);
      uiTick.value += 1;
      publishHostSession();

      if (instance.isFinished()) {
        stopTickLoop();
        const rankings = instance.getRankings();
        captureRoundOutcome(instance, rankings);
        send({
          type: 'MINIGAME_COMPLETE',
          rankings,
        });
        publishHostSession();
        return;
      }

      tickFrameId.value = requestAnimationFrame(tick);
    };

    tickFrameId.value = requestAnimationFrame(tick);
  }

  function mountMiniGame(definition: MiniGameDefinition): void {
    disposeMiniGame();
    currentDefinition.value = definition;
    miniGameInstance.value = definition.create(
      partyStore.participants,
      partyStore.localParticipantId,
      {
        skipOpeningCountdown: partyStore.isTestMode,
      },
    );
    miniGameInstance.value.start();
    startTickLoop();
  }

  /** loading 完成：登記就緒；全員就緒後 Host 才進對戰 */
  function completeIntro(participantId?: string | null): void {
    if (isNetworkGuest.value) {
      network.sendSessionAction('intro-ready');
      return;
    }

    if (localPhase.value !== 'miniGameIntro' && localPhase.value !== 'suddenDeathIntro') {
      return;
    }

    // 測試模式：跳過全員等待
    if (partyStore.isTestMode) {
      clearIntroReady();
      send({ type: 'INTRO_COMPLETE' });
      return;
    }

    const id = participantId ?? partyStore.localParticipantId;

    if (!id) {
      return;
    }

    if (!introReadyIds.value.includes(id)) {
      introReadyIds.value = [...introReadyIds.value, id];
      publishHostSession();
    }

    const humans = partyStore.participants.filter((participant) => participant.kind === 'human');
    const allReady = humans.length > 0
      && humans.every((human) => introReadyIds.value.includes(human.id));

    if (!allReady) {
      return;
    }

    clearIntroReady();
    send({ type: 'INTRO_COMPLETE' });
    publishHostSession();
  }

  function startParty(): string | null {
    if (!partyStore.isHost || partyStore.participants.length === 0) {
      return null;
    }

    if (!partyStore.isTestMode && !partyStore.allHumansReady) {
      return null;
    }

    partyStore.fillCpuParticipants();
    clearIntroReady();

    const definition = pickRandomMiniGame(partyStore.settings.enabledMiniGameIds);

    send({ type: 'START_PARTY', miniGameId: definition.id });
    publishHostSession();
    return definition.id;
  }

  /** Guest：不開本機 sim，只跟 Host snapshot */
  function startPartyAsGuest(miniGameId: string): void {
    if (partyStore.isHost || partyStore.isTestMode) {
      return;
    }

    partyStore.markRemotePartyStarted();
    currentDefinition.value = resolveMiniGameDefinition(
      miniGameId,
      partyStore.settings.enabledMiniGameIds,
    );
  }

  /** 測試模式：指定遊戲開打一局 */
  function startTestGame(miniGameId: string): void {
    if (!partyStore.isHost || !partyStore.isTestMode || partyStore.participants.length === 0) {
      return;
    }

    const definition = getMiniGameById(miniGameId);

    if (!definition) {
      return;
    }

    partyStore.fillCpuParticipants();
    partyStore.resetMatchProgress();
    send({ type: 'START_PARTY', miniGameId: definition.id });
  }

  /** 測試模式：一局結束回選遊戲 */
  function returnToTestLobby(): void {
    if (!partyStore.isTestMode) {
      return;
    }

    clearRoundResultAutoAdvance();
    disposeMiniGame();
    currentDefinition.value = null;
    lastCrownAwards.value = {};
    lastRoundResults.value = {};
    partyStore.resetMatchProgress();
    send({ type: 'RETURN_TO_LOBBY' });
  }

  function sendJoystickInput(x: number, y: number): void {
    const localId = partyStore.localParticipantId;
    const input = { type: 'joystick' as const, x, y };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(input);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, input);
  }

  function sendArenaInput(input: {
    x: number;
    y: number;
    jump: boolean;
    charge: boolean;
    defend: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = {
      type: 'arena',
      x: input.x,
      y: input.y,
      jump: input.jump,
      charge: input.charge,
      defend: input.defend,
      aimX: input.aimX,
      aimZ: input.aimZ,
    };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
  }

  function sendVolleyballInput(input: {
    x: number;
    y: number;
    jump: boolean;
    bump: boolean;
    set: boolean;
    spike: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = {
      type: 'volleyball',
      x: input.x,
      y: input.y,
      jump: input.jump,
      bump: input.bump,
      set: input.set,
      spike: input.spike,
      aimX: input.aimX,
      aimZ: input.aimZ,
    };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
  }

  function sendBouncyBombInput(input: {
    x: number;
    y: number;
    jump: boolean;
    throwBomb: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = {
      type: 'bouncy-bomb',
      x: input.x,
      y: input.y,
      jump: input.jump,
      throwBomb: input.throwBomb,
      aimX: input.aimX,
      aimZ: input.aimZ,
    };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
  }

  function sendLocalMash(): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = { type: 'mash' };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
    uiTick.value += 1;
  }

  function sendRpsChoice(choice: RpsChoice): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = { type: 'rps', choice };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
    uiTick.value += 1;
  }

  function applyRemotePlayerInput(participantId: string, input: PlayerInput): void {
    if (!partyStore.isHost || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(participantId, input);
    uiTick.value += 1;
  }

  function sendRpsClaim(choice: RpsChoice): void {
    const localId = partyStore.localParticipantId;
    const payload: PlayerInput = { type: 'rps-claim', choice };

    if (!partyStore.isHost && !partyStore.isTestMode) {
      network.sendPlayerInput(payload);
      return;
    }

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, payload);
    uiTick.value += 1;
  }

  function acknowledgeRoundResult(): void {
    if (isNetworkGuest.value) {
      network.sendSessionAction('result-ack');
      return;
    }

    if (localPhase.value !== 'roundResult' && localPhase.value !== 'partyEnd') {
      return;
    }

    const outcome = evaluatePartyRound(
      partyStore.participants,
      partyStore.settings.targetCrowns,
      roundIndex.value,
      partyStore.settings.maxRounds ?? 20,
    );
    const nextDefinition = pickRandomMiniGame(partyStore.settings.enabledMiniGameIds);

    if (outcome.type === 'end') {
      send({
        type: 'RESULT_ACK',
        outcome: 'end',
        winnerIds: outcome.winnerIds,
      });
      publishHostSession();
      return;
    }

    if (outcome.type === 'suddenDeath') {
      send({
        type: 'RESULT_ACK',
        outcome: 'suddenDeath',
        miniGameId: nextDefinition.id,
      });
      publishHostSession();
      return;
    }

    send({
      type: 'RESULT_ACK',
      outcome: 'continue',
      miniGameId: nextDefinition.id,
    });
    publishHostSession();
  }

  watch(
    () => network.remoteSession.value,
    (remote) => {
      if (!isNetworkGuest.value || !remote) {
        return;
      }

      uiTick.value += 1;

      if (remote.gameId) {
        currentDefinition.value = resolveMiniGameDefinition(
          remote.gameId,
          partyStore.settings.enabledMiniGameIds,
        );
      }
    },
  );

  watch(phase, (nextPhase) => {
    // Guest 只跟 snapshot，不開本機 XState／minigame
    if (isNetworkGuest.value) {
      return;
    }

    if (nextPhase === 'roundResult') {
      partyStore.applyRoundCrowns(lastCrownAwards.value);

      if (partyStore.isHost && !partyStore.isTestMode) {
        network.broadcastRoom();
      }

      scheduleRoundResultAutoAdvance();
    } else {
      clearRoundResultAutoAdvance();
    }

    if (nextPhase === 'miniGameIntro' || nextPhase === 'suddenDeathIntro') {
      clearIntroReady();
      disposeMiniGame();
      currentDefinition.value = resolveMiniGameDefinition(
        snapshot.value.context.currentMiniGameId,
        partyStore.settings.enabledMiniGameIds,
      );
      publishHostSession();
      return;
    }

    if (nextPhase === 'miniGamePlay') {
      const definition = resolveMiniGameDefinition(
        snapshot.value.context.currentMiniGameId,
        partyStore.settings.enabledMiniGameIds,
      );
      mountMiniGame(definition);
      publishHostSession();
      return;
    }

    if (nextPhase === 'roundResult' || nextPhase === 'partyEnd' || nextPhase === 'lobby') {
      disposeMiniGame();
      publishHostSession();
    }
  });

  onScopeDispose(() => {
    clearRoundResultAutoAdvance();
    disposeMiniGame();
    if (import.meta.env.DEV) {
      delete (window as Window & { __vbDebug?: unknown }).__vbDebug;
    }
  });

  // 開發用：強制出界，方便驗中央提示／音效
  if (import.meta.env.DEV) {
    (window as Window & {
      __vbDebug?: { forceOut: () => void };
    }).__vbDebug = {
      forceOut: () => {
        const game = miniGameInstance.value;

        if (game instanceof VolleyballGame) {
          game.debugForceOut();
        }
      },
    };
  }

  return {
    phase,
    roundIndex,
    lastRankings,
    winnerIds,
    isSuddenDeath,
    currentDefinition,
    currentGameId,
    liveScores,
    lastCrownAwards: displayLastCrownAwards,
    lastRoundResults: displayLastRoundResults,
    rpsSnapshot,
    arenaBumpSnapshot,
    volleyballSnapshot,
    bouncyBombSnapshot,
    introReadyCount,
    introReadyTotal,
    hasLocalIntroReady,
    startParty,
    startPartyAsGuest,
    startTestGame,
    returnToTestLobby,
    completeIntro,
    sendLocalMash,
    sendRpsChoice,
    sendRpsClaim,
    sendJoystickInput,
    sendArenaInput,
    sendVolleyballInput,
    sendBouncyBombInput,
    applyRemotePlayerInput,
    acknowledgeRoundResult,
  };
}
