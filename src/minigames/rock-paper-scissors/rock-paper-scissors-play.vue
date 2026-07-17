<script setup lang="ts">
import { computed } from 'vue';

import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import RpsChoiceIcon from '@/components/rps-choice-icon.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import {
  RPS_CHOICE_LABEL,
  rpsCopy,
} from '@/minigames/rock-paper-scissors/locales/zh-TW';
import type { RockPaperScissorsSnapshot } from '@/minigames/rock-paper-scissors';
import RockPaperScissorsScene from '@/minigames/rock-paper-scissors/rock-paper-scissors-scene.vue';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { Participant } from '@/types/party';
import type { RpsChoice } from '@/types/player-input';

const props = defineProps<{
  snapshot: RockPaperScissorsSnapshot;
  roundIndex: number;
}>();

const emit = defineEmits<{
  choose: [choice: RpsChoice];
  claim: [choice: RpsChoice];
}>();

const partyStore = usePartyStore();

const localParticipantId = computed(() => partyStore.localParticipantId);

const localChoice = computed(() => {
  if (!localParticipantId.value) {
    return null;
  }

  return props.snapshot.choices[localParticipantId.value] ?? null;
});

const localClaim = computed(() => {
  if (!localParticipantId.value) {
    return null;
  }

  return props.snapshot.claims[localParticipantId.value] ?? null;
});

const showActionBar = computed(
  () => props.snapshot.phase === 'roaming' && Boolean(localParticipantId.value),
);

const showComicPanels = computed(() => props.snapshot.isSplitView);

const showCrownCeremony = computed(() => props.snapshot.isCrownCeremony);

const crownCeremonyMessage = computed((): string => {
  const names = props.snapshot.crownWinnerIds
    .map((participantId) =>
      partyStore.participants.find((participant) => participant.id === participantId)?.displayName
      ?? participantId,
    )
    .join('、');

  if (!names) {
    return rpsCopy.crownCeremonyTitle;
  }

  if (names.includes('、')) {
    return rpsCopy.crownCeremonyWinners.replace('{names}', names);
  }

  return rpsCopy.crownCeremonyWinner.replace('{name}', names);
});

const phaseStatusText = computed(() => {
  if (props.snapshot.phase === 'focus') {
    return rpsCopy.focus;
  }

  if (props.snapshot.phase === 'reveal') {
    return rpsCopy.reveal;
  }

  return '';
});

function playerColorClass(color: Participant['color']): string {
  return `comic-panel--${color}`;
}

function choiceLabel(participantId: string): string {
  const choice = props.snapshot.choices[participantId];

  if (!choice) {
    return rpsCopy.choiceUnknown;
  }

  return RPS_CHOICE_LABEL[choice];
}

function choiceClass(participantId: string): string {
  const choice = props.snapshot.choices[participantId];

  if (!choice) {
    return 'comic-panel__callout--unknown';
  }

  return `comic-panel__callout--${choice}`;
}

function resultLabel(participantId: string): string {
  const result = props.snapshot.results[participantId];

  if (result === 'win') {
    return rpsCopy.resultWin;
  }

  if (result === 'lose') {
    return rpsCopy.resultLose;
  }

  if (result === 'tie') {
    return rpsCopy.resultTie;
  }

  return '';
}

function handleChoose(choice: RpsChoice): void {
  emit('choose', choice);
}

function handleClaim(choice: RpsChoice): void {
  emit('claim', choice);
}

const CONFETTI_PIECES = Array.from({ length: 14 }, (_, index) => {
  const angle = (index / 14) * Math.PI * 2;
  const radiusX = 3.8 + (index % 3) * 0.6;
  const radiusY = 2.6 + (index % 2) * 0.5;

  return {
    id: index,
    tx: `${Math.cos(angle) * radiusX}rem`,
    ty: `${Math.sin(angle) * radiusY}rem`,
    rot: `${Math.round((angle * 180) / Math.PI)}deg`,
    hue: (index * 41 + 18) % 360,
  };
});

function isWinner(participantId: string): boolean {
  return props.snapshot.showResults && props.snapshot.results[participantId] === 'win';
}

const roundLabel = computed(() =>
  partyCopy.roundLabel.replace('{round}', String(props.roundIndex)),
);

