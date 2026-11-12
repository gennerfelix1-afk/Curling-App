import { getLang, setLang, t } from '../../src/ui/i18n';

describe('second language (English)', () => {
  afterEach(() => setLang('de'));

  it('German is the source language and passes through unchanged', () => {
    expect(getLang()).toBe('de');
    expect(t('Rot schreibt 2.')).toBe('Rot schreibt 2.');
  });

  it('translates static interface texts exactly', () => {
    setLang('en');
    expect(t('Einstellungen')).toBe('Settings');
    expect(t('Mitspieler auf Ansage')).toBe('team-mates on your call');
    expect(t('Rot')).toBe('Red');
  });

  it('translates the messages of the game with team names and numbers', () => {
    setLang('en');
    expect(t('Rot schreibt 2.')).toBe('Red scores 2.');
    expect(t('Gelb gewinnt 7:5.')).toBe('Yellow wins 7:5.');
    expect(t('Münzwurf: Gelb hat den Hammer.')).toBe('Coin toss: Yellow has the hammer.');
    expect(t('Blank End – der Hammer bleibt.')).toBe('Blank end – the hammer stays.');
    expect(t('Rot gibt auf – Gelb gewinnt.')).toBe('Red concedes – Yellow wins.');
    expect(t('Gelb spielt: Draw auf den Button')).toBe('Yellow plays: Draw to the button');
    expect(t('Free-Guard-Zone-Verstoß: abgegebener Stein entfernt, Steine zurückgesetzt.')).toBe(
      'Free guard zone violation: delivered stone removed, stones replaced.',
    );
    expect(t('No-Tick-Verstoß: Rot hat einen Guard von der Centre Line geschoben. Gelb entscheidet:')).toBe(
      'No-tick violation: Red moved a guard off the centre line. Yellow decides:',
    );
    expect(t('LSD: Rot 23.4 cm · Gelb 51.0 cm – Rot hat den Hammer.')).toBe('LSD: Red 23.4 cm · Yellow 51.0 cm – Red has the hammer.');
    expect(t('Hit and Stay – 2 Punkte (3/8)')).toBe('Hit and stay – 2 points (3/8)');
    expect(t('End 3/8 · Skip · Stein 15/16')).toBe('End 3/8 · Skip · Stone 15/16');
  });

  it('leaves numbers, curling terms and unknown texts alone', () => {
    setLang('en');
    expect(t('2.07 m/s')).toBe('2.07 m/s');
    expect(t('HARD!')).toBe('HARD!');
    expect(t('Tee / Button')).toBe('Tee / Button');
    expect(t('')).toBe('');
  });
});
