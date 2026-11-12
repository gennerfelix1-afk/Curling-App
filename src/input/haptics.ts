/**
 * Vibration feedback (Android browsers and installed PWAs; iOS Safari has no vibration API and
 * silently does nothing). All calls are best-effort.
 */
export const haptics = {
  enabled: true,
  pulse(pattern: number | number[]): void {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* not allowed before a user gesture */
    }
  },
  /** Light tick: a weight mark on the scale, a brush stroke. */
  tick(): void {
    this.pulse(8);
  },
  /** Stone hits stone: stronger with the impulse (0…1). */
  impact(strength: number): void {
    this.pulse(Math.round(14 + 50 * Math.min(1, strength)));
  },
  /** Something went wrong (hog line violation, rule violation). */
  error(): void {
    this.pulse([60, 50, 60]);
  },
  /** End scored / match decided. */
  success(): void {
    this.pulse([25, 40, 25, 40, 60]);
  },
};
