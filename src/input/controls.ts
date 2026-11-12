import { RULES, SWEEP } from '../physics/config';
import { TEAM_NAMES, type Game } from '../game/game';
import type { Sound } from '../audio/sound';
import { haptics } from './haptics';
import { scoreEnd } from '../rules/rules';
import { getLang, t } from '../ui/i18n';
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
  /** Push delivery: the finger that holds the stone. */
  private hold_: { id: number; x: number; y: number; steerX: number } | null = null;
  private steerKeys = { left: false, right: false, value: 0, last: 0 };
  private scaleKey = '';
  private aimDrag: { x: number; aimX: number; moved: boolean; step: number } | null = null;
  /** Sweeping: fingers currently on the screen, and the time to the next felt brush stroke. */
  private sweepPointers = new Set<number>();
  private strokeT = 0;
  private lastTick = -1;
  private lastCall = '';
  private lastPhase = '';
  private lastRating = 0;
  private shotKey = '';

  constructor(public game: Game, private view: GameView, canvas: HTMLCanvasElement, private sound: Sound) {
    // aiming: drag sideways anywhere on the ice – the broom follows the movement (so the finger never
    // covers it); a short tap puts the broom where you tapped
    const aim = (e: PointerEvent): void => {
      const a = this.aimDrag;
      if (!a) return;
      const dx = e.clientX - a.x;
      if (Math.abs(dx) > 6) a.moved = true;
      if (!a.moved) return;
      // one screen width moves the broom across ~2/3 of the sheet; screen right = thrower's right
      const sheetX = a.aimX + (dx / window.innerWidth) * 3.2 * this.game.dir;
      this.game.setAim(sheetX, this.game.aimY);
      const step = Math.round(sheetX / 0.15);
      if (step !== a.step) {
        a.step = step;
        haptics.tick();
      }
    };
    const aimTap = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      const p = view.toSheet(e.clientX - r.left, e.clientY - r.top);
      if (p) this.game.setAim(p.x, this.game.aimY);
    };
    // swipe gesture: drag the stone up the screen and let go before the hog line
    const swipeMove = (e: PointerEvent): void => {
      const sw = this.swipe;
      if (!sw || e.pointerId !== sw.id) return;
      const dy = sw.y - e.clientY;
      const track = view.playHeight() * 0.62;
      this.game.gestureMove(dy / track, dy > 20 ? (e.clientX - sw.x) / dy : 0);
    };
    // push delivery: hold = build up weight, swipe up = push off, drag sideways = steer, lift = let go
    const pushMove = (e: PointerEvent): void => {
      const h = this.hold_;
      if (!h || e.pointerId !== h.id) return;
      // the first move upwards freezes the weight – what you see when you start the swipe is what you get
      if (this.game.phase === 'charge' && h.y - e.clientY > 6) this.game.holdPower();
      if (this.game.phase === 'charge' && h.y - e.clientY > 18) {
        this.game.pushOff();
        h.steerX = e.clientX;
      }
      if (this.game.phase === 'glide') this.game.steer((e.clientX - h.steerX) / (window.innerWidth * 0.3));
    };
    // sweeping: finger on the screen = sweep, finger off = stop
    canvas.addEventListener('pointerdown', (e) => {
      if (this.game.phase !== 'running') return;
      this.sweepPointers.add(e.pointerId);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    const sweepEnd = (e: PointerEvent): void => {
      this.sweepPointers.delete(e.pointerId);
    };
    canvas.addEventListener('pointerup', sweepEnd);
    canvas.addEventListener('pointercancel', sweepEnd);

    canvas.addEventListener('pointerdown', (e) => {
      if (this.game.phase === 'charge') {
        this.hold_ = { id: e.pointerId, x: e.clientX, y: e.clientY, steerX: e.clientX };
        this.game.pushStart();
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        return;
      }
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
      this.aimDrag = { x: e.clientX, aimX: this.game.aimX, moved: false, step: Math.round(this.game.aimX / 0.15) };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.aimPointer) aim(e);
      swipeMove(e);
      pushMove(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.aimPointer) {
        this.aimPointer = -1;
        if (this.aimDrag && !this.aimDrag.moved) aimTap(e);
        this.aimDrag = null;
      }
      if (this.hold_ && e.pointerId === this.hold_.id) {
        this.hold_ = null;
        // lifting without a swipe pushes off as well; the stone then glides unsteered
        if (this.game.phase === 'charge') this.game.pushOff();
        this.game.letGo();
      }
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
    this.press('btn-cancel-push', () => this.game.cancel());
    this.press('btn-camera', () => this.cycleCamera());
    this.press('btn-replay', () => this.game.startReplay(0));
    this.press('btn-replay-slow', () => {
      if (this.game.replay) this.game.replay.slow = !this.game.replay.slow;
    });
    this.press('btn-replay-stop', () => this.game.stopReplay());
    this.press('btn-sound', () => {
      this.sound.muted = !this.sound.muted;
    });
    this.press('meter', () => this.game.tap());
    this.hold('pad-skip', 2);
    this.press('btn-call-hard', () => this.game.setSweepCall('hard'));
    this.press('btn-call-clean', () => this.game.setSweepCall('clean'));
    this.press('btn-call-off', () => this.game.setSweepCall('off'));
    $('btn-concede').addEventListener('click', () => {
      const g = this.game;
      // against the AI it is always the player who gives up
      const team = g.isAI(1) && !g.isAI(0) ? 0 : g.team;
      const q = getLang() === 'en' ? `${t(TEAM_NAMES[team])} concedes the match?` : `${TEAM_NAMES[team]} gibt die Partie auf?`;
      if (confirm(q)) {
        $('pause').classList.remove('open');
        g.concede(team);
      }
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
          if (game.phase === 'glide') this.steerKeys.left = true;
          else game.setTurn('ccw');
          break;
        case 'KeyE':
        case 'ArrowRight':
          if (game.phase === 'glide') this.steerKeys.right = true;
          else game.setTurn('cw');
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
          if (game.phase === 'glide') game.letGo();
          else if (game.phase === 'charge') game.pushStart();
          else {
            game.tap();
            // keep holding the key to build up the weight right away
            if ((game.phase as string) === 'charge') {
              this.steerKeys.value = 0;
              game.pushStart();
            }
          }
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
        case 'KeyR':
          if (game.replay) game.stopReplay();
          else game.startReplay(0);
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
      if ((e.code === 'Space' || e.code === 'Enter') && this.game.phase === 'charge') {
        this.steerKeys.value = 0;
        this.game.pushOff();
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyQ') this.steerKeys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyE') this.steerKeys.right = false;
      if (e.code === 'KeyA') this.game.sweepUp(0);
      if (e.code === 'KeyD') this.game.sweepUp(1);
      if (e.code === 'KeyL') this.game.sweepUp(2);
    });
    window.addEventListener('blur', () => {
      for (let k = 0; k < 3; k++) this.game.sweepUp(k);
    });
  }

  /** Holding a finger on the screen sweeps hard; every brush stroke is felt as a short vibration. */
  private updateScrub(dt: number): void {
    const g = this.game;
    if (g.isAI(g.team) || g.options.sweepMode !== 'manual') {
      g.setScrub(0);
      return;
    }
    const on = this.sweepPointers.size > 0 && g.current?.moving === true;
    g.setScrub(on ? 1 : 0);
    if (on) {
      this.strokeT -= dt;
      if (this.strokeT <= 0) {
        this.strokeT = 0.16;
        haptics.tick();
      }
    } else {
      this.strokeT = 0;
    }
  }

  private cycleCamera(): void {
    const order: CameraMode[] = ['auto', 'top', 'sheet'];
    this.view.cameraMode = order[(order.indexOf(this.view.cameraMode) + 1) % order.length];
  }

  private press(id: string, fn: () => void): void {
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.click();
      haptics.tick();
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
    html += `<th class="tot">Σ</th><th class="left">${t('Steine')}</th></tr>`;
    for (let tm = 0; tm < 2; tm++) {
      const hammer = !m.over && !g.lsd && m.hammer === tm;
      html += `<tr><td class="team t${tm}">${t(TEAM_NAMES[tm])}${hammer ? ' <span class="hammer" title="Hammer (letzter Stein)">🔨</span>' : ''}</td>`;
      for (let e = 0; e < cols; e++) {
        const v = m.scores[tm][e];
        html += `<td>${v === undefined ? '' : v}</td>`;
      }
      const left = g.stonesLeft(tm);
      html += `<td class="tot">${m.total(tm)}</td><td class="left">${'●'.repeat(left)}<span class="used">${'●'.repeat(RULES.stonesPerTeam - left)}</span></td></tr>`;
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
    team.textContent = t(TEAM_NAMES[g.team]);
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
    $('hud-end').textContent = t(info);
    team.style.visibility = phase === 'gameOver' || phase === 'endScore' ? 'hidden' : 'visible';

    $('weight-label').textContent = t(g.weight.label);
    $('btn-turn-cw').classList.toggle('on', g.turn === 'cw');
    $('btn-turn-ccw').classList.toggle('on', g.turn === 'ccw');
    $('btn-concede').style.display = g.lsd ? 'none' : '';

    // message / ruling
    const msg = $('message');
    const show = g.message !== '' && (g.messageAge < 6 || phase === 'endScore' || phase === 'gameOver');
    msg.textContent = t(show ? g.message : '');
    msg.style.display = show ? '' : 'none';

    // end result / game over
    if (phase === 'endScore' || phase === 'gameOver') {
      $('btn-continue').textContent = t(phase === 'gameOver' ? 'Neue Partie' : 'Weiter');
    }

    // decision of the non-offending team
    const d = g.decision;
    const dKey = d ? d.kind + d.team + d.text : '';
    if (dKey !== this.decisionKey) {
      this.decisionKey = dKey;
      if (d) {
        $('decision-text').textContent = t(`${d.text} ${TEAM_NAMES[d.team]} entscheidet:`);
        $('decision-options').innerHTML = d.options
          .map((o) => `<button data-choice="${o.id}">${t(o.label)}</button>`)
          .join('');
      }
    }

    $('btn-camera').textContent = t(CAMERA_LABEL[this.view.cameraMode]);
    const canReplay = g.history.length > 0 && (phase === 'aim' || phase === 'endScore' || phase === 'gameOver');
    $('btn-replay').style.display = canReplay ? '' : 'none';
    if (g.replay) {
      $('replay-title').textContent = t(`Replay: ${g.replay.record.label}${g.replaySpeed < 1 ? ' · Zeitlupe' : ''}`);
      $('btn-replay-slow').classList.toggle('on', g.replay.slow);
    }
    $('btn-sound').textContent = t(this.sound.muted ? '🔇' : '🔊');

    if (phase !== 'charge') this.lastTick = -1;

    // rating of the delivery that just came to rest
    const rt = g.lastRating;
    if (rt && rt.n !== this.lastRating) {
      this.lastRating = rt.n;
      const pop = $('rate-pop');
      pop.querySelector('.stars')!.innerHTML = '★'.repeat(rt.stars) + `<i>${'★'.repeat(3 - rt.stars)}</i>`;
      pop.querySelector('.label')!.textContent = rt.human ? t(rt.label) : `${t(TEAM_NAMES[rt.team])}: ${t(rt.label)}`;
      pop.dataset.stars = String(rt.stars);
      pop.classList.remove('show');
      void pop.offsetWidth;
      pop.classList.add('show');
      if (rt.stars === 3) {
        this.sound.chime(2);
        this.sound.applause(rt.human ? 0.9 : 0.5);
        haptics.success();
      } else if (rt.stars === 2) {
        this.sound.applause(0.35);
        haptics.pulse(30);
      } else if (rt.stars === 0) {
        this.sound.groan();
        haptics.pulse([40, 60, 40]);
      }
    }

    // who is counting right now
    let shotText = '';
    let shotTeam = '';
    if (!g.lsd && !g.drill && phase !== 'running' && phase !== 'gameOver') {
      const sc = scoreEnd(g.world.stones, g.dir);
      shotText = sc.team < 0 ? t('House leer') : `${t(TEAM_NAMES[sc.team])} ${t('liegt')} ${sc.points}`;
      shotTeam = String(sc.team);
    }
    const key = shotText + shotTeam;
    if (key !== this.shotKey) {
      this.shotKey = key;
      const el = $('hud-shot');
      el.textContent = shotText;
      el.dataset.team = shotTeam;
    }
    // big score pop-up when an end is decided
    if (phase !== this.lastPhase) {
      if (phase === 'endScore' && g.endResult) {
        const r = g.endResult;
        const pop = $('score-pop');
        pop.textContent = t(r.team < 0 ? 'Blank End' : `+${r.points} ${TEAM_NAMES[r.team]}`);
        pop.dataset.team = String(r.team);
        pop.classList.remove('show');
        void pop.offsetWidth;
        pop.classList.add('show');
        this.sound.chime(r.team < 0 ? 0 : r.points);
        // the crowd applauds a scored end, louder for a big one
        if (r.team >= 0) this.sound.applause(Math.min(1, 0.45 + 0.2 * r.points));
      }
      this.lastPhase = phase;
    }
    // push delivery: power scale while holding, line gauge while gliding
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.steerKeys.last) / 1000);
    this.steerKeys.last = now;
    if (phase === 'glide' && (this.steerKeys.left || this.steerKeys.right)) {
      this.steerKeys.value += (this.steerKeys.right ? 1 : 0) * 1.6 * dt - (this.steerKeys.left ? 1 : 0) * 1.6 * dt;
      g.steer(this.steerKeys.value);
    }
    if (phase === 'charge' || phase === 'glide') {
      const key = g.powerScale.map((t) => t.label).join() + g.weightIndex;
      if (key !== this.scaleKey) {
        this.scaleKey = key;
        const named = new Set(['Guard', 'Tee / Button', 'Hack', 'Peel']);
        $('power-ticks').innerHTML = g.powerScale
          .map((t) => `<i style="left:${(t.pos * 100).toFixed(1)}%"></i>${named.has(t.label) ? `<span style="left:${(t.pos * 100).toFixed(1)}%">${t.label.replace(' / Button', '')}</span>` : ''}`)
          .join('');
      }
      const tick = g.powerScale.filter((t) => t.pos <= g.power).length;
      if (phase === 'charge' && tick !== this.lastTick) {
        if (this.lastTick >= 0 && tick > this.lastTick) haptics.tick();
        this.lastTick = tick;
      }
      $('power-fill').style.width = `${(g.power * 100).toFixed(1)}%`;
      $('power-target').style.left = `${(g.targetPower * 100).toFixed(1)}%`;
      $('power-label').textContent = t(g.power > 0.01 ? g.powerLabel : `Ansage: ${g.weight.label}`);
      if (phase === 'charge') {
        $('push-title').textContent = t('Gedrückt halten = Gewicht aufbauen · nach oben wischen = abstoßen');
      } else {
        const gl = g.glide;
        $('push-title').textContent = t(gl.u >= gl.releaseAt - 0.12 ? 'Jetzt loslassen – vor der roten Linie!' : 'Seitlich ziehen: Stein auf der Linie halten');
        $('line-marker').style.left = `${50 + g.lineOffset * 50}%`;
      }
    }

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
      $('think-text').textContent = t(`${TEAM_NAMES[g.team]} (KI) überlegt …`);
    }
    $('watch-text').textContent = t(ai ? `${TEAM_NAMES[g.team]} (KI) wischt selbst` : 'Deine Mitspieler wischen nach Ansage des Skips');

    // meter
    if (phase === 'meterWeight' || phase === 'meterLine') {
      $('meter-title').textContent = t(phase === 'meterWeight' ? 'Gewicht – tippen in der Mitte!' : 'Linie – tippen in der Mitte!');
      $('meter-marker').style.left = `${50 + g.meter * 50}%`;
    }

    // running
    if (phase === 'replay') $('hud-speed').textContent = t(`${g.speed.toFixed(2)} m/s`);
    if (phase === 'running') {
      $('hud-speed').textContent = t(`${g.speed.toFixed(2)} m/s`);
      if (g.call !== this.lastCall) {
        this.lastCall = g.call;
        const call = $('hud-call');
        call.textContent = t(g.call);
        call.classList.remove('pop');
        void call.offsetWidth; // restart the animation
        call.classList.add('pop');
      }
      this.updateScrub(dt);
      const level = Math.max(g.sweepIntensity(0), g.sweepIntensity(1));
      $('scrub-fill').style.width = `${Math.round(level * 100)}%`;
      $('scrub-bar').classList.toggle('hard', level >= 0.85);
      const st = g.world.sweepers.state;
      const fresh = 1 - Math.max(st[0].fatigue, st[1].fatigue) / SWEEP.fatigueMax;
      $('fatigue-fill').style.width = `${Math.round(fresh * 100)}%`;
      $('scrub-hint').textContent = t(level > 0 ? 'Wischen!' : 'Finger halten = wischen');
      $('panel-sweep').classList.toggle('sweeping', level > 0);
      const skip = $('pad-skip');
      skip.style.display = g.skipMaySweep ? '' : 'none';
      skip.textContent = t(`Skip ${TEAM_NAMES[1 - g.team]} wischt (L)`);
      skip.classList.toggle('on', g.sweeperActive(2));
    } else {
      this.sweepPointers.clear();
      if (phase !== 'replay') $('hud-speed').textContent = t('');
      $('hud-call').textContent = t('');
      $('pad-skip').style.display = 'none';
    }
  }
}
