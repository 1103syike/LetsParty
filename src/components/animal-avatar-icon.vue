<script setup lang="ts">
import { computed } from 'vue';

import { normalizeAnimalId } from '@/common/animals/animals';
import type { AnimalId } from '@/types/animal';

const props = withDefaults(
  defineProps<{
    animalId: AnimalId | 'fox';
    size?: 'sm' | 'md' | 'lg' | 'fill';
  }>(),
  {
    size: 'md',
  },
);

const resolvedAnimalId = computed(() => normalizeAnimalId(props.animalId));
</script>

<template>
  <span
    class="animal-avatar-icon"
    :class="[
      `animal-avatar-icon--${size}`,
      `animal-avatar-icon--${resolvedAnimalId}`,
    ]"
    aria-hidden="true"
  >
    <!-- 豬：正面臉 -->
    <svg
      v-if="resolvedAnimalId === 'pig'"
      class="animal-avatar-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="22" fill="#ffc4d4" />
      <ellipse cx="10" cy="18" rx="5" ry="7" fill="#f5a8bc" />
      <ellipse cx="38" cy="18" rx="5" ry="7" fill="#f5a8bc" />
      <ellipse cx="24" cy="29" rx="10" ry="7.5" fill="#ffe0ea" />
      <ellipse cx="20" cy="29" rx="2.2" ry="2.6" fill="#e86b8a" />
      <ellipse cx="28" cy="29" rx="2.2" ry="2.6" fill="#e86b8a" />
      <circle cx="17" cy="20" r="2.4" fill="#5c4d82" />
      <circle cx="31" cy="20" r="2.4" fill="#5c4d82" />
      <circle cx="17.8" cy="19.2" r="0.8" fill="#fff" />
      <circle cx="31.8" cy="19.2" r="0.8" fill="#fff" />
    </svg>

    <!-- 雞：正面臉 -->
    <svg
      v-else-if="resolvedAnimalId === 'chicken'"
      class="animal-avatar-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="26" r="18" fill="#fff4d6" />
      <path
        d="M16 14c2-5 5.5-8 8-8s6 3 8 8c-2.5-1-5.5-1.2-8-1.2S18.5 13 16 14z"
        fill="#e86b8a"
      />
      <path d="M22 30h4l-2 5-2-5z" fill="#fbbf24" />
      <circle cx="18" cy="24" r="2.4" fill="#5c4d82" />
      <circle cx="30" cy="24" r="2.4" fill="#5c4d82" />
      <circle cx="18.8" cy="23.2" r="0.75" fill="#fff" />
      <circle cx="30.8" cy="23.2" r="0.75" fill="#fff" />
      <ellipse cx="24" cy="36" rx="6" ry="2.4" fill="#f5d9a0" />
    </svg>

    <!-- 狗：正面臉 -->
    <svg
      v-else-if="resolvedAnimalId === 'dog'"
      class="animal-avatar-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="10" cy="16" rx="6" ry="9" fill="#c4a484" />
      <ellipse cx="38" cy="16" rx="6" ry="9" fill="#c4a484" />
      <circle cx="24" cy="24" r="18" fill="#e8c9a8" />
      <ellipse cx="24" cy="29" rx="8" ry="6.5" fill="#f3e0c8" />
      <ellipse cx="24" cy="31" rx="2.6" ry="2" fill="#5c4d82" />
      <circle cx="17" cy="21" r="2.4" fill="#5c4d82" />
      <circle cx="31" cy="21" r="2.4" fill="#5c4d82" />
      <circle cx="17.8" cy="20.2" r="0.75" fill="#fff" />
      <circle cx="31.8" cy="20.2" r="0.75" fill="#fff" />
      <path
        d="M19 35c1.6 1.8 3.2 2.6 5 2.6s3.4-.8 5-2.6"
        stroke="#5c4d82"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>

    <!-- 羊：正面臉 -->
    <svg
      v-else
      class="animal-avatar-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="20" fill="#f2f0f6" />
      <circle cx="10" cy="14" r="6" fill="#e6e2ef" />
      <circle cx="38" cy="14" r="6" fill="#e6e2ef" />
      <circle cx="11" cy="34" r="5.5" fill="#e6e2ef" />
      <circle cx="37" cy="34" r="5.5" fill="#e6e2ef" />
      <ellipse cx="24" cy="26" rx="11" ry="9" fill="#ddd6ea" />
      <circle cx="18" cy="23" r="2.3" fill="#5c4d82" />
      <circle cx="30" cy="23" r="2.3" fill="#5c4d82" />
      <circle cx="18.8" cy="22.2" r="0.7" fill="#fff" />
      <circle cx="30.8" cy="22.2" r="0.7" fill="#fff" />
      <ellipse cx="24" cy="30" rx="2.4" ry="1.7" fill="#b8a4e0" />
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.animal-avatar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 0;

  &--sm {
    width: 1.5rem;
    height: 1.5rem;
  }

  &--md {
    width: 2.25rem;
    height: 2.25rem;
  }

  &--lg {
    width: 2.75rem;
    height: 2.75rem;
  }

  &--fill {
    width: 100%;
    height: 100%;
  }
}

.animal-avatar-icon__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