/** 瑪利歐派對風：座位固定 1P–4P，皇冠領先者另外標 */
const hudPlayers = computed(() => {
  const ranked = sortParticipantsByCrown(partyStore.participants);
  const leaderId =
    ranked[0] && ranked[0].crownCount > 0
      ? ranked[0].id
      : null;

  return partyStore.participants.map((participant, index) => ({
    participant,
    slot: index + 1,
    isLeader: participant.id === leaderId,
  }));
});

function playerSlotLabel(slot: number): string {
  return rpsCopy.playerSlotLabel.replace('{slot}', String(slot));
}

const isTimerUrgent = computed(
  () => props.snapshot.phase === 'roaming' && props.snapshot.roamingSecondsLeft <= 3,
);

function choiceWaitingText(choice: RpsChoice): string {
  return rpsCopy.choiceWaiting.replace('{choice}', RPS_CHOICE_LABEL[choice]);
}

function panelChoice(participantId: string): RpsChoice | null {
  return props.snapshot.choices[participantId] ?? null;
}

const CHOICE_BUTTONS = [
  { id: 'scissors' as const, label: rpsCopy.scissors },
  { id: 'rock' as const, label: rpsCopy.rock },
  { id: 'paper' as const, label: rpsCopy.paper },
];

function hudCardClass(color: Participant['color']): string {
  return `rps-hud__card--${color}`;
}
</script>

