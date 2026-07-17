import { useMachine } from '@xstate/vue';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';

import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { getMiniGameById, pickRandomMiniGame } from '@/minigames/registry';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import type { RockPaperScissorsSnapshot } from '@/minigames/rock-paper-scissors';
import type { MiniGameDefinition, MiniGameInstance } from '@/minigames/types';
import type { VolleyballSnapshot } from '@/minigames/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import {
  partyMachine,
  type PartyMachinePhase,
} from '@/party/party-machine/party-machine';
import { evaluatePartyRound } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { RpsChoice } from '@/types/player-input';

const INTRO_COUNTDOWN_SECONDS = 3;
const ROUND_RESULT_AUTO_MS = 3600;

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
  const { snapshot, send } = useMachine(partyMachine);

  /** shallow：避免 class instance 被 deep reactive 弄丟方法 */
  const miniGameInstance = shallowRef<MiniGameInstance | null>(null);
  const currentDefinition = ref<MiniGameDefinition | null>(null);
  const introSecondsLeft = ref(INTRO_COUNTDOWN_SECONDS);
  const tickFrameId = ref<number | null>(null);
  const lastTickAt = ref<number | null>(null);
  const introIntervalId = ref<number | null>(null);
  const roundResultAutoTimeoutId = ref<number | null>(null);
  const lastCrownAwards = ref<Record<string, number>>({});
  const lastRoundResults = ref<Record<string, string>>({});
  const uiTick = ref(0);

  const phase = computed((): PartyMachinePhase => snapshot.value.value as PartyMachinePhase);

  const roundIndex = computed(() => snapshot.value.context.roundIndex);

  const lastRankings = computed(() => snapshot.value.context.lastRankings);

  const winnerIds = computed(() => snapshot.value.context.winnerIds);

  const isSuddenDeath = computed(() => snapshot.value.context.isSuddenDeath);

  const currentGameId = computed(() => currentDefinition.value?.id ?? null);

  const liveScores = computed((): Record<string, number> => {
    return miniGameInstance.value?.getScores?.() ?? {};
  });

  const rpsSnapshot = computed((): RockPaperScissorsSnapshot | null => {
    uiTick.value;

    if (currentGameId.value !== ROCK_PAPER_SCISSORS_ID || !miniGameInstance.value?.getGameSnapshot) {
      return null;
    }

    return miniGameInstance.value.getGameSnapshot() as RockPaperScissorsSnapshot;
  });

  const arenaBumpSnapshot = computed((): ArenaBumpSnapshot | null => {
    uiTick.value;
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
    const instance = miniGameInstance.value;

    if (currentGameId.value !== VOLLEYBALL_ID || !instance?.getGameSnapshot) {
      return null;
    }

    return instance.getGameSnapshot() as VolleyballSnapshot;
  });

  function stopIntroCountdown(): void {
    if (introIntervalId.value !== null) {
      window.clearInterval(introIntervalId.value);
      introIntervalId.value = null;
    }
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
    ) {
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

      if (instance.isFinished()) {
        stopTickLoop();
        const rankings = instance.getRankings();
        captureRoundOutcome(instance, rankings);
        send({
          type: 'MINIGAME_COMPLETE',
          rankings,
        });
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
    );
    miniGameInstance.value.start();
    startTickLoop();
  }

  function startIntroCountdown(): void {
    stopIntroCountdown();
    introSecondsLeft.value = INTRO_COUNTDOWN_SECONDS;

    introIntervalId.value = window.setInterval(() => {
      introSecondsLeft.value -= 1;

      if (introSecondsLeft.value <= 0) {
        stopIntroCountdown();
        send({ type: 'INTRO_COMPLETE' });
      }
    }, 1000);
  }

  function startParty(): void {
    if (!partyStore.isHost || partyStore.participants.length === 0) {
      return;
    }

    partyStore.fillCpuParticipants();

    const definition = pickRandomMiniGame(partyStore.settings.enabledMiniGameIds);

    send({ type: 'START_PARTY', miniGameId: definition.id });
  }

  function sendJoystickInput(x: number, y: number): void {
    const localId = partyStore.localParticipantId;

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, { type: 'joystick', x, y });
  }

  function sendArenaInput(input: {
    x: number;
    y: number;
    jump: boolean;
    charge: boolean;
    defend: boolean;
  }): void {
    const localId = partyStore.localParticipantId;

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, {
      type: 'arena',
      x: input.x,
      y: input.y,
      jump: input.jump,
      charge: input.charge,
      defend: input.defend,
    });
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

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, {
      type: 'volleyball',
      x: input.x,
      y: input.y,
      jump: input.jump,
      bump: input.bump,
      set: input.set,
      spike: input.spike,
      aimX: input.aimX,
      aimZ: input.aimZ,
    });
  }

  function sendLocalMash(): void {
    const localId = partyStore.localParticipantId;

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, { type: 'mash' });
  }

  function sendRpsChoice(choice: RpsChoice): void {
    const localId = partyStore.localParticipantId;

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, { type: 'rps', choice });
    uiTick.value += 1;
  }

  function sendRpsClaim(choice: RpsChoice): void {
    const localId = partyStore.localParticipantId;

    if (!localId || !miniGameInstance.value) {
      return;
    }

    miniGameInstance.value.onPlayerInput(localId, { type: 'rps-claim', choice });
    uiTick.value += 1;
  }

  function acknowledgeRoundResult(): void {
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
      return;
    }

    if (outcome.type === 'suddenDeath') {
      send({
        type: 'RESULT_ACK',
        outcome: 'suddenDeath',
        miniGameId: nextDefinition.id,
      });
      return;
    }

    send({
      type: 'RESULT_ACK',
      outcome: 'continue',
      miniGameId: nextDefinition.id,
    });
  }

  watch(phase, (nextPhase) => {
    if (nextPhase === 'roundResult') {
      partyStore.applyRoundCrowns(lastCrownAwards.value);
      scheduleRoundResultAutoAdvance();
    } else {
      clearRoundResultAutoAdvance();
    }

    if (nextPhase === 'miniGameIntro' || nextPhase === 'suddenDeathIntro') {
      disposeMiniGame();
      currentDefinition.value = resolveMiniGameDefinition(
        snapshot.value.context.currentMiniGameId,
        partyStore.settings.enabledMiniGameIds,
      );
      startIntroCountdown();
      return;
    }

    if (nextPhase === 'miniGamePlay') {
      const definition = resolveMiniGameDefinition(
        snapshot.value.context.currentMiniGameId,
        partyStore.settings.enabledMiniGameIds,
      );
      mountMiniGame(definition);
      return;
    }

    if (nextPhase === 'roundResult' || nextPhase === 'partyEnd' || nextPhase === 'lobby') {
      stopIntroCountdown();
      disposeMiniGame();
    }
  });

  onScopeDispose(() => {
    stopIntroCountdown();
    clearRoundResultAutoAdvance();
    disposeMiniGame();
  });

  return {
    phase,
    roundIndex,
    lastRankings,
    winnerIds,
    isSuddenDeath,
    currentDefinition,
    currentGameId,
    liveScores,
    introSecondsLeft,
    lastCrownAwards,
    lastRoundResults,
    rpsSnapshot,
    arenaBumpSnapshot,
    volleyballSnapshot,
    startParty,
    sendLocalMash,
    sendRpsChoice,
    sendRpsClaim,
    sendJoystickInput,
    sendArenaInput,
    sendVolleyballInput,
    acknowledgeRoundResult,
  };
}
