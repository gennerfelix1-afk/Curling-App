/** Score sheet and hammer logic of a match (pure data, no physics). */
export class Match {
  /** Points per end for each team. */
  readonly scores: [number[], number[]] = [[], []];
  /** Team that holds the last-stone advantage in the current end. */
  hammer: number;
  /** Current end (1-based). */
  end = 1;
  over = false;
  /** Winner once the match is over (-1 while running). */
  winner = -1;
  /** Team that conceded (-1 if none). */
  conceded = -1;

  constructor(readonly ends: number, hammer: number) {
    this.hammer = hammer;
  }

  total(team: number): number {
    return this.scores[team].reduce((a, b) => a + b, 0);
  }

  /** Team that delivers the first stone of the current end (the one without the hammer). */
  get firstTeam(): number {
    return 1 - this.hammer;
  }

  get isExtraEnd(): boolean {
    return this.end > this.ends;
  }

  /** Team delivering the n-th stone (0-based) of the current end. */
  teamForShot(shot: number): number {
    return shot % 2 === 0 ? this.firstTeam : this.hammer;
  }

  /**
   * Record a finished end. The scoring team gives up the hammer; after a blank end the hammer
   * stays. After the scheduled ends, extra ends are played until the tie is broken.
   */
  recordEnd(team: number, points: number): void {
    if (this.over) return;
    this.scores[0].push(team === 0 ? points : 0);
    this.scores[1].push(team === 1 ? points : 0);
    if (team >= 0 && points > 0) this.hammer = 1 - team;
    if (this.end >= this.ends && this.total(0) !== this.total(1)) {
      this.over = true;
      this.winner = this.total(0) > this.total(1) ? 0 : 1;
    } else {
      this.end++;
    }
  }

  /** A team concedes: the match ends and the opponent wins. */
  concede(team: number): void {
    if (this.over) return;
    this.over = true;
    this.conceded = team;
    this.winner = 1 - team;
  }
}

export const POSITIONS = ['Lead', 'Second', 'Third', 'Skip'] as const;
