import type { Game } from '../game/game';

export type CameraMode = 'auto' | 'top' | 'sheet';

/** Common interface of the 3D view and the simple 2D fallback. */
export interface GameView {
  resize(width: number, height: number): void;
  draw(game: Game, dt: number): void;
  /** Screen → sheet coordinates on the ice (for placing the broom); null if off the ice plane. */
  toSheet(px: number, py: number): { x: number; y: number } | null;
  /** Height of the area in which the play is shown [px] (between HUD and control panel). */
  playHeight(): number;
  cameraMode: CameraMode;
  debug: boolean;
}
