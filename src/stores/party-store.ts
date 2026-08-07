import { defineStore } from 'pinia';

import { getDefaultAnimalForSeat, pickUnusedAnimalId } from '@/common/animals/animals';
import { DEFAULT_ENABLED_MINI_GAME_IDS } from '@/minigames/registry';
import {
  fillCpuToFour,
  reconcileCpuSeats,
  removeHumanById,
  seatHumanReplacingCpu,
} from '@/party/cpu/cpu';
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
import type { RoomSnapshotPayload } from '@/types/peer-messages';

const PLAYER_COLORS = ['player-1', 'player-2', 'player-3', 'player-4'] as const;

export type PartyConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type PartyConnectionError = 'full' | 'closed' | 'failed' | null;

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
    connectionStatus: 'idle' as PartyConnectionStatus,
    connectionError: null as PartyConnectionError,
    /** Guest：Host 已開打，跟進派對 UI */
    remotePartyStarted: false,
  }),

  getters: {
    humanCount: (state): number =>
      state.participants.filter((participant) => participant.kind === 'human').length,

    allHumansReady: (state): boolean => {
      const humans = state.participants.filter((participant) => participant.kind === 'human');

      if (humans.length === 0) {
        return false;
      }

      return humans.every((participant) => participant.isReady);
    },

    readyHumanCount: (state): number =>
      state.participants.filter(
        (participant) => participant.kind === 'human' && participant.isReady,
      ).length,

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

    roomSnapshot(): RoomSnapshotPayload {
      return {
        roomId: this.roomId,
        participants: this.participants,
        settings: {
          targetCrowns: this.settings.targetCrowns,
          maxRounds: this.settings.maxRounds,
          enabledMiniGameIds: [...this.settings.enabledMiniGameIds],
        },
        crownHistory: this.crownHistory,
      };
    },
  },

  actions: {
    createRoom(roomId: string): void {
      this.roomId = roomId;
      this.isHost = true;
      this.isTestMode = false;
      this.connectionStatus = 'connecting';
      this.connectionError = null;
      this.remotePartyStarted = false;
      this.localParticipantId = 'host-local';
      this.participants = [
        {
          id: 'host-local',
          displayName: '',
          kind: 'human',
          color: PLAYER_COLORS[0],
          animalId: getDefaultAnimalForSeat(0),
          crownCount: 0,
          isReady: false,
        },
      ];
      this.participants = fillCpuToFour(this.participants);
      this.crownHistory = createInitialCrownHistory(this.participants);
    },

    /** 開發／調手感：本機 + 3 CPU，不開 Peer */
    startTestSession(roomId: string): void {
      this.createRoom(roomId);
      this.isTestMode = true;
      this.connectionStatus = 'connected';
      this.setLocalDisplayName('測試玩家');
    },

    /** Guest 進房前：先佔 roomId，等 Peer snapshot */
    beginGuestJoin(roomId: string): void {
      this.roomId = roomId;
      this.isHost = false;
      this.isTestMode = false;
      this.localParticipantId = null;
      this.participants = createEmptyParticipants();
      this.connectionStatus = 'connecting';
      this.connectionError = null;
      this.remotePartyStarted = false;
      this.crownHistory = {};
    },

    markConnected(): void {
      this.connectionStatus = 'connected';
      this.connectionError = null;
    },

    markConnectionError(error: PartyConnectionError): void {
      this.connectionStatus = 'error';
      this.connectionError = error;
    },

    applyRoomSnapshot(snapshot: RoomSnapshotPayload): void {
      this.roomId = snapshot.roomId;
      this.participants = snapshot.participants.map((participant) => ({
        ...participant,
        isReady: participant.isReady ?? participant.kind === 'cpu',
      }));
      this.settings = {
        targetCrowns: snapshot.settings.targetCrowns,
        maxRounds: snapshot.settings.maxRounds,
        enabledMiniGameIds: [...snapshot.settings.enabledMiniGameIds],
      };

      if (snapshot.yourParticipantId) {
        this.localParticipantId = snapshot.yourParticipantId;
      }

      // 採用 Host 的走勢；缺欄（舊客戶端）才重建起點
      this.crownHistory = snapshot.crownHistory
        && Object.keys(snapshot.crownHistory).length > 0
        ? snapshot.crownHistory
        : createInitialCrownHistory(this.participants);
      this.connectionStatus = 'connected';
      this.connectionError = null;
    },

    /** Host：接受 Guest，置換 CPU 席 */
    acceptGuestHuman(peerId: string, displayName: string, animalId?: AnimalId): Participant | null {
      if (this.humanCount >= PARTY_PLAYER_COUNT) {
        return null;
      }

      const taken = new Set(this.participants.map((participant) => participant.animalId));
      const human: Participant = {
        id: `guest-${peerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || Date.now()}`,
        displayName: displayName.trim() || '玩家',
        kind: 'human',
        color: PLAYER_COLORS[0],
        animalId: animalId && !taken.has(animalId) ? animalId : pickUnusedAnimalId(taken),
        peerId,
        crownCount: 0,
        isReady: false,
      };

      this.participants = seatHumanReplacingCpu(this.participants, human);
      this.crownHistory = createInitialCrownHistory(this.participants);
      return this.participants.find((participant) => participant.id === human.id) ?? null;
    },

    removeGuestByPeerId(peerId: string): void {
      const guest = this.participants.find(
        (participant) => participant.kind === 'human' && participant.peerId === peerId,
      );

      if (!guest) {
        return;
      }

      this.participants = removeHumanById(this.participants, guest.id);
      this.crownHistory = createInitialCrownHistory(this.participants);
    },

    setParticipantDisplayName(participantId: string, displayName: string): void {
      const trimmed = displayName.trim();
      const fallback = participantId === this.localParticipantId && this.isHost ? '房主' : '玩家';
      const nextName = trimmed.length > 0 ? trimmed : fallback;

      this.participants = this.participants.map((participant) => {
        if (participant.id !== participantId) {
          return participant;
        }

        return {
          ...participant,
          displayName: nextName,
        };
      });
    },

    setLocalDisplayName(displayName: string): void {
      if (!this.localParticipantId) {
        return;
      }

      this.setParticipantDisplayName(this.localParticipantId, displayName);
    },

    setParticipantAnimal(participantId: string, animalId: AnimalId): void {
      this.participants = applyHumanAnimalPick(this.participants, participantId, animalId);
    },

    fillCpuParticipants(): void {
      this.participants = reconcileCpuSeats(this.participants);
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

      this.setParticipantAnimal(this.localParticipantId, animalId);
    },

    setParticipantReady(participantId: string, isReady: boolean): void {
      this.participants = this.participants.map((participant) => {
        if (participant.id !== participantId || participant.kind !== 'human') {
          return participant;
        }

        return {
          ...participant,
          isReady,
        };
      });
    },

    setLocalReady(isReady: boolean): void {
      if (!this.localParticipantId) {
        return;
      }

      this.setParticipantReady(this.localParticipantId, isReady);
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

    markRemotePartyStarted(): void {
      this.remotePartyStarted = true;
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
      this.connectionStatus = 'idle';
      this.connectionError = null;
      this.remotePartyStarted = false;
    },
  },
});
