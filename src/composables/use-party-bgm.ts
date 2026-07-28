import { onUnmounted, watch, type Ref } from 'vue';

import { partyAudio, type PartyBgmId } from '@/common/audio/party-audio';
import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import type { PartyMachinePhase } from '@/party/party-machine/party-machine';

function resolvePlayBgm(gameId: string | null): PartyBgmId {
  if (gameId === ROCK_PAPER_SCISSORS_ID) {
    return 'rps';
  }

  if (gameId === ARENA_BUMP_ID) {
    return 'arena';
  }

  if (gameId === VOLLEYBALL_ID) {
    return 'volleyball';
  }

  return 'lobby';
}

/** 依派對階段切 BGM：大廳／載入／對戰 */
export function usePartyBgm(options: {
  phase: Ref<PartyMachinePhase | 'home'>;
  gameId: Ref<string | null>;
}): void {
  watch(
    [options.phase, options.gameId],
    ([phase, gameId]) => {
      if (phase === 'home' || phase === 'lobby') {
        partyAudio.playBgm('lobby');
        return;
      }

      if (phase === 'miniGameIntro' || phase === 'suddenDeathIntro') {
        partyAudio.playBgm('loading');
        return;
      }

      if (phase === 'miniGamePlay') {
        partyAudio.playBgm(resolvePlayBgm(gameId));
        return;
      }

      // 結算／派對結束：停 BGM，留給勝利短音
      if (phase === 'roundResult' || phase === 'partyEnd') {
        partyAudio.stopBgm();
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    partyAudio.stopBgm();
  });
}
