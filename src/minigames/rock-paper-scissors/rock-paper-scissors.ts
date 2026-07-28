import type { RpsChoice } from '@/types/player-input';

export type RpsPhase = 'roaming' | 'focus' | 'reveal' | 'crownAward' | 'finished';

export type RpsOutcome = 'win' | 'lose' | 'tie';

export const ROAMING_DURATION_MS = 15000;
export const FOCUS_DURATION_MS = 2200;
export const REVEAL_DURATION_MS = 2800;
export const CROWN_AWARD_DURATION_MS = 3400;

/** 多人頒冠時拉長一點，鏡頭與落冠都來得及看完 */
export function resolveCrownAwardDurationMs(winnerCount: number): number {
  return CROWN_AWARD_DURATION_MS + Math.max(0, winnerCount - 1) * 450;
}


const RPS_CHOICES: RpsChoice[] = ['rock', 'paper', 'scissors'];

function randomChoice(): RpsChoice {
  const index = Math.floor(Math.random() * RPS_CHOICES.length);

  return RPS_CHOICES[index];
}

function beats(left: RpsChoice, right: RpsChoice): boolean {
  if (left === 'rock' && right === 'scissors') {
    return true;
  }

  if (left === 'scissors' && right === 'paper') {
    return true;
  }

  if (left === 'paper' && right === 'rock') {
    return true;
  }

  return false;
}

function resolveWinningChoices(choices: RpsChoice[]): RpsChoice[] | null {
  const uniqueChoices = [...new Set(choices)];

  if (uniqueChoices.length === 1 || uniqueChoices.length === 3) {
    return null;
  }

  const left = uniqueChoices[0];
  const right = uniqueChoices[1];

  return beats(left, right) ? [left] : [right];
}

export interface RockPaperScissorsSnapshot {
  phase: RpsPhase;
  roamingSecondsLeft: number;
  /** 真實出拳：漫遊中只有自己看得到，分鏡後全員可見 */
  choices: Record<string, RpsChoice | null>;
  /** 唬爛宣稱：漫遊中全員可見、可改；分鏡後不再顯示 */
  claims: Record<string, RpsChoice | null>;
  results: Record<string, RpsOutcome | null>;
  showResults: boolean;
  isSplitView: boolean;
  isCrownCeremony: boolean;
  crownWinnerIds: string[];
  crownAwardDurationMs: number;
}

export class RockPaperScissorsGame {
  private readonly participantIds: string[];

  private phase: RpsPhase = 'roaming';

  private elapsedMs = 0;

  private crownAwardStartedAt = 0;

  private crownAwardDurationMs = CROWN_AWARD_DURATION_MS;

  private readonly choices = new Map<string, RpsChoice>();

  private readonly claims = new Map<string, RpsChoice>();

  private readonly results = new Map<string, RpsOutcome>();

  constructor(participantIds: string[]) {
    this.participantIds = participantIds;
  }

  start(): void {
    this.phase = 'roaming';
    this.elapsedMs = 0;
    this.choices.clear();
    this.claims.clear();
    this.results.clear();
  }

  onPlayerInput(
    playerId: string,
    input: { type: string; choice?: RpsChoice },
  ): void {
    if (this.phase !== 'roaming' || !input.choice) {
      return;
    }

    if (input.type === 'rps-claim') {
      // CPU 唬爛只准設一次，之後鎖定
      if (playerId.startsWith('cpu-') && this.claims.has(playerId)) {
        return;
      }

      this.claims.set(playerId, input.choice);
      return;
    }

    if (input.type !== 'rps') {
      return;
    }

    if (this.choices.has(playerId)) {
      return;
    }

    this.choices.set(playerId, input.choice);

    // CPU 選完真拳立刻唬爛一次，之後不再改
    if (playerId.startsWith('cpu-') && !this.claims.has(playerId)) {
      this.claims.set(playerId, this.pickCpuBluffClaim(playerId));
    }
  }

  getCpuInput(
    cpuId: string,
    _deltaMs: number,
  ):
    | { type: 'rps'; choice: RpsChoice }
    | { type: 'rps-claim'; choice: RpsChoice }
    | { type: 'button'; button: string } {
    if (this.phase !== 'roaming') {
      return { type: 'button', button: 'idle' };
    }

    // 已唬爛：只閒置，絕不再送 rps-claim
    if (this.claims.has(cpuId)) {
      return { type: 'button', button: 'idle' };
    }

    const cpuIndex = Math.max(0, this.participantIds.indexOf(cpuId));
    // 錯開時間選真拳；onPlayerInput 會順便鎖死唬爛
    const chooseAtMs = 550 + cpuIndex * 400;

    if (!this.choices.has(cpuId) && this.elapsedMs >= chooseAtMs) {
      return { type: 'rps', choice: randomChoice() };
    }

    return { type: 'button', button: 'idle' };
  }

  /** 唬爛傾向跟真拳不同，才像在騙人 */
  private pickCpuBluffClaim(cpuId: string): RpsChoice {
    const realChoice = this.choices.get(cpuId);
    const bluff = randomChoice();

    if (!realChoice || bluff !== realChoice || Math.random() < 0.25) {
      return bluff;
    }

    const others = RPS_CHOICES.filter((choice) => choice !== realChoice);
    return others[Math.floor(Math.random() * others.length)] ?? bluff;
  }

