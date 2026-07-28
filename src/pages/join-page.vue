<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { isValidRoomId } from '@/common/room-id';
import ActionButton from '@/components/action-button.vue';
import { usePartyBgm } from '@/composables/use-party-bgm';
import { joinCopy } from '@/locales/zh-TW/join';
import { usePartyStore } from '@/stores/party-store';

const router = useRouter();
const partyStore = usePartyStore();

usePartyBgm({
  phase: computed(() => 'home'),
  gameId: computed(() => null),
});

const roomIdInput = ref('');

function handleJoin(): void {
  const roomId = roomIdInput.value.trim();

  if (!isValidRoomId(roomId)) {
    return;
  }

  // 暱稱改在大廳第一步填
  partyStore.joinRoom(roomId);
  router.push({ name: 'room', params: { id: roomId } });
}

function handleBack(): void {
  router.push({ name: 'home' });
}
</script>

<template>
  <main class="join-page flex flex-col gap-lg pad-lg min-h-screen">
    <section class="glass-panel-solid flex flex-col gap-lg pad-lg">
      <h1 class="font-game text-title text-xl text-center">{{ joinCopy.title }}</h1>

      <label class="flex flex-col gap-xs">
        <span class="text-sm font-bold">{{ joinCopy.roomCodePlaceholder }}</span>
        <input
          v-model="roomIdInput"
          class="party-input"
          type="text"
          inputmode="numeric"
          maxlength="6"
          :placeholder="joinCopy.roomCodePlaceholder"
          @keyup.enter="handleJoin"
        />
      </label>

      <ActionButton
        :disabled="!isValidRoomId(roomIdInput.trim())"
        @click="handleJoin"
      >
        {{ joinCopy.submit }}
      </ActionButton>

      <button
        type="button"
        class="link-btn-party"
        @click="handleBack"
      >
        {{ joinCopy.back }}
      </button>
    </section>
  </main>
</template>

<style lang="scss" scoped>
.join-page {
  justify-content: center;
  max-width: 28rem;
  margin: 0 auto;
}
</style>
