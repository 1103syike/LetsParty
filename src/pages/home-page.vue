<script setup lang="ts">
import { useRouter } from 'vue-router';

import { createRoomId } from '@/common/room-id';
import ActionButton from '@/components/action-button.vue';
import PartyTitle from '@/components/party-title.vue';
import { homeCopy } from '@/locales/zh-TW/home';
import { usePartyStore } from '@/stores/party-store';

const router = useRouter();
const partyStore = usePartyStore();

function handleCreateRoom(): void {
  const roomId = createRoomId();
  partyStore.createRoom(roomId);
  router.push({ name: 'room', params: { id: roomId } });
}

function handleGoJoin(): void {
  router.push({ name: 'join' });
}
</script>

<template>
  <main class="home-page flex flex-col flex-center gap-xl pad-lg min-h-screen">
    <PartyTitle />

    <div class="home-actions flex flex-col gap-lg full-width">
      <ActionButton variant="hero" @click="handleCreateRoom">
        {{ homeCopy.createRoom }}
      </ActionButton>
      <ActionButton variant="hero" @click="handleGoJoin">
        {{ homeCopy.joinRoom }}
      </ActionButton>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.home-actions {
  max-width: 28rem;
}
</style>