<template>
  <Teleport to="body">
    <div
      class="rps-stage"
      :class="{
        'rps-stage--split': showComicPanels,
        'rps-stage--crown-ceremony': showCrownCeremony,
      }"
    >
      <RockPaperScissorsScene
        :snapshot="snapshot"
        :participants="partyStore.participants"
        :local-participant-id="localParticipantId"
      />

      <!-- 分鏡／頒獎時讓畫面乾淨，不蓋住右上格 -->
      <aside
        v-if="!showComicPanels && !showCrownCeremony"
        class="rps-hud"
        :aria-label="rpsCopy.scoreboardTitle"
      >
        <div class="rps-hud__round font-game">{{ roundLabel }}</div>

        <ul class="rps-hud__list">
          <li
            v-for="row in hudPlayers"
            :key="row.participant.id"
            class="rps-hud__card"
            :class="[
              hudCardClass(row.participant.color),
              {
                'rps-hud__card--leader': row.isLeader,
                'rps-hud__card--local': row.participant.id === localParticipantId,
              },
            ]"
          >
            <div class="rps-hud__portrait-wrap">
              <div class="rps-hud__portrait">
                <!-- 跟結算排行榜同一套 3D 預覽，只裁成圓頭像 -->
                <AnimalModelPreview
                  compact
                  :animal-id="row.participant.animalId"
                  :player-color="row.participant.color"
                />
              </div>
              <span class="rps-hud__slot font-game">{{ playerSlotLabel(row.slot) }}</span>
            </div>

            <div class="rps-hud__body">
              <span class="rps-hud__name">
                {{ row.participant.displayName }}
                <span
                  v-if="row.participant.id === localParticipantId"
                  class="rps-hud__you"
                >{{ rpsCopy.localPlayerTag }}</span>
              </span>
            </div>

            <div class="rps-hud__crowns">
              <CuteCrownIcon
                size="md"
                :bounce="row.isLeader"
              />
              <span class="rps-hud__crown-count font-game">{{ row.participant.crownCount }}</span>
            </div>
          </li>
        </ul>

        <div
          v-if="snapshot.phase === 'roaming'"
          class="rps-hud__timer"
          :class="{ 'rps-hud__timer--urgent': isTimerUrgent }"
        >
          <span class="rps-hud__timer-label">{{ rpsCopy.chooseHint }}</span>
          <span class="rps-hud__timer-value font-game">{{ snapshot.roamingSecondsLeft }}</span>
        </div>
      </aside>

      <div
        v-if="showCrownCeremony"
        class="crown-ceremony"
        aria-live="polite"
      >
        <div class="crown-ceremony__burst" aria-hidden="true" />
        <p class="crown-ceremony__kicker font-game text-title">{{ rpsCopy.crownCeremonyTitle }}</p>
        <p class="crown-ceremony__message font-game text-title">{{ crownCeremonyMessage }}</p>
      </div>

      <p
        v-if="phaseStatusText && !showComicPanels && !showCrownCeremony"
        class="rps-stage__status"
      >
        {{ phaseStatusText }}
      </p>

      <div
        v-if="showComicPanels"
        class="comic-grid"
        aria-hidden="true"
      >
        <div
          v-for="(participant, index) in partyStore.participants"
          :key="participant.id"
          class="comic-panel"
          :class="[
            playerColorClass(participant.color),
            {
              'comic-panel--focus-enter': snapshot.phase === 'focus',
              'comic-panel--reveal': snapshot.showResults,
              'comic-panel--winner': isWinner(participant.id),
            },
          ]"
          :style="{ '--panel-index': index }"
        >
          <div class="comic-panel__flash" />

          <div class="comic-panel__viewport" />

          <div class="comic-panel__frame" />

          <div class="comic-panel__nameplate">
            <span class="comic-panel__index font-game">{{ index + 1 }}</span>
            <span class="comic-panel__name">{{ participant.displayName }}</span>
          </div>

          <div
            v-if="isWinner(participant.id)"
            class="comic-panel__win-sparkles"
            aria-hidden="true"
          >
            <span>★</span>
            <span>♥</span>
            <span>★</span>
          </div>

          <div
            class="comic-panel__callout"
            :class="choiceClass(participant.id)"
          >
            <p class="comic-panel__callout-kicker">
              {{ snapshot.phase === 'focus' ? rpsCopy.choiceReveal : rpsCopy.reveal }}
            </p>
            <div class="comic-panel__callout-choice">
              <RpsChoiceIcon
                class="comic-panel__choice-icon"
                :choice="panelChoice(participant.id)"
                size="md"
              />
              <span class="comic-panel__callout-label font-game">
                {{ choiceLabel(participant.id) }}
              </span>
            </div>
          </div>

          <div
            v-if="isWinner(participant.id)"
            class="comic-panel__confetti"
            aria-hidden="true"
          >
            <span
              v-for="piece in CONFETTI_PIECES"
              :key="piece.id"
              class="comic-panel__confetti-piece"
              :style="{
                '--tx': piece.tx,
                '--ty': piece.ty,
                '--rot': piece.rot,
                '--hue': `${piece.hue}deg`,
              }"
            />
          </div>

          <div
            v-if="snapshot.showResults"
            class="comic-panel__stamp font-game"
            :class="{
              'comic-panel__stamp--win': snapshot.results[participant.id] === 'win',
              'comic-panel__stamp--lose': snapshot.results[participant.id] === 'lose',
              'comic-panel__stamp--tie': snapshot.results[participant.id] === 'tie',
            }"
          >
            <span v-if="snapshot.results[participant.id] === 'win'" class="comic-panel__stamp-crown">
              <CuteCrownIcon size="sm" bounce />
            </span>
            {{ resultLabel(participant.id) }}
          </div>
        </div>
      </div>

      <div
        v-if="!showComicPanels"
        class="rps-stage__controls"
        :class="{ 'rps-stage__controls--choosing': showActionBar && !localChoice }"
      >
        <div
          v-if="snapshot.phase === 'roaming'"
          class="rps-stage__move-hints"
        >
          <span class="rps-stage__move-chip">{{ rpsCopy.moveHintWasd }}</span>
          <span class="rps-stage__move-chip">{{ rpsCopy.moveHintRun }}</span>
          <span class="rps-stage__move-chip">{{ rpsCopy.moveHintJump }}</span>
        </div>

        <div
          v-if="showActionBar && !localChoice"
          class="rps-choice-dock"
        >
          <p class="rps-choice-dock__prompt font-game">{{ rpsCopy.choosePrompt }}</p>
          <div class="rps-choice-dock__pads">
            <button
              v-for="(button, buttonIndex) in CHOICE_BUTTONS"
              :key="button.id"
              type="button"
              class="rps-choice-pad"
              :class="`rps-choice-pad--${button.id}`"
              :style="{ '--pad-delay': `${buttonIndex * 60}ms` }"
              @click="handleChoose(button.id)"
            >
              <span class="rps-choice-pad__icon">
                <RpsChoiceIcon
                  :choice="button.id"
                  size="lg"
                />
              </span>
              <span class="rps-choice-pad__label font-game">{{ button.label }}</span>
            </button>
          </div>
        </div>

        <!-- 唬爛：點 icon → 頭上出現同款 icon 框（無文字） -->
        <div
          v-if="showActionBar"
          class="rps-bluff-bar"
          :class="{ 'rps-bluff-bar--active': Boolean(localClaim) }"
        >
          <div class="rps-bluff-bar__pads">
            <button
              v-for="button in CHOICE_BUTTONS"
              :key="`claim-${button.id}`"
              type="button"
              class="rps-bluff-chip"
              :class="[
                `rps-bluff-chip--${button.id}`,
                { 'rps-bluff-chip--active': localClaim === button.id },
              ]"
              :aria-label="`${rpsCopy.bluffPrompt} ${button.label}`"
              @click="handleClaim(button.id)"
            >
              <RpsChoiceIcon
                :choice="button.id"
                size="sm"
              />
            </button>
          </div>
          <p class="rps-bluff-bar__hint text-xs text-muted text-center">
            {{ rpsCopy.bluffHint }}
          </p>
        </div>

        <div
          v-if="showActionBar && localChoice"
          class="rps-choice-locked"
        >
          <span
            class="rps-choice-locked__badge"
            :class="`rps-choice-locked__badge--${localChoice}`"
          >
            <RpsChoiceIcon
              :choice="localChoice"
              size="lg"
              bounce
            />
            <span class="rps-choice-locked__tag font-game">{{ rpsCopy.choiceLocked }}</span>
          </span>
          <p class="rps-choice-locked__text">{{ choiceWaitingText(localChoice) }}</p>
        </div>

        <p
          v-else-if="snapshot.phase === 'focus'"
          class="rps-stage__waiting rps-stage__waiting--focus font-game"
        >
          {{ rpsCopy.focus }}
        </p>

        <p
          v-else-if="snapshot.phase === 'reveal'"
          class="rps-stage__waiting rps-stage__waiting--reveal font-game"
        >
          {{ rpsCopy.reveal }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.rps-stage {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  background: #b8dce8;

  &--split {
    background: #1a1524;
  }

  &--crown-ceremony {
    background: linear-gradient(180deg, rgba(88, 76, 118, 0.92), rgba(46, 38, 64, 0.96));
  }
}

.crown-ceremony {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-sm);
  padding-top: calc(var(--space-xl) + env(safe-area-inset-top));
  pointer-events: none;
  animation: crown-ceremony-fade 0.45s ease backwards;
}

