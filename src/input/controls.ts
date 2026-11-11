import { RULES, SWEEP } from '../physics/config';
import { TEAM_NAMES, type Game } from '../game/game';
import type { Sound } from '../audio/sound';
import type { CameraMode, GameView } from '../render/view';

const CAMERA_LABEL: Record<CameraMode, string> = { auto: 'Kamera: Auto', top: 'Kamera: Draufsicht', sheet: 'Kamera: Übersicht' };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Mouse / keyboard / touch input and the HTML overlay.
 *
 * Desktop: click or drag on the ice = broom · Q/E or ←/→ = turn · W/S or ↑/↓ = weight ·
 * Space/Enter = deliver & lock meters · A / D = sweeper 1 / 2 (hold = sweep, tap fast = harder) ·
 * L = skip of the other team (behind the tee line) · 1/2/3 = sweep left / full path / right ·
 * Esc = cancel.
 * Touch: the same via the on-screen buttons; the two big sweep pads work with two thumbs.
 */
export class Controls {
  private aimPointer = -1;
  private boardKey = '';
  private decisionKey = '';

  private swipe: { id: number; x: number; y: number } | null = null;

  constructor(public game: Game, private view: GameView, canvas: HTMLCanvasElement, private sound: Sound) {
    // aiming on the ice
    const aim = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      const p = view.toSheet(e.clientX - r.left, e.clientY - r.top);
      if (p) this.game.setAim(p.x, p.y);
    };
    // swipe gesture: drag the stone up the screen and let go before the hog line
    const swipeMove = (e: PointerEvent): void => {
      const sw = this.swipe;
      if (!sw || e.pointerId !== sw.id) return;
      const dy = sw.y - e.clientY;
      const track = view.playHeight() * 0.62;
      this.game.gestureMove(dy / track, dy > 20 ? (e.clientX - sw.x) / dy : 0);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (this.game.phase === 'gesture') {
        this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        return;
      }
      if (this.game.phase !== 'aim') return;
      this.aimPointer = e.pointerId;
      aim(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.aimPointer) aim(e);
      swipeMove(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.aimPointer) this.aimPointer = -1;
      if (this.swipe && e.pointerId === this.swipe.id) {
        swipeMove(e);
        this.swipe = null;
        this.game.gestureRelease();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // buttons
    this.press('btn-turn-cw', () => this.game.setTurn('cw'));
    this.press('btn-turn-ccw', () => this.game.setTurn('ccw'));
    this.press('btn-weight-down', () => this.game.changeWeight(-1));
    this.press('btn-weight-up', () => this.game.changeWeight(1));
    this.press('btn-go', () => this.game.tap());
    this.press('btn-continue', () => this.game.tap());
    this.press('btn-cancel', () => this.game.cancel());
    this.press('btn-cancel-gesture', () => this.game.cancel());
    this.press('btn-camera', () => this.cycleCamera());
    this.press('btn-sound', () => {
      this.sound.muted = !this.sound.muted;
    });
    this.press('meter', () => this.game.tap());
    this.press('btn-side-l', () => this.game.setSweepSide(-1));
    this.press('btn-side-c', () => this.game.setSweepSide(0));
    this.press('btn-side-r', () => this.game.setSweepSide(1));
    this.hold('pad-sweep-0', 0);
    this.hold('pad-sweep-1', 1);
    this.hold('pad-skip', 2);
    this.press('btn-call-hard', () => this.game.setSweepCall('hard'));
    this.press('btn-call-clean', () => this.game.setSweepCall('clean'));
    this.press('btn-call-off', () => this.game.setSweepCall('off'));
    $('btn-concede').addEventListener('click', () => {
      const g = this.game;
      if (confirm(`${TEAM_NAMES[g.team]} gibt die Partie auf?`)) g.concede(g.team);
    });
    $('decision-options').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.choice;
      if (id) this.game.decide(id);
    });

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.repeat || document.body.dataset.menu === 'open') return;
      const game = this.game;
      switch (e.code) {
        case 'KeyQ':
        case 'ArrowLeft':
          game.setTurn('ccw');
          break;
        case 'KeyE':
        case 'ArrowRight':
          game.setTurn('cw');
          break;
        case 'KeyW':
        case 'ArrowUp':
          game.changeWeight(1);
          break;
        case 'KeyS':
        case 'ArrowDown':
          game.changeWeight(-1);
          break;
        case 'Space':
        case 'Enter':
          game.tap();
          break;
        case 'Escape':
          game.cancel();
          break;
        case 'KeyA':
          game.sweepDown(0);
          break;
        case 'KeyH':
          game.setSweepCall('hard');
          break;
        case 'KeyJ':
          game.setSweepCall('clean');
          break;
        case 'KeyK':
          game.setSweepCall('off');
          break;
        case 'KeyD':
          game.sweepDown(1);
          break;
        case 'KeyL':
          game.sweepDown(2);
          break;
        case 'Digit1':
          game.setSweepSide(-1);
          break;
        case 'Digit2':
          game.setSweepSide(0);
          break;
        case 'Digit3':
          game.setSweepSide(1);
          break;
        case 'KeyC':
          this.cycleCamera();
          break;
        case 'KeyM':
          this.sound.muted = !this.sound.muted;
          break;
        case 'F3':
        case 'KeyB':
          this.view.debug = !this.view.debug;
          break;
        default:
          return;
      }
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyA') this.game.sweepUp(0);
      if (e.code === 'KeyD') this.game.sweepUp(1);
      if (e.code === 'KeyL') this.game.sweepUp(2);
    });
    window.addEventListener('blur', () => {
      for (let k = 0; k < 3; k++) this.game.sweepUp(k);
    });
  }

  private cycleCamera(): void {
    const order: CameraMode[] = ['auto', 'top', 'sheet'];
    this.view.cameraMode = order[(order.indexOf(this.view.cameraMode) + 1) % order.length];
  }

  private press(id: string, fn: () => void): void {
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
    });
  }

  private hold(id: string, sweeper: number): void {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.game.sweepDown(sweeper);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    const up = (): void => this.game.sweepUp(sweeper);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** Curling-style line score: one column per end, hammer marker, totals. */
  private renderScoreboard(): void {
    const g = this.game;
    const m = g.match;
    const cols = Math.max(m.ends, m.scores[0].length + (m.over ? 0 : 1));
    const key = `${m.scores[0].join()}|${m.scores[1].join()}|${m.hammer}|${m.end}|${m.over}|${g.shot}|${g.lsd ? g.lsd.index : -1}`;
    if (key === this.boardKey) return;
    this.boardKey = key;
    let html = '<tr><th></th>';
    for (let e = 1; e <= cols; e++) {
      const cur = !m.over && !g.lsd && e === m.end;
      html += `<th class="${cur ? 'cur' : ''}">${e > m.ends ? 'E' : e}</th>`;
    }
    html += '<th class="tot">Σ</th><th class="left">Steine</th></tr>';
    for (let t = 0; t < 2; t++) {
      const hammer = !m.over && !g.lsd && m.hammer === t;
      html += `<tr><td class="team t${t}">${TEAM_NAMES[t]}${hammer ? ' <span class="hammer" title="Hammer (letzter Stein)">🔨</span>' : ''}</td>`;
      for (let e = 0; e < cols; e++) {
        const v = m.scores[t][e];
        html += `<td>${v === undefined ? '' : v}</td>`;
      }
      const left = g.stonesLeft(t);
      html += `<td class="tot">${m.total(t)}</td><td class="left">${'●'.repeat(left)}<span class="used">${'●'.repeat(RULES.stonesPerTeam - left)}</span></td></tr>`;
    }
    $('scoreboard').innerHTML = html;
  }

  /** Sync the overlay with the game state (called every frame). */
  refresh(): void {
    const g = this.game;
    const phase = g.phase;
    document.body.dataset.phase = phase;
    this.renderScoreboard();

    const team = $('hud-team');
    team.textContent = TEAM_NAMES[g.team];
    team.dataset.team = String(g.team);
    let info: string;
    const drill = g.drill;
    if (drill) {
      const names = { draw: 'Draw-Challenge', takeout: 'Takeout-Challenge', ice: 'Eis lesen' };
      const res = drill.results.map((r) => (drill.kind === 'takeout' ? String(r) : (r * 100).toFixed(0))).join(' · ');
      info = `${names[drill.kind]} ${Math.min(drill.results.length + 1, drill.attempts)}/${drill.attempts}${res ? ` — ${res}${drill.kind === 'takeout' ? ' P.' : ' cm'}` : ''}`;
    } else if (g.lsd) info = `Last Stone Draw ${g.lsd.index + 1}/4`;
    else if (phase === 'gameOver') info = 'Partie beendet';
    else {
      const endName = g.match.isExtraEnd ? 'Extra End' : `End ${g.match.end}/${g.match.ends}`;
      info = `${endName} · ${g.thrower} · Stein ${Math.min(g.shot + 1, g.stonesPerEnd)}/${g.stonesPerEnd}`;
      if (g.shot < RULES.fgzUntilStone - 1 && phase !== 'endScore') info += ' · FGZ aktiv';
    }
    $('hud-end').textContent = info;
    team.style.visibility = phase === 'gameOver' || phase === 'endScore' ? 'hidden' : 'visible';

    $('weight-label').textContent = g.weight.label;
    $('btn-turn-cw').classList.toggle('on', g.turn === 'cw');
    $('btn-turn-ccw').classList.toggle('on', g.turn === 'ccw');
    $('btn-side-l').classList.toggle('on', g.sweepSide === -1);
    $('btn-side-c').classList.toggle('on', g.sweepSide === 0);
    $('btn-side-r').classList.toggle('on', g.sweepSide === 1);
    $('btn-concede').style.display = g.lsd ? 'none' : '';

    // message / ruling
    const msg = $('message');
    const show = g.message !== '' && (g.messageAge < 6 || phase === 'endScore' || phase === 'gameOver');
    msg.textContent = show ? g.message : '';
    msg.style.display = show ? '' : 'none';

    // end result / game over
    if (phase === 'endScore' || phase === 'gameOver') {
      $('btn-continue').textContent = phase === 'gameOver' ? 'Neue Partie' : 'Weiter';
    }

    // decision of the non-offending team
    const d = g.decision;
    const dKey = d ? d.kind + d.team + d.text : '';
    if (dKey !== this.decisionKey) {
      this.decisionKey = dKey;
      if (d) {
        $('decision-text').textContent = `${d.text} ${TEAM_NAMES[d.team]} entscheidet:`;
        $('decision-options').innerHTML = d.options
          .map((o) => `<button data-choice="${o.id}">${o.label}</button>`)
          .join('');
      }
    }

    $('btn-camera').textContent = CAMERA_LABEL[this.view.cameraMode];
    $('btn-sound').textContent = this.sound.muted ? '🔇' : '🔊';

    // swipe gesture: live pace indicator
    if (phase === 'gesture') {
      $('pace-marker').style.left = `${50 + g.gesturePace * 50}%`;
    }

    // who sweeps? pads (manual), call buttons (AI team-mates on call) or nothing to do (auto / AI throws)
    const ai = g.isAI(g.team);
    const mode = ai ? 'watch' : g.options.sweepMode;
    document.body.dataset.sweep = mode;
    document.body.dataset.drill = drill ? '1' : '0';
    if (phase === 'running' && mode === 'calls') {
      $('btn-call-hard').classList.toggle('on', g.sweepCall === 'hard');
      $('btn-call-clean').classList.toggle('on', g.sweepCall === 'clean');
      $('btn-call-off').classList.toggle('on', g.sweepCall === 'off');
    }
    if (phase === 'aiThink') {
      $('think-bar').style.width = `${Math.round(g.thinking * 100)}%`;
      $('think-text').textContent = `${TEAM_NAMES[g.team]} (KI) überlegt …`;
    }
    $('watch-text').textContent = ai ? `${TEAM_NAMES[g.team]} (KI) wischt selbst` : 'Deine Mitspieler wischen nach Ansage des Skips';

    // meter
    if (phase === 'meterWeight' || phase === 'meterLine') {
      $('meter-title').textContent = phase === 'meterWeight' ? 'Gewicht – tippen in der Mitte!' : 'Linie – tippen in der Mitte!';
      $('meter-marker').style.left = `${50 + g.meter * 50}%`;
    }

    // running
    if (phase === 'running') {
      $('hud-speed').textContent = `${g.speed.toFixed(2)} m/s`;
      $('hud-call').textContent = g.call;
      for (let k = 0; k < 2; k++) {
        const pad = $(`pad-sweep-${k}`);
        const i = g.sweepIntensity(k);
        pad.style.setProperty('--level', String(i));
        pad.classList.toggle('on', i > 0 && g.sweeperActive(k));
        pad.classList.toggle('blocked', i > 0 && !g.sweeperActive(k));
        const fatigue = g.world.sweepers.state[k].fatigue;
        $(`fatigue-${k}`).style.width = `${Math.round((1 - fatigue / SWEEP.fatigueMax) * 100)}%`;
      }
      const skip = $('pad-skip');
      skip.style.display = g.skipMaySweep ? '' : 'none';
      skip.textContent = `Skip ${TEAM_NAMES[1 - g.team]} wischt (L)`;
      skip.classList.toggle('on', g.sweeperActive(2));
    } else {
      $('hud-speed').textContent = '';
      $('hud-call').textContent = '';
      $('pad-skip').style.display = 'none';
    }
  }
}
