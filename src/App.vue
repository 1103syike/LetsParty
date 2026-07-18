<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';

import { partyAudio } from '@/common/audio/party-audio';
import PartyShell from '@/components/party-shell.vue';

onMounted(() => {
  partyAudio.bindAutoUnlock();
});
</script>

<template>
  <PartyShell>
    <RouterView />
  </PartyShell>
</template>