.crown-ceremony__burst {
  position: absolute;
  top: calc(var(--space-lg) + env(safe-area-inset-top));
  width: min(18rem, 72vw);
  height: min(18rem, 72vw);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-warning) 42%, transparent) 0%,
    color-mix(in srgb, var(--color-warning) 12%, transparent) 42%,
    transparent 72%
  );
  animation: crown-ceremony-burst 1.1s ease-in-out infinite;
}

.crown-ceremony__kicker {
  position: relative;
  margin: 0;
  font-size: var(--font-size-lg);
  letter-spacing: 0.12em;
  color: #f5f0e8;
  animation: crown-ceremony-pop 0.55s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
}

.crown-ceremony__message {
  position: relative;
  margin: 0;
  padding: 0 var(--space-md);
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  text-align: center;
  color: var(--color-warning);
  text-shadow: 0 var(--space-xs) 0 rgba(26, 21, 36, 0.35);
  animation: crown-ceremony-pop 0.62s cubic-bezier(0.22, 1.08, 0.36, 1) 0.08s backwards;
}

@keyframes crown-ceremony-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes crown-ceremony-pop {
  from {
    opacity: 0;
    transform: translateY(var(--space-md)) scale(0.88);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes crown-ceremony-burst {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.96);
  }

  50% {
    opacity: 1;
    transform: scale(1.04);
  }
}

.rps-stage__status {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.88);
  font-family: var(--font-family-game);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  pointer-events: none;
  white-space: nowrap;
}

/* 瑪利歐派對風：大頭像 + 右對齊皇冠 */
.rps-hud {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  right: calc(var(--space-md) + env(safe-area-inset-right));
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-xs);
  width: min(13.5rem, 48vw);
  pointer-events: none;
}

