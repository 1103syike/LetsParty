import type { CrownHistory } from '@/party/scoring/crown-history';
import type { AnimalId } from '@/types/animal';
import type { Participant, PartySettings } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

export const PEER_MESSAGE_TYPES = {
  JOIN_REQUEST: 'join-request',
  JOIN_REJECTED: 'join-rejected',
  LEAVE: 'leave',
  SET_NAME: 'set-name',
  PICK_ANIMAL: 'pick-animal',
  SET_READY: 'set-ready',
  ROOM_SNAPSHOT: 'room-snapshot',
  HOST_LEFT: 'host-left',
  START_PARTY: 'start-party',
  PLAYER_INPUT: 'player-input',
  SESSION_SNAPSHOT: 'session-snapshot',
  SESSION_ACTION: 'session-action',
  CHAT_MESSAGE: 'chat-message',
} as const;

export type PeerMessageType = (typeof PEER_MESSAGE_TYPES)[keyof typeof PEER_MESSAGE_TYPES];

export type JoinRejectReason = 'full' | 'closed' | 'busy';

export type SessionActionKind = 'intro-ready' | 'result-ack';

export interface RoomSnapshotPayload {
  roomId: string;
  participants: Participant[];
  settings: PartySettings;
  /** 皇冠累積時間軸（Guest 結束頁走勢用） */
  crownHistory: CrownHistory;
  /** Guest 在 roster 裡的 id */
  yourParticipantId?: string;
}

export interface SessionSnapshotPayload {
  phase: string;
  roundIndex: number;
  winnerIds: string[];
  isSuddenDeath: boolean;
  gameId: string | null;
  gameName: string;
  gameRules: string;
  liveScores: Record<string, number>;
  lastCrownAwards: Record<string, number>;
  lastRoundResults: Record<string, string>;
  /** 本關 loading 已就緒的真人 id */
  introReadyIds: string[];
  gameSnapshot: unknown | null;
}

export type PeerMessage =
  | {
      type: typeof PEER_MESSAGE_TYPES.JOIN_REQUEST;
      displayName: string;
      animalId?: AnimalId;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.JOIN_REJECTED;
      reason: JoinRejectReason;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.LEAVE;
      participantId: string;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.SET_NAME;
      participantId: string;
      displayName: string;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.PICK_ANIMAL;
      participantId: string;
      animalId: AnimalId;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.SET_READY;
      participantId: string;
      isReady: boolean;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.ROOM_SNAPSHOT;
      snapshot: RoomSnapshotPayload;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.HOST_LEFT;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.START_PARTY;
      miniGameId: string;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.PLAYER_INPUT;
      participantId: string;
      input: PlayerInput;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.SESSION_SNAPSHOT;
      snapshot: SessionSnapshotPayload;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.SESSION_ACTION;
      action: SessionActionKind;
      participantId?: string;
    }
  | {
      type: typeof PEER_MESSAGE_TYPES.CHAT_MESSAGE;
      id: string;
      participantId: string;
      displayName: string;
      text: string;
      sentAt: number;
    };

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && Object.values(PEER_MESSAGE_TYPES).includes(type as PeerMessageType);
}
