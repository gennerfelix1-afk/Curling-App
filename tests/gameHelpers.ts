import { Game, type GameOptions } from '../src/game/game';
import { createStone, type Stone } from '../src/physics/stone';

export const CLEAN = { variation: false, falls: false, wear: false, endDrift: false };

/** Game on ideal ice where team 0 (red) throws first. */
export const newGame = (o: Partial<GameOptions> = {}): Game => new Game({ seed: 3, ice: CLEAN, hammer: 1, ...o });

/** Run the game until a condition holds (or a time limit). */
export function runUntil(g: Game, done: () => boolean, maxSeconds = 90, each?: () => void): void {
  for (let t = 0; t < maxSeconds * 60 && !done(); t++) {
    if (each) each();
    g.update(1 / 60);
  }
}

/** Deliver with the meters stopped at the given deviations (0 = perfect). */
export function deliver(g: Game, weightDev = 0, lineDev = 0): void {
  const wait = (target: number): void => {
    for (let i = 0; i < 2400 && Math.abs(g.meter - target) > 0.01; i++) g.update(1 / 240);
  };
  g.tap();
  wait(weightDev);
  g.tap();
  wait(lineDev);
  g.tap();
}

/** Select a weight by id. */
export function setWeight(g: Game, id: string): void {
  g.changeWeight(-99);
  g.changeWeight(g.weights.findIndex((w) => w.id === id));
}

/** Throw one stone and wait until the shot is resolved (next aim, decision, end score …). */
export function shoot(g: Game, o: { aimX?: number; aimY?: number; weight?: string; turn?: 'cw' | 'ccw'; each?: () => void } = {}): void {
  if (o.weight) setWeight(g, o.weight);
  if (o.turn) g.setTurn(o.turn);
  if (o.aimX !== undefined || o.aimY !== undefined) g.setAim(o.aimX ?? g.aimX, o.aimY ?? g.aimY);
  deliver(g);
  runUntil(g, () => g.phase !== 'slide' && g.phase !== 'running' && g.phase !== 'settled' && g.phase !== 'meterLine', 120, o.each);
}

/** Put a resting stone on the sheet. */
export function put(g: Game, id: number, team: number, x: number, y: number): Stone {
  return g.world.addStone(createStone(id, team, x, y));
}
