import { SHEET, STONE } from './config';

/**
 * Sheet coordinates: origin at the centre of the sheet, x across (positive = right when
 * looking from end A towards end B), y along the sheet. `dir` = +1 when playing towards +y.
 */
export type Dir = 1 | -1;

export const HALF_WIDTH = SHEET.width / 2;
export const HALF_LENGTH = SHEET.length / 2;
const TEE = SHEET.teeToTee / 2;

/** y of the tee at the playing end. */
export const teeY = (dir: Dir): number => dir * TEE;
/** y of the inner edge of the hog line at the playing end. */
export const farHogY = (dir: Dir): number => dir * (TEE - SHEET.teeToHog);
/** y of the inner edge of the hog line at the delivery end. */
export const nearHogY = (dir: Dir): number => -dir * (TEE - SHEET.teeToHog);
/** y of the outer edge of the back line at the playing end. */
export const backLineY = (dir: Dir): number => dir * (TEE + SHEET.teeToBackLine);
/** y of the hack at the delivery end. */
export const hackY = (dir: Dir): number => -dir * (TEE + SHEET.teeToHack);

/** Distance of a point from the playing-end tee. */
export function distToTee(x: number, y: number, dir: Dir): number {
  const dy = y - teeY(dir);
  return Math.sqrt(x * x + dy * dy);
}

/** Stone touches the 12-foot circle (counts as in the house). */
export function inHouse(x: number, y: number, dir: Dir): boolean {
  return distToTee(x, y, dir) <= SHEET.houseRadii[0] + STONE.radius;
}

/** Stone is completely beyond the back line of the playing end. */
export function beyondBackLine(y: number, dir: Dir): boolean {
  return (y - backLineY(dir)) * dir > STONE.radius;
}

/** Stone touches a side line / board. */
export function touchesSide(x: number): boolean {
  return Math.abs(x) + STONE.radius >= HALF_WIDTH;
}

/** Stone has completely crossed the inner edge of the playing-end hog line. */
export function clearedFarHog(y: number, dir: Dir): boolean {
  return (y - farHogY(dir)) * dir > STONE.radius;
}
