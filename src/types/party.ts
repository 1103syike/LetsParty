export const PARTY_PLAYER_COUNT = 4 as const;

export const CROWN_WIN_OPTIONS = [3, 5, 7] as const;

export const DEFAULT_TARGET_CROWNS = 5;

export const DEFAULT_MAX_ROUNDS = 20;

export type CrownWinOption = (typeof CROWN_WIN_OPTIONS)[number];

import type { AnimalId } from '@/types/animal';

export type ParticipantKind = 'human' | 'cpu';

export type PlayerColor = 'player-1' | 'player-2' | 'player-3' | 'player-4';

export interface Participant {
  id: string;
  displayName: string;
  kind: ParticipantKind;
  color: PlayerColor;
  animalId: AnimalId;
  peerId?: string;
  crownCount: number;
}

export interface PartySettings {
  targetCrowns: number;
  maxRounds?: number;
  /** 本場輪抽會抽到的迷你遊戲 id（至少保留一個） */
  enabledMiniGameIds: string[];
}
