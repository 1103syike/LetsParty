<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { usePartyChat } from '@/composables/use-party-chat';
import { usePartyNetwork } from '@/composables/use-party-network';
import { chatCopy } from '@/locales/zh-TW/chat';
import { usePartyStore } from '@/stores/party-store';

const partyStore = usePartyStore();
const network = usePartyNetwork();
const chat = usePartyChat();

const isOpen = ref(false);
const draft = ref('');
const logEl = ref<HTMLElement | null>(null);

const canSend = computed(() => {
  if (!partyStore.localParticipantId) {
    return false;
  }

  return draft.value.trim().length > 0;
});

async function scrollLogToBottom(): Promise<void> {
  await nextTick();

  if (logEl.value) {
    logEl.value.scrollTop = logEl.value.scrollHeight;
  }
}

watch(
  () => chat.history.value.length,
  () => {
    void scrollLogToBottom();
  },
);

watch(isOpen, (open) => {
  if (open) {
    void scrollLogToBottom();
  }
});

function handleToggle(): void {
  isOpen.value = !isOpen.value;
}

function handleSend(): void {
  if (!canSend.value) {
    return;
  }

  const ok = network.sendChatMessage(draft.value);

  if (ok) {
    draft.value = '';
  }
}

function rowLabel(participantId: string, displayName: string): string {
  if (participantId === partyStore.localParticipantId) {
    return chatCopy.you;
  }

  return displayName;
}
</script>

<template>
  <Teleport to="body">
    <aside class="room-chat">
      <button
        type="button"
        class="room-chat__toggle font-game"
        :aria-expanded="isOpen"
        @click="handleToggle"
      >
        {{ isOpen ? chatCopy.toggleClose : chatCopy.toggleOpen }}
      </button>

      <div
        v-if="isOpen"
        class="room-chat__panel flex flex-col gap-sm"
      >
        <div
          ref="logEl"
          class="room-chat__log"
          role="log"
          aria-live="polite"
        >
          <p
            v-if="chat.history.value.length === 0"
            class="room-chat__empty text-xs"
          >
            {{ chatCopy.empty }}
          </p>
          <ul
            v-else
            class="room-chat__list flex flex-col gap-xs"
          >
            <li
              v-for="message in chat.history.value"
              :key="message.id"
              class="room-chat__row"
            >
              <span class="room-chat__name font-game">
                {{ rowLabel(message.participantId, message.displayName) }}
              </span>
              <span class="room-chat__text">{{ message.text }}</span>
            </li>
          </ul>
        </div>

        <form
          class="room-chat__form flex gap-xs items-center"
          @submit.prevent="handleSend"
        >
          <input
            v-model="draft"
            class="party-input room-chat__input"
            type="text"
            maxlength="40"
            autocomplete="off"
            :placeholder="chatCopy.placeholder"
          />
          <button
            type="submit"
            class="room-chat__send font-game"
            :disabled="!canSend"
          >
            {{ chatCopy.send }}
          </button>
        </form>
      </div>
    </aside>
  </Teleport>
</template>

<style lang="scss" scoped>
.room-chat {
  position: fixed;
  left: var(--space-md);
  bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
  z-index: 240;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
  width: min(18rem, calc(100vw - var(--space-xl)));
  pointer-events: none;
}

.room-chat__toggle,
.room-chat__panel,
.room-chat__send,
.room-chat__input {
  pointer-events: auto;
}

.room-chat__toggle {
  padding: var(--space-sm) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: linear-gradient(
    135deg,
    var(--color-accent) 0%,
    var(--color-accent-hover) 100%
  );
  color: var(--color-on-accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  box-shadow: var(--shadow-party-btn);
  cursor: pointer;
}

.room-chat__panel {
  width: 100%;
  padding: var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--color-accent) 40%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 94%, white);
  box-shadow: var(--shadow-party-btn);
}

.room-chat__log {
  max-height: 10rem;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: var(--space-xs);
  scrollbar-width: thin;
  scrollbar-color: var(--color-accent) color-mix(in srgb, var(--color-border) 55%, white);

  &::-webkit-scrollbar {
    width: var(--space-sm);
  }

  &::-webkit-scrollbar-track {
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-border) 55%, white);
  }

  &::-webkit-scrollbar-thumb {
    border: var(--space-xs) solid transparent;
    border-radius: var(--radius-full);
    background: linear-gradient(
      180deg,
      var(--color-accent) 0%,
      var(--color-accent-hover) 100%
    );
    background-clip: padding-box;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--color-accent-hover);
    background-clip: padding-box;
  }
}

.room-chat__empty {
  margin: 0;
  padding: var(--space-sm);
  color: var(--color-text-muted);
  text-align: center;
}

.room-chat__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.room-chat__row {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent) 8%, white);
}

.room-chat__name {
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  color: var(--color-accent-hover);
}

.room-chat__text {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--color-text-heading);
  word-break: break-word;
}

.room-chat__form {
  width: 100%;
}

.room-chat__input {
  flex: 1;
  min-width: 0;
}

.room-chat__send {
  flex-shrink: 0;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>
