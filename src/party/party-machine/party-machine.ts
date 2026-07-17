import { assign, setup } from 'xstate';

export type PartyMachinePhase =
  | 'lobby'
  | 'miniGameIntro'
  | 'miniGamePlay'
  | 'roundResult'
  | 'suddenDeathIntro'
  | 'partyEnd';

export type PartyRoundOutcomeType = 'continue' | 'end' | 'suddenDeath';

export interface PartyMachineContext {
  roundIndex: number;
  currentMiniGameId: string | null;
  lastRankings: string[];
  winnerIds: string[];
  isSuddenDeath: boolean;
  roundOutcome: PartyRoundOutcomeType | null;
}

export type PartyMachineEvent =
  | { type: 'START_PARTY'; miniGameId: string }
  | { type: 'INTRO_COMPLETE' }
  | { type: 'MINIGAME_COMPLETE'; rankings: string[] }
  | { type: 'RESULT_ACK'; outcome: PartyRoundOutcomeType; winnerIds?: string[]; miniGameId?: string };

export const partyMachine = setup({
  types: {
    context: {} as PartyMachineContext,
    events: {} as PartyMachineEvent,
  },
}).createMachine({
  id: 'party',
  initial: 'lobby',
  context: {
    roundIndex: 0,
    currentMiniGameId: null,
    lastRankings: [],
    winnerIds: [],
    isSuddenDeath: false,
    roundOutcome: null,
  },
  states: {
    lobby: {
      on: {
        START_PARTY: {
          target: 'miniGameIntro',
          actions: assign({
            roundIndex: 1,
            currentMiniGameId: ({ event }) => event.miniGameId,
            lastRankings: [],
            winnerIds: [],
            isSuddenDeath: false,
            roundOutcome: null,
          }),
        },
      },
    },
    miniGameIntro: {
      on: {
        INTRO_COMPLETE: 'miniGamePlay',
      },
    },
    miniGamePlay: {
      on: {
        MINIGAME_COMPLETE: {
          target: 'roundResult',
          actions: assign({
            lastRankings: ({ event }) => event.rankings,
          }),
        },
      },
    },
    roundResult: {
      on: {
        RESULT_ACK: [
          {
            guard: ({ event }) => event.outcome === 'end',
            target: 'partyEnd',
            actions: assign({
              winnerIds: ({ event }) => event.winnerIds ?? [],
              roundOutcome: ({ event }) => event.outcome,
            }),
          },
          {
            guard: ({ event }) => event.outcome === 'suddenDeath',
            target: 'suddenDeathIntro',
            actions: assign({
              roundOutcome: ({ event }) => event.outcome,
              currentMiniGameId: ({ event }) => event.miniGameId ?? null,
            }),
          },
          {
            target: 'miniGameIntro',
            actions: assign({
              roundIndex: ({ context }) => context.roundIndex + 1,
              currentMiniGameId: ({ event }) => event.miniGameId ?? null,
              roundOutcome: ({ event }) => event.outcome,
            }),
          },
        ],
      },
    },
    suddenDeathIntro: {
      entry: assign({ isSuddenDeath: true }),
      on: {
        INTRO_COMPLETE: 'miniGamePlay',
      },
    },
    partyEnd: {},
  },
});