.rps-hud__round {
  align-self: flex-end;
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid color-mix(in srgb, var(--color-border) 70%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface) 94%, white);
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  color: var(--color-text);
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-border) 40%, transparent);
}

.rps-hud__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rps-hud__card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-xs);
  border: 3px solid var(--hud-tone);
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--hud-tone) 34%, white) 0%,
    color-mix(in srgb, var(--color-surface) 70%, white) 55%,
    white 100%
  );
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--hud-tone) 42%, transparent);

  &--player-1 {
    --hud-tone: var(--color-player-1);
  }

  &--player-2 {
    --hud-tone: var(--color-player-2);
  }

  &--player-3 {
    --hud-tone: var(--color-player-3);
  }

  &--player-4 {
    --hud-tone: var(--color-player-4);
  }

  &--leader {
    box-shadow:
      3px 3px 0 color-mix(in srgb, var(--hud-tone) 42%, transparent),
      0 0 0 2px color-mix(in srgb, var(--color-warning) 60%, white);
  }

  &--local {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 60%, white);
    outline-offset: 1px;
  }
}

.rps-hud__portrait-wrap {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
}

.rps-hud__portrait {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 3px solid color-mix(in srgb, var(--hud-tone) 55%, white);
  border-radius: 50%;
  background: color-mix(in srgb, var(--hud-tone) 14%, white);
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, white 70%, transparent),
    2px 2px 0 color-mix(in srgb, var(--hud-tone) 28%, transparent);

  /* 與排行榜同一套 compact 預覽，裁進圓框 */
  :deep(.animal-preview__canvas) {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: transparent;
  }
}

.rps-hud__slot {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  min-width: 1.35rem;
  padding: 0 var(--space-xs);
  border: 2px solid var(--color-on-accent);
  border-radius: var(--radius-sm);
  background: var(--hud-tone);
  font-size: var(--font-size-xs);
  line-height: 1.15;
  color: var(--color-on-accent);
  box-shadow: 1px 1px 0 color-mix(in srgb, var(--hud-tone) 45%, transparent);
  transform: translate(-20%, 20%);
}

.rps-hud__body {
  min-width: 0;
}

.rps-hud__name {
  display: block;
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rps-hud__you {
  margin-left: 2px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  font-size: var(--font-size-xs);
  color: var(--color-accent);
  vertical-align: middle;
}

.rps-hud__crowns {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 2.25rem;
}

.rps-hud__crown-count {
  font-size: var(--font-size-2xl);
  line-height: 1;
  color: var(--color-text-heading);
  text-shadow: 1px 1px 0 color-mix(in srgb, var(--color-warning) 40%, white);
}

.rps-hud__timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-height: 2.5rem;
  padding: 0 var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--color-accent) 40%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 12%, white);

  &--urgent {
    border-color: color-mix(in srgb, var(--color-accent) 70%, white);
    background: color-mix(in srgb, var(--color-accent) 22%, white);
  }
}

.rps-hud__timer-label {
  display: flex;
  align-items: center;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--color-text-muted);
}

.rps-hud__timer-value {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  font-size: var(--font-size-xl);
  line-height: 1;
  color: var(--color-accent);
  text-align: center;
  /* 遊戲字型基線偏上，往下拉回垂直中心 */
  padding-top: 0.14em;

  .rps-hud__timer--urgent & {
    font-weight: var(--font-weight-bold);
  }
}

.comic-grid {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: transparent;
  pointer-events: none;
}

