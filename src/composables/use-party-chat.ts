import { computed, ref } from 'vue';

export interface ChatMessage {
  id: string;
  participantId: string;
  displayName: string;
  text: string;
  sentAt: number;
}

/** 頭上對話框顯示時長 */
export const CHAT_BUBBLE_MS = 4200;

const MAX_HISTORY = 80;
const MAX_TEXT_LENGTH = 40;

const messages = ref<ChatMessage[]>([]);
/** 觸發 bubble 位置重算 */
const bubbleTick = ref(0);

let bubbleTimerId: number | null = null;

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scheduleBubbleTick(): void {
  if (bubbleTimerId !== null) {
    return;
  }

  bubbleTimerId = window.setTimeout(() => {
    bubbleTimerId = null;
    bubbleTick.value += 1;

    const now = Date.now();
    const stillActive = messages.value.some(
      (message) => now - message.sentAt < CHAT_BUBBLE_MS,
    );

    if (stillActive) {
      scheduleBubbleTick();
    }
  }, 400);
}

export function sanitizeChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

export function usePartyChat() {
  const history = computed(() => messages.value);

  /** 每位玩家最新一則、仍在顯示時長內的氣泡 */
  const activeBubbles = computed(() => {
    bubbleTick.value;
    const now = Date.now();
    const latestById = new Map<string, ChatMessage>();

    for (const message of messages.value) {
      if (now - message.sentAt >= CHAT_BUBBLE_MS) {
        continue;
      }

      const current = latestById.get(message.participantId);

      if (!current || message.sentAt >= current.sentAt) {
        latestById.set(message.participantId, message);
      }
    }

    return [...latestById.values()];
  });

  function appendMessage(input: {
    id?: string;
    participantId: string;
    displayName: string;
    text: string;
    sentAt?: number;
  }): ChatMessage | null {
    const text = sanitizeChatText(input.text);

    if (!text || !input.participantId) {
      return null;
    }

    const id = input.id ?? createMessageId();

    if (messages.value.some((message) => message.id === id)) {
      return null;
    }

    const entry: ChatMessage = {
      id,
      participantId: input.participantId,
      displayName: input.displayName.trim() || '玩家',
      text,
      sentAt: input.sentAt ?? Date.now(),
    };

    messages.value = [...messages.value, entry].slice(-MAX_HISTORY);
    scheduleBubbleTick();
    return entry;
  }

  function clearChat(): void {
    messages.value = [];
    bubbleTick.value += 1;

    if (bubbleTimerId !== null) {
      window.clearTimeout(bubbleTimerId);
      bubbleTimerId = null;
    }
  }

  return {
    history,
    activeBubbles,
    appendMessage,
    clearChat,
    createMessageId,
    maxTextLength: MAX_TEXT_LENGTH,
  };
}
