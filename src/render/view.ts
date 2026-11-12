import type { Game } from '../game/game';

export type CameraMode = 'auto' | 'top' | 'sheet';

/** Common interface of the 3D view and the simple 2D fallback. */
export interface GameView {
  resize(width: number, height: number): void;
  draw(game: Game, dt: number): void;
  /** Screen → sheet coordinates on the ice (for placing the broom); null if off the ice plane. */
  toSheet(px: number, py: number): { x: number; y: number } | null;
  /** Screen area covered by the HUD (top) and the control panel (bottom) [px]. */
  setInsets(top: number, bottom: number): void;
  /** Height of the area in which the play is shown [px] (between HUD and control panel). */
  playHeight(): number;
  /** Visual effect for a stone–stone impact at a point on the ice (strength 0…1). */
  impact?(x: number, y: number, strength: number): void;
  cameraMode: CameraMode;
  debug: boolean;
}
