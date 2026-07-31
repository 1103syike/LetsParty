import { Peer, type DataConnection } from 'peerjs';

import {
  isPeerMessage,
  PEER_MESSAGE_TYPES,
  type PeerMessage,
  type RoomSnapshotPayload,
  type SessionSnapshotPayload,
} from '@/types/peer-messages';

export type PeerRoomRole = 'host' | 'guest';

export interface PeerRoomHandlers {
  onGuestJoined?: (peerId: string, message: Extract<PeerMessage, { type: 'join-request' }>) => void;
  onGuestLeft?: (peerId: string) => void;
  onMessage?: (peerId: string, message: PeerMessage) => void;
  onHostLeft?: () => void;
  onError?: (error: Error) => void;
  onOpen?: (peerId: string) => void;
}

/** Host／Guest Peer 連線；訊息走 JSON DataConnection */
export class PeerRoomSession {
  private peer: Peer | null = null;

  private readonly connections = new Map<string, DataConnection>();

  private readonly handlers: PeerRoomHandlers;

  private destroyed = false;

  readonly role: PeerRoomRole;

  constructor(role: PeerRoomRole, handlers: PeerRoomHandlers = {}) {
    this.role = role;
    this.handlers = handlers;
  }

  get isOpen(): boolean {
    return Boolean(this.peer && !this.peer.destroyed);
  }

  /** Host：以房號當 Peer id */
  async openAsHost(roomId: string): Promise<string> {
    await this.destroy();
    this.destroyed = false;

    const peer = new Peer(roomId, { debug: 0 });
    this.peer = peer;

    return new Promise((resolve, reject) => {
      const onOpen = (id: string) => {
        cleanup();
        this.handlers.onOpen?.(id);
        resolve(id);
      };

      const onError = (error: Error) => {
        cleanup();
        this.handlers.onError?.(error);
        reject(error);
      };

      const cleanup = () => {
        peer.off('open', onOpen);
        peer.off('error', onError);
      };

      peer.on('open', onOpen);
      peer.on('error', onError);
      peer.on('connection', (connection) => {
        this.bindConnection(connection);
      });
      peer.on('disconnected', () => {
        if (!this.destroyed) {
          peer.reconnect();
        }
      });
    });
  }

  /** Guest：連到房號 Peer id */
  async connectAsGuest(roomId: string): Promise<string> {
    await this.destroy();
    this.destroyed = false;

    const peer = new Peer({ debug: 0 });
    this.peer = peer;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        peer.off('open', onOpen);
        peer.off('error', onError);
      };

      peer.on('open', onOpen);
      peer.on('error', onError);
    });

    this.handlers.onOpen?.(peer.id);

    const connection = peer.connect(roomId, { reliable: true });
    await this.waitConnectionOpen(connection);
    this.bindConnection(connection);
    return peer.id;
  }

  send(peerId: string, message: PeerMessage): void {
    const connection = this.connections.get(peerId);

    if (!connection || !connection.open) {
      return;
    }

    connection.send(message);
  }

  broadcast(message: PeerMessage, exceptPeerId?: string): void {
    for (const [peerId, connection] of this.connections) {
      if (exceptPeerId && peerId === exceptPeerId) {
        continue;
      }

      if (connection.open) {
        connection.send(message);
      }
    }
  }

  broadcastRoomSnapshot(snapshot: RoomSnapshotPayload): void {
    for (const [peerId, connection] of this.connections) {
      if (!connection.open) {
        continue;
      }

      const personal: RoomSnapshotPayload = {
        ...snapshot,
        yourParticipantId: snapshot.participants.find(
          (participant) => participant.peerId === peerId,
        )?.id,
      };

      connection.send({
        type: PEER_MESSAGE_TYPES.ROOM_SNAPSHOT,
        snapshot: personal,
      });
    }
  }

  broadcastSessionSnapshot(snapshot: SessionSnapshotPayload): void {
    this.broadcast({
      type: PEER_MESSAGE_TYPES.SESSION_SNAPSHOT,
      snapshot,
    });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;

    for (const connection of this.connections.values()) {
      connection.close();
    }

    this.connections.clear();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  private waitConnectionOpen(connection: DataConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('peer-connect-timeout'));
      }, 12000);

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        window.clearTimeout(timer);
        connection.off('open', onOpen);
        connection.off('error', onError);
      };

      if (connection.open) {
        cleanup();
        resolve();
        return;
      }

      connection.on('open', onOpen);
      connection.on('error', onError);
    });
  }

  private bindConnection(connection: DataConnection): void {
    const peerId = connection.peer;
    this.connections.set(peerId, connection);

    connection.on('data', (data) => {
      if (!isPeerMessage(data)) {
        return;
      }

      if (data.type === PEER_MESSAGE_TYPES.JOIN_REQUEST) {
        this.handlers.onGuestJoined?.(peerId, data);
      }

      this.handlers.onMessage?.(peerId, data);
    });

    connection.on('close', () => {
      this.connections.delete(peerId);
      this.handlers.onGuestLeft?.(peerId);

      if (this.role === 'guest') {
        this.handlers.onHostLeft?.();
      }
    });

    connection.on('error', (error) => {
      this.handlers.onError?.(error);
    });
  }
}