  onTick(deltaMs: number): void {
    if (this.phase === 'finished') {
      return;
    }

    this.elapsedMs += deltaMs;

    if (this.phase === 'roaming' && this.elapsedMs >= ROAMING_DURATION_MS) {
      this.finalizeChoices();
      this.computeResults();
      this.phase = 'focus';
    }

    if (this.phase === 'focus' && this.elapsedMs >= ROAMING_DURATION_MS + FOCUS_DURATION_MS) {
      this.phase = 'reveal';
    }

    if (
      this.phase === 'reveal'
      && this.elapsedMs >= ROAMING_DURATION_MS + FOCUS_DURATION_MS + REVEAL_DURATION_MS
    ) {
      if (this.hasCrownWinners()) {
        this.phase = 'crownAward';
        this.crownAwardStartedAt = this.elapsedMs;
        this.crownAwardDurationMs = resolveCrownAwardDurationMs(
          this.participantIds.filter((id) => this.results.get(id) === 'win').length,
        );
      } else {
        this.phase = 'finished';
      }
    }

    if (
      this.phase === 'crownAward'
      && this.elapsedMs >= this.crownAwardStartedAt + this.crownAwardDurationMs
    ) {
      this.phase = 'finished';
    }
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  getSnapshot(localPlayerId: string | null): RockPaperScissorsSnapshot {
    const showResults = this.phase === 'reveal' || this.phase === 'crownAward' || this.phase === 'finished';
    const isSplitView = this.phase === 'focus' || this.phase === 'reveal';
    const isCrownCeremony = this.phase === 'crownAward';
    const crownWinnerIds = this.participantIds.filter(
      (participantId) => this.results.get(participantId) === 'win',
    );
    const roamingMsLeft = Math.max(0, ROAMING_DURATION_MS - this.elapsedMs);
    const choices: Record<string, RpsChoice | null> = {};
    const claims: Record<string, RpsChoice | null> = {};

    for (const participantId of this.participantIds) {
      const choice = this.choices.get(participantId) ?? null;

      if (isSplitView || this.phase === 'finished' || this.phase === 'crownAward') {
        choices[participantId] = choice;
      } else if (participantId === localPlayerId) {
        choices[participantId] = choice;
      } else {
        choices[participantId] = null;
      }

      // 唬爛只在漫遊給大家看；分鏡後改秀真拳
      claims[participantId] = this.phase === 'roaming'
        ? (this.claims.get(participantId) ?? null)
        : null;
    }

    const results: Record<string, RpsOutcome | null> = {};

    for (const participantId of this.participantIds) {
      results[participantId] = showResults ? (this.results.get(participantId) ?? null) : null;
    }

    return {
      phase: this.phase,
      roamingSecondsLeft: Math.ceil(roamingMsLeft / 1000),
      choices,
      claims,
      results,
      showResults,
      isSplitView,
      isCrownCeremony,
      crownWinnerIds,
      crownAwardDurationMs: this.crownAwardDurationMs,
    };
  }

  getRankings(): string[] {
    const winners = this.participantIds.filter((id) => this.results.get(id) === 'win');
    const losers = this.participantIds.filter((id) => this.results.get(id) === 'lose');
    const ties = this.participantIds.filter((id) => this.results.get(id) === 'tie');

    return [...winners, ...losers, ...ties];
  }

  getCrownAwards(): Record<string, number> {
    const awards: Record<string, number> = {};

    for (const participantId of this.participantIds) {
      awards[participantId] = this.results.get(participantId) === 'win' ? 1 : 0;
    }

    return awards;
  }

  getRoundResults(): Record<string, RpsOutcome> {
    const roundResults: Record<string, RpsOutcome> = {};

    for (const participantId of this.participantIds) {
      const outcome = this.results.get(participantId);

      if (outcome) {
        roundResults[participantId] = outcome;
      }
    }

    return roundResults;
  }

  dispose(): void {
    this.choices.clear();
    this.claims.clear();
    this.results.clear();
    this.phase = 'finished';
  }

  private hasCrownWinners(): boolean {
    for (const participantId of this.participantIds) {
      if (this.results.get(participantId) === 'win') {
        return true;
      }
    }

    return false;
  }

  private finalizeChoices(): void {
    for (const participantId of this.participantIds) {
      if (!this.choices.has(participantId)) {
        this.choices.set(participantId, randomChoice());
      }
    }
  }

  private computeResults(): void {
    const allChoices = this.participantIds.map((id) => this.choices.get(id) as RpsChoice);
    const winningChoices = resolveWinningChoices(allChoices);

    for (const participantId of this.participantIds) {
      if (!winningChoices) {
        this.results.set(participantId, 'tie');
        continue;
      }

      const choice = this.choices.get(participantId);

      if (!choice) {
        this.results.set(participantId, 'tie');
        continue;
      }

      if (winningChoices.includes(choice)) {
        this.results.set(participantId, 'win');
        continue;
      }

      this.results.set(participantId, 'lose');
    }
  }
}
