import { ref, shallowRef } from 'vue';

import { PeerRoomSession } from '@/common/peer/peer-room-session';
import { usePartyStore } from '@/stores/party-store';
import type { AnimalId } from '@/types/animal';
import type { PlayerInput } from '@/types/player-input';
import {
  PEER_MESSAGE_TYPES,
  type PeerMessage,
  type SessionActionKind,
  type SessionSnapshotPayload,
} from '@/types/peer-messages';

const remoteSession = ref<SessionSnapshotPayload | null>(null);
const peerSession = shallowRef<PeerRoomSession | null>(null);
const hostPeerIdByGuestId = new Map<string, string>();

type StartPartyHandler = (miniGameId: string) => void;
type RemoteInputHandler = (participantId: string, input: PlayerInput) => void;
type SessionActionHandler = (
  action: SessionActionKind,
  participantId?: string,
) => void;

let startPartyHandler: StartPartyHandler | null = null;
let remoteInputHandler: RemoteInputHandler | null = null;
let sessionActionHandler: SessionActionHandler | null = null;

export function usePartyNetwork() {
  const partyStore = usePartyStore();

  function broadcastRoom(): void {
    peerSession.value?.broadcastRoomSnapshot(partyStore.roomSnapshot);
  }

  function handleHostMessage(peerId: string, message: PeerMessage): void {
    if (message.type === PEER_MESSAGE_TYPES.SET_NAME) {
      partyStore.setParticipantDisplayName(message.participantId, message.displayName);
      broadcastRoom();
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.PICK_ANIMAL) {
      partyStore.setParticipantAnimal(message.participantId, message.animalId);
      broadcastRoom();
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.SET_READY) {
      partyStore.setParticipantReady(message.participantId, message.isReady);
      broadcastRoom();
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.LEAVE) {
      partyStore.removeGuestByPeerId(peerId);
      broadcastRoom();
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.PLAYER_INPUT) {
      remoteInputHandler?.(message.participantId, message.input);
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.SESSION_ACTION) {
      sessionActionHandler?.(message.action, message.participantId);
    }
  }

  function handleGuestMessage(_peerId: string, message: PeerMessage): void {
    if (message.type === PEER_MESSAGE_TYPES.ROOM_SNAPSHOT) {
      partyStore.applyRoomSnapshot(message.snapshot);
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.JOIN_REJECTED) {
      partyStore.markConnectionError(message.reason === 'full' ? 'full' : 'closed');
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.HOST_LEFT) {
      partyStore.markConnectionError('closed');
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.START_PARTY) {
      partyStore.markRemotePartyStarted();
      startPartyHandler?.(message.miniGameId);
      return;
    }

    if (message.type === PEER_MESSAGE_TYPES.SESSION_SNAPSHOT) {
      remoteSession.value = message.snapshot;
      partyStore.markRemotePartyStarted();
    }
  }

  async function startHostNetworking(roomId: string): Promise<void> {
    await stopNetworking();

    const session = new PeerRoomSession('host', {
      onGuestJoined(peerId, message) {
        const seated = partyStore.acceptGuestHuman(peerId, message.displayName, message.animalId);

        if (!seated) {
          session.send(peerId, {
            type: PEER_MESSAGE_TYPES.JOIN_REJECTED,
            reason: 'full',
          });
          return;
        }

        hostPeerIdByGuestId.set(seated.id, peerId);
        broadcastRoom();
      },
      onGuestLeft(peerId) {
        partyStore.removeGuestByPeerId(peerId);
        broadcastRoom();
      },
      onMessage: handleHostMessage,
      onError() {
        partyStore.markConnectionError('failed');
      },
    });

    peerSession.value = session;

    try {
      await session.openAsHost(roomId);
      partyStore.markConnected();
      broadcastRoom();
    } catch {
      partyStore.markConnectionError('failed');
      throw new Error('host-peer-failed');
    }
  }

  async function startGuestNetworking(roomId: string): Promise<void> {
    await stopNetworking();

    const session = new PeerRoomSession('guest', {
      onMessage: handleGuestMessage,
      onHostLeft() {
        partyStore.markConnectionError('closed');
      },
      onError() {
        partyStore.markConnectionError('failed');
      },
    });

    peerSession.value = session;

    try {
      await session.connectAsGuest(roomId);
      session.broadcast({
        type: PEER_MESSAGE_TYPES.JOIN_REQUEST,
        displayName: '',
      });
      // Guest 只有一條連到 Host 的 connection；broadcast 也會送到 Host
    } catch {
      partyStore.markConnectionError('failed');
      throw new Error('guest-peer-failed');
    }
  }

  async function stopNetworking(): Promise<void> {
    hostPeerIdByGuestId.clear();
    remoteSession.value = null;

    if (peerSession.value) {
      await peerSession.value.destroy();
      peerSession.value = null;
    }
  }

  function notifyLocalName(displayName: string): void {
    partyStore.setLocalDisplayName(displayName);

    if (partyStore.isTestMode) {
      return;
    }

    if (partyStore.isHost) {
      broadcastRoom();
      return;
    }

    if (!partyStore.localParticipantId) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.SET_NAME,
      participantId: partyStore.localParticipantId,
      displayName,
    });
  }

  function notifyLocalAnimal(animalId: AnimalId): void {
    partyStore.setLocalAnimal(animalId);

    if (partyStore.isTestMode) {
      return;
    }

    if (partyStore.isHost) {
      broadcastRoom();
      return;
    }

    if (!partyStore.localParticipantId) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.PICK_ANIMAL,
      participantId: partyStore.localParticipantId,
      animalId,
    });
  }

  function notifyLocalReady(isReady: boolean): void {
    partyStore.setLocalReady(isReady);

    if (partyStore.isTestMode) {
      return;
    }

    if (partyStore.isHost) {
      broadcastRoom();
      return;
    }

    if (!partyStore.localParticipantId) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.SET_READY,
      participantId: partyStore.localParticipantId,
      isReady,
    });
  }

  function notifySettingsChanged(): void {
    if (partyStore.isHost && !partyStore.isTestMode) {
      broadcastRoom();
    }
  }

  function notifyStartParty(miniGameId: string): void {
    if (!partyStore.isHost || partyStore.isTestMode) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.START_PARTY,
      miniGameId,
    });
  }

  function sendPlayerInput(input: PlayerInput): void {
    if (partyStore.isHost || partyStore.isTestMode || !partyStore.localParticipantId) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.PLAYER_INPUT,
      participantId: partyStore.localParticipantId,
      input,
    });
  }

  function sendSessionAction(action: SessionActionKind): void {
    if (partyStore.isHost || partyStore.isTestMode) {
      return;
    }

    peerSession.value?.broadcast({
      type: PEER_MESSAGE_TYPES.SESSION_ACTION,
      action,
      participantId: partyStore.localParticipantId ?? undefined,
    });
  }

  function publishSessionSnapshot(
    build: (viewerParticipantId: string | null) => SessionSnapshotPayload,
  ): void {
    if (!partyStore.isHost || partyStore.isTestMode || !peerSession.value) {
      return;
    }

    for (const [guestParticipantId, peerId] of hostPeerIdByGuestId) {
      peerSession.value.send(peerId, {
        type: PEER_MESSAGE_TYPES.SESSION_SNAPSHOT,
        snapshot: build(guestParticipantId),
      });
    }
  }

  function setStartPartyHandler(handler: StartPartyHandler | null): void {
    startPartyHandler = handler;
  }

  function setRemoteInputHandler(handler: RemoteInputHandler | null): void {
    remoteInputHandler = handler;
  }

  function setSessionActionHandler(handler: SessionActionHandler | null): void {
    sessionActionHandler = handler;
  }

  return {
    remoteSession,
    startHostNetworking,
    startGuestNetworking,
    stopNetworking,
    broadcastRoom,
    notifyLocalName,
    notifyLocalAnimal,
    notifyLocalReady,
    notifySettingsChanged,
    notifyStartParty,
    sendPlayerInput,
    sendSessionAction,
    publishSessionSnapshot,
    setStartPartyHandler,
    setRemoteInputHandler,
    setSessionActionHandler,
  };
}