.comic-panel {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: transparent;

  &--player-1 {
    --panel-accent: var(--color-player-1);
    --panel-soft: rgba(232, 107, 138, 0.28);
  }

  &--player-2 {
    --panel-accent: var(--color-player-2);
    --panel-soft: rgba(155, 127, 212, 0.28);
  }

  &--player-3 {
    --panel-accent: var(--color-player-3);
    --panel-soft: rgba(107, 168, 232, 0.28);
  }

  &--player-4 {
    --panel-accent: var(--color-player-4);
    --panel-soft: rgba(126, 207, 154, 0.28);
  }

  &--focus-enter {
    .comic-panel__flash {
      animation: snapshot-flash 0.42s ease-out forwards;
      animation-delay: calc(var(--panel-index) * 70ms);
    }

    .comic-panel__frame {
      animation: frame-pop 0.48s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
      animation-delay: calc(var(--panel-index) * 70ms + 40ms);
    }

    .comic-panel__nameplate {
      animation: nameplate-slide-in 0.5s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
      animation-delay: calc(var(--panel-index) * 70ms + 80ms);
    }

    .comic-panel__callout {
      animation: callout-rise-in 0.52s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
      animation-delay: calc(var(--panel-index) * 70ms + 140ms);
    }
  }

  &--winner {
    .comic-panel__frame {
      animation: winner-glow 1.1s ease-in-out infinite alternate;
    }
  }

  &--reveal .comic-panel__callout {
    animation: callout-settle 0.35s ease-out;
  }
}

.comic-panel__flash {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.72) 0%, transparent 68%);
  opacity: 0;
  pointer-events: none;
}

.comic-panel__confetti {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  overflow: hidden;
}

.comic-panel__confetti-piece {
  position: absolute;
  top: 40%;
  left: 50%;
  width: 0.45rem;
  height: 0.75rem;
  border-radius: 2px;
  background: hsl(var(--hue), 88%, 62%);
  opacity: 0;
  animation: confetti-burst 0.95s cubic-bezier(0.22, 0.85, 0.3, 1) forwards;
  animation-delay: calc(var(--i, 0) * 25ms + 120ms);
  transform: translate(-50%, -50%) rotate(var(--rot));
}

.comic-panel__confetti-piece:nth-child(odd) {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}

.comic-panel__confetti-piece:nth-child(1) { --i: 0; }
.comic-panel__confetti-piece:nth-child(2) { --i: 1; }
.comic-panel__confetti-piece:nth-child(3) { --i: 2; }
.comic-panel__confetti-piece:nth-child(4) { --i: 3; }
.comic-panel__confetti-piece:nth-child(5) { --i: 4; }
.comic-panel__confetti-piece:nth-child(6) { --i: 5; }
.comic-panel__confetti-piece:nth-child(7) { --i: 6; }
.comic-panel__confetti-piece:nth-child(8) { --i: 7; }
.comic-panel__confetti-piece:nth-child(9) { --i: 8; }
.comic-panel__confetti-piece:nth-child(10) { --i: 9; }
.comic-panel__confetti-piece:nth-child(11) { --i: 10; }
.comic-panel__confetti-piece:nth-child(12) { --i: 11; }
.comic-panel__confetti-piece:nth-child(13) { --i: 12; }
.comic-panel__confetti-piece:nth-child(14) { --i: 13; }

.comic-panel__viewport {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.comic-panel__frame {
  position: absolute;
  inset: 0;
  border: 5px solid var(--panel-accent, var(--color-accent));
  border-radius: var(--radius-md);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.55),
    4px 4px 0 rgba(92, 77, 130, 0.16);
  pointer-events: none;
}

.comic-panel__win-sparkles {
  position: absolute;
  top: 14%;
  right: 12%;
  z-index: 3;
  display: flex;
  gap: var(--space-xs);
  pointer-events: none;

  span {
    font-size: var(--font-size-sm);
    color: var(--color-warning);
    opacity: 0;
    animation: win-sparkle-pop 0.8s ease-in-out infinite;

    &:nth-child(1) {
      animation-delay: 0s;
    }

    &:nth-child(2) {
      animation-delay: 0.2s;
      color: var(--color-player-1);
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

.comic-panel__nameplate {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-xs);
  border: 2px solid var(--panel-accent, var(--color-accent));
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.14);
}

.comic-panel__index {
  width: 1.5rem;
  height: 1.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--panel-accent, var(--color-accent));
  font-size: var(--font-size-xs);
  line-height: 1;
  color: var(--color-on-accent);
}

.comic-panel__name {
  max-width: 6.5rem;
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-panel__callout {
  position: absolute;
  right: var(--space-sm);
  bottom: var(--space-sm);
  left: var(--space-sm);
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: 4.25rem;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-border) 80%, white);
  border-radius: var(--radius-md);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-border) 55%, transparent);

  &--rock {
    background: color-mix(in srgb, var(--color-text-muted) 16%, white);
  }

  &--paper {
    background: color-mix(in srgb, var(--color-warning) 22%, white);
  }

  &--scissors {
    background: color-mix(in srgb, var(--color-player-3) 18%, white);
  }

  &--unknown {
    background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
  }
}

