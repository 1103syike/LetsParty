<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { partyAudio } from '@/common/audio/party-audio';
import { createRoomId } from '@/common/room-id';
import ActionButton from '@/components/action-button.vue';
import PartyTitle from '@/components/party-title.vue';
import { usePartyBgm } from '@/composables/use-party-bgm';
import { homeCopy } from '@/locales/zh-TW/home';
import { usePartyStore } from '@/stores/party-store';

const router = useRouter();
const partyStore = usePartyStore();

usePartyBgm({
  phase: computed(() => 'home'),
  gameId: computed(() => null),
});

/** 瀏覽器擋自動播放：首頁點一下就接上大廳 BGM */
function onHomeInteract(): void {
  void partyAudio.unlock().then(() => {
    partyAudio.playBgm('lobby');
  });
}

function handleCreateRoom(): void {
  const roomId = createRoomId();
  partyStore.createRoom(roomId);
  router.push({ name: 'room', params: { id: roomId } });
}

function handleGoJoin(): void {
  router.push({ name: 'join' });
}

function handleTestMode(): void {
  const roomId = createRoomId();
  partyStore.startTestSession(roomId);
  router.push({ name: 'room', params: { id: roomId } });
}
</script>

<template>
  <main
    class="home-page flex flex-col flex-center gap-xl pad-lg min-h-screen"
    @pointerdown="onHomeInteract"
  >
    <PartyTitle />

    <div class="home-actions flex flex-col gap-lg full-width">
      <ActionButton
        variant="hero"
        @click="handleCreateRoom"
      >
        {{ homeCopy.createRoom }}
      </ActionButton>
      <ActionButton
        variant="hero"
        @click="handleGoJoin"
      >
        {{ homeCopy.joinRoom }}
      </ActionButton>

      <div class="home-test flex flex-col gap-xs items-center">
        <ActionButton @click="handleTestMode">
          {{ homeCopy.testMode }}
        </ActionButton>
        <p class="home-test__hint text-xs text-muted text-center">
          {{ homeCopy.testModeHint }}
        </p>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.home-actions {
  max-width: 28rem;
}

.home-test {
  width: 100%;
  margin-top: var(--space-sm);
}

.home-test__hint {
  margin: 0;
}
</style>
