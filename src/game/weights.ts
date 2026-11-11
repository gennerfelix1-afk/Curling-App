import { IceBook } from '../ai/iceBook';
import { WEIGHTS } from '../physics/config';
import type { Ice } from '../physics/ice';
import type { Dir } from '../physics/sheet';

export interface Weight {
  id: string;
  label: string;
  kind: 'draw' | 'hit';
  /** Release speed [m/s] on the current ice. */
  speed: number;
  /** Draw weights: where an unswept stone stops, metres past the tee line. */
  value: number;
}

/** Release speeds for all named weights, read from the book on the current ice. */
export function weightsFromBook(book: IceBook): Weight[] {
  return WEIGHTS.map((w) => ({
    id: w.id,
    label: w.label,
    kind: w.kind,
    value: w.value,
    speed: w.kind === 'draw' ? book.speedForDistance(book.toTee + w.value) : book.speedForHogTime(w.value),
  }));
}

/** The skip's "weight book" for the current ice (measured with unswept test stones). */
export function buildWeightTable(ice: Ice, dir: Dir): Weight[] {
  return weightsFromBook(new IceBook(ice, dir));
}
