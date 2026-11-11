import { DERIVED, SHEET, STONE, INTEGRATION } from '../src/physics/config';

describe('sheet geometry (R1)', () => {
  it('hog-to-hog distance is ~21.945 m', () => {
    expect(DERIVED.hogToHog).toBeCloseTo(21.945, 3);
  });
  it('back line is tangent to the 12-foot circle', () => {
    expect(SHEET.teeToBackLine).toBeCloseTo(SHEET.houseRadii[0], 3);
  });
  it('sheet fits both houses including the hacks', () => {
    expect(SHEET.teeToTee + 2 * SHEET.teeToHack).toBeLessThan(SHEET.length);
  });
  it('stone mass and size within R2 limits', () => {
    expect(STONE.mass).toBeGreaterThanOrEqual(17.24);
    expect(STONE.mass).toBeLessThanOrEqual(19.96);
    expect(2 * Math.PI * STONE.radius).toBeLessThanOrEqual(0.914 + 1e-9);
  });
  it('integration runs at >= 240 Hz', () => {
    expect(INTEGRATION.hz).toBeGreaterThanOrEqual(240);
  });
});
