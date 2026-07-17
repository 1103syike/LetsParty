<script setup lang="ts">
import BackgroundPolygonsFloating from '@/components/background-polygons-floating.vue';
</script>

<template>
  <div class="party-shell">
    <BackgroundPolygonsFloating />
    <div class="party-shell__content">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.party-shell {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

.party-shell__content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}
</style>
