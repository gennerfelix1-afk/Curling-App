import { SHEET } from './physics/config';

// Phase 1 placeholder: renders a top-down sketch of one house to verify the build/deploy pipeline.
const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

function draw(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = app.clientWidth * dpr;
  canvas.height = app.clientHeight * dpr;
  canvas.style.width = `${app.clientWidth}px`;
  canvas.style.height = `${app.clientHeight}px`;
  const scale = (Math.min(canvas.width, canvas.height) * 0.8) / (2 * SHEET.houseRadii[0]);
  ctx.fillStyle = '#f4f8fb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const colors = ['#1f5fa8', '#f4f8fb', '#c8202f', '#f4f8fb'];
  SHEET.houseRadii.forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
  });
  ctx.fillStyle = '#0b1d2a';
  ctx.font = `${16 * dpr}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('Curling – in Entwicklung (Phase 1)', cx, 32 * dpr);
}
window.addEventListener('resize', draw);
draw();