.comic-panel__callout-kicker {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.1em;
  line-height: 1;
  color: var(--color-text-muted);
  text-align: center;
}

.comic-panel__callout-choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 2.5rem;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, white 72%, transparent);
  color: var(--color-text-heading);

  .comic-panel__callout--unknown & {
    color: var(--color-text-muted);
  }
}

.comic-panel__choice-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  line-height: 0;

  /* SVG 下方陰影會讓視覺重心偏低，往上微調對齊文字 */
  :deep(.rps-choice-icon__svg) {
    transform: translateY(-8%);
  }
}

.comic-panel__callout-label {
  display: inline-flex;
  align-items: center;
  font-size: clamp(1.15rem, 3.4vw, 1.5rem);
  line-height: 1;
  letter-spacing: 0.06em;
  /* 遊戲字型基線偏下，光學校正 */
  padding-top: 0.12em;
}

.comic-panel__stamp {
  position: absolute;
  top: 36%;
  left: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  min-width: 4.5rem;
  padding: var(--space-sm) var(--space-md);
  border: 4px solid currentcolor;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.88);
  font-size: clamp(1.4rem, 4.5vw, 2rem);
  line-height: 1;
  letter-spacing: 0.1em;
  transform: translate(-50%, -50%) scale(0.2);
  opacity: 0;
  animation: stamp-in 0.5s cubic-bezier(0.22, 1.12, 0.36, 1) forwards;
  pointer-events: none;
  box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.14);

  &--win {
    border-color: color-mix(in srgb, var(--color-warning) 55%, white);
    color: #8a5a12;
    background: linear-gradient(180deg, #fff9dc 0%, #ffeaa0 100%);
    animation:
      stamp-in 0.5s cubic-bezier(0.22, 1.12, 0.36, 1) forwards,
      stamp-bounce 0.9s ease-in-out 0.55s infinite;
  }

  &--lose {
    border-color: color-mix(in srgb, var(--color-text-muted) 35%, white);
    color: var(--color-text-muted);
    background: rgba(255, 255, 255, 0.82);
  }

  &--tie {
    border-color: color-mix(in srgb, var(--color-warning) 40%, white);
    color: #9a7a20;
    background: linear-gradient(180deg, #fff8e8 0%, #ffe8b0 100%);
  }
}

.comic-panel__stamp-crown {
  line-height: 0;
}

.rps-stage :deep(.rps-scene__canvas) {
  position: absolute;
  inset: 0;
  z-index: 1;
}

@keyframes snapshot-flash {
  0% {
    opacity: 0.85;
  }

  100% {
    opacity: 0;
  }
}

@keyframes frame-pop {
  0% {
    transform: scale(0.94);
    opacity: 0.55;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes nameplate-slide-in {
  0% {
    opacity: 0;
    transform: translate(-40%, -8px);
  }

  100% {
    opacity: 1;
    transform: translate(0, 0);
  }
}

@keyframes callout-rise-in {
  0% {
    opacity: 0;
    transform: translateY(120%);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes confetti-burst {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--rot)) scale(0.3);
  }

  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(calc(var(--rot) + 180deg)) scale(1);
  }
}

@keyframes winner-glow {
  from {
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.55),
      0 0 0 rgba(255, 216, 107, 0);
  }

  to {
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.55),
      0 0 var(--space-lg) color-mix(in srgb, var(--color-warning) 45%, transparent);
  }
}

@keyframes win-sparkle-pop {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85) rotate(-8deg);
  }

  50% {
    opacity: 1;
    transform: scale(1.1) rotate(8deg);
  }
}

@keyframes stamp-bounce {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    transform: translate(-50%, -50%) scale(1.05);
  }
}

@keyframes stamp-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.2);
  }

  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.08);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes callout-settle {
  from {
    transform: translateY(6px);
  }

  to {
    transform: translateY(0);
  }
}

