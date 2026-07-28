import { defineStore } from 'pinia';

import { getDefaultAnimalForSeat, pickUnusedAnimalId } from '@/common/animals/animals';
import { DEFAULT_ENABLED_MINI_GAME_IDS } from '@/minigames/registry';
import { fillCpuToFour } from '@/party/cpu/cpu';
import { applyHumanAnimalPick } from '@/party/roster/animal-pick';
import { awardCrownsByMap, awardCrownToFirstPlace } from '@/party/scoring/crown';
import {
  createInitialCrownHistory,
  snapshotCrownHistory,
  type CrownHistory,
} from '@/party/scoring/crown-history';
import type { AnimalId } from '@/types/animal';
import {
  CROWN_WIN_OPTIONS,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_TARGET_CROWNS,
  PARTY_PLAYER_COUNT,
  type CrownWinOption,
  type Participant,
  type PartySettings,
} from '@/types/party';

const PLAYER_COLORS = ['player-1', 'player-2', 'player-3', 'player-4'] as const;

function createEmptyParticipants(): Participant[] {
  return [];
}

export const usePartyStore = defineStore('party', {
  state: () => ({
    roomId: '' as string,
    isHost: false,
    /** 測試模式：跳過大廳／loading，進房就開打 */
    isTestMode: false,
    localParticipantId: null as string | null,
    settings: {
      targetCrowns: DEFAULT_TARGET_CROWNS,
      maxRounds: DEFAULT_MAX_ROUNDS,
      enabledMiniGameIds: [...DEFAULT_ENABLED_MINI_GAME_IDS],
    } as PartySettings,
    participants: createEmptyParticipants(),
    crownHistory: {} as CrownHistory,
    crownWinOptions: [...CROWN_WIN_OPTIONS] as CrownWinOption[],
  }),

  getters: {
    humanCount: (state): number =>
      state.participants.filter((participant) => participant.kind === 'human').length,

    seatSlots: (state): Array<Participant | null> => {
      const slots: Array<Participant | null> = state.participants.slice(0, PARTY_PLAYER_COUNT);

      while (slots.length < PARTY_PLAYER_COUNT) {
        slots.push(null);
      }

      return slots;
    },

    localParticipant: (state): Participant | null => {
      if (!state.localParticipantId) {
        return null;
      }

      return state.participants.find((participant) => participant.id === state.localParticipantId) ?? null;
    },
  },

  actions: {
    createRoom(roomId: string): void {
      this.roomId = roomId;
      this.isHost = true;
      this.isTestMode = false;
      this.localParticipantId = 'host-local';
      this.participants = [
        {
          id: 'host-local',
          displayName: '',
          kind: 'human',
          color: PLAYER_COLORS[0],
          animalId: getDefaultAnimalForSeat(0),
          crownCount: 0,
        },
      ];
      this.participants = fillCpuToFour(this.participants);
      this.crownHistory = createInitialCrownHistory(this.participants);
    },

    /** 開發／調手感：本機 + 3 CPU，進房後自動開打 */
    startTestSession(roomId: string): void {
      this.createRoom(roomId);
      this.isTestMode = true;
      this.setLocalDisplayName('測試玩家');
    },

    joinRoom(roomId: string, displayName = ''): void {
      this.roomId = roomId;
      this.isHost = false;

      const guestId = `guest-${Date.now()}`;
      const colorIndex = this.participants.length % PARTY_PLAYER_COUNT;
      const taken = new Set(this.participants.map((participant) => participant.animalId));

      this.localParticipantId = guestId;
      this.participants.push({
        id: guestId,
        displayName,
        kind: 'human',
        color: PLAYER_COLORS[colorIndex],
        animalId: pickUnusedAnimalId(taken),
        crownCount: 0,
      });
      this.participants = fillCpuToFour(this.participants);
      this.crownHistory = createInitialCrownHistory(this.participants);
    },

    setLocalDisplayName(displayName: string): void {
      if (!this.localParticipantId) {
        return;
      }

      const trimmed = displayName.trim();
      const fallback = this.isHost ? '房主' : '玩家';
      const nextName = trimmed.length > 0 ? trimmed : fallback;

      this.participants = this.participants.map((participant) => {
        if (participant.id !== this.localParticipantId) {
          return participant;
        }

        return {
          ...participant,
          displayName: nextName,
        };
      });
    },

    fillCpuParticipants(): void {
      this.participants = fillCpuToFour(this.participants);
    },

    /** 測試模式每局重來：皇冠歸零 */
    resetMatchProgress(): void {
      this.participants = this.participants.map((participant) => ({
        ...participant,
        crownCount: 0,
      }));
      this.crownHistory = createInitialCrownHistory(this.participants);
    },

    setLocalAnimal(animalId: AnimalId): void {
      if (!this.localParticipantId) {
        return;
      }

      this.participants = applyHumanAnimalPick(
        this.participants,
        this.localParticipantId,
        animalId,
      );
    },

    applyRoundRankings(rankings: string[]): void {
      this.participants = awardCrownToFirstPlace(this.participants, rankings);
    },

    applyRoundCrowns(crownAwards: Record<string, number>): void {
      this.participants = awardCrownsByMap(this.participants, crownAwards);
      this.crownHistory = snapshotCrownHistory(this.crownHistory, this.participants);
    },

    setTargetCrowns(targetCrowns: CrownWinOption): void {
      this.settings.targetCrowns = targetCrowns;
    },

    /** 大廳勾選本場要玩的迷你遊戲；至少保留一個 */
    setMiniGameEnabled(miniGameId: string, enabled: boolean): void {
      const current = this.settings.enabledMiniGameIds;
      const hasId = current.includes(miniGameId);

      if (enabled && !hasId) {
        this.settings.enabledMiniGameIds = [...current, miniGameId];
        return;
      }

      if (!enabled && hasId) {
        if (current.length <= 1) {
          return;
        }

        this.settings.enabledMiniGameIds = current.filter((id) => id !== miniGameId);
      }
    },

    toggleMiniGameEnabled(miniGameId: string): void {
      const enabled = this.settings.enabledMiniGameIds.includes(miniGameId);
      this.setMiniGameEnabled(miniGameId, !enabled);
    },

    /** 離開房間或重整後無效 session：清掉本機派對狀態 */
    reset(): void {
      this.roomId = '';
      this.isHost = false;
      this.isTestMode = false;
      this.localParticipantId = null;
      this.settings = {
        targetCrowns: DEFAULT_TARGET_CROWNS,
        maxRounds: DEFAULT_MAX_ROUNDS,
        enabledMiniGameIds: [...DEFAULT_ENABLED_MINI_GAME_IDS],
      };
      this.participants = createEmptyParticipants();
      this.crownHistory = {};
    },
  },
});