.rps-stage__controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-md) calc(var(--space-lg) + env(safe-area-inset-bottom));
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(184, 220, 232, 0) 0%,
    rgba(232, 223, 245, 0.55) 38%,
    rgba(232, 223, 245, 0.92) 100%
  );

  &--choosing {
    padding-top: var(--space-xl);
  }
}

.rps-stage__move-hints {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-xs);
}

.rps-stage__move-chip {
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 2px 2px 0 rgba(92, 77, 130, 0.1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.rps-bluff-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  width: min(100%, 22rem);
  pointer-events: auto;
}

.rps-bluff-bar__pads {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
}

.rps-bluff-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 2px 2px 0 rgba(92, 77, 130, 0.1);
  cursor: pointer;

  &--active {
    border-color: color-mix(in srgb, var(--color-warning) 60%, white);
    background: color-mix(in srgb, var(--color-warning) 24%, white);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-warning) 30%, transparent);
    transform: scale(1.06);
  }

  &:active {
    transform: scale(0.94);
  }
}

.rps-bluff-bar__hint {
  margin: 0;
}

.rps-choice-dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  width: min(100%, 26rem);
  padding: var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.95) 0%,
    color-mix(in srgb, var(--color-accent) 10%, white) 100%
  );
  box-shadow:
    5px 5px 0 rgba(92, 77, 130, 0.14),
    0 var(--space-md) var(--space-xl) rgba(92, 77, 130, 0.1);
  pointer-events: auto;
  animation: rps-choice-dock-in 0.42s cubic-bezier(0.22, 1.12, 0.36, 1) backwards;
}

.rps-choice-dock__prompt {
  margin: 0;
  color: var(--color-text-heading);
  font-size: var(--font-size-md);
  letter-spacing: 0.08em;
}

.rps-choice-dock__pads {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
  width: 100%;
}

.rps-choice-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-xs) var(--space-sm);
  border: 3px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.12);
  cursor: pointer;
  animation: rps-choice-pad-pop 0.45s cubic-bezier(0.22, 1.12, 0.36, 1) backwards;
  animation-delay: var(--pad-delay, 0ms);
  transition:
    transform 0.16s cubic-bezier(0.22, 1.12, 0.36, 1),
    box-shadow 0.16s ease;

  &:hover {
    transform: translateY(-4px) scale(1.04);
    box-shadow: 4px 6px 0 rgba(92, 77, 130, 0.16);
  }

  &:active {
    transform: translateY(1px) scale(0.96);
    box-shadow: 1px 1px 0 rgba(92, 77, 130, 0.12);
  }

  &--rock {
    background: linear-gradient(180deg, #f4f6f8 0%, #d6dce4 100%);
  }

  &--paper {
    background: linear-gradient(180deg, #fff9e8 0%, #ffe4a8 100%);
  }

  &--scissors {
    background: linear-gradient(180deg, #eef6ff 0%, #c8e4ff 100%);
  }
}

.rps-choice-pad__icon {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.9);
}

.rps-choice-pad__label {
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
}

.rps-choice-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  width: min(100%, 20rem);
  padding: var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.12);
  animation: rps-choice-dock-in 0.36s cubic-bezier(0.22, 1.12, 0.36, 1) backwards;
}

.rps-choice-locked__badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  min-width: 7rem;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid rgba(92, 77, 130, 0.16);
  border-radius: var(--radius-md);

  &--rock {
    background: linear-gradient(180deg, #f4f6f8 0%, #d6dce4 100%);
  }

  &--paper {
    background: linear-gradient(180deg, #fff9e8 0%, #ffe4a8 100%);
  }

  &--scissors {
    background: linear-gradient(180deg, #eef6ff 0%, #c8e4ff 100%);
  }
}

.rps-choice-locked__tag {
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.1em;
}

.rps-choice-locked__text {
  margin: 0;
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-align: center;
}

.rps-stage__waiting {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.12);
  color: var(--color-text-heading);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  text-align: center;
  pointer-events: none;

  &--focus,
  &--reveal {
    font-size: var(--font-size-xl);
    letter-spacing: 0.08em;
  }
}

@keyframes rps-choice-dock-in {
  from {
    opacity: 0;
    transform: translateY(var(--space-md)) scale(0.94);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes rps-choice-pad-pop {
  from {
    opacity: 0;
    transform: translateY(var(--space-sm)) scale(0.8);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

</style>
