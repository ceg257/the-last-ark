import './style.css';
import { createGame, pause, stepGame, togglePause } from './game/game';
import { FixedClock } from './game/clock';
import { firstLevel } from './levels/first';
import { Keyboard } from './input/keyboard';
import { render, telemetry } from './render/canvas';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('此浏览器不支持 Canvas 2D。');
const status = document.querySelector<HTMLParagraphElement>('#telemetry')!;
let game = createGame(firstLevel);
const clock = new FixedClock();
const keyboard = new Keyboard(action => {
  if (action === 'toggle') togglePause(game);
  if (action === 'reset') { game = createGame(firstLevel); keyboard.clear(); }
  if (action === 'blur') { pause(game); game.players.forEach(player => { player.active = false; }); }
  clock.reset();
});
const detach = keyboard.attach(window);
let previousTime: number | undefined;
let frameId = 0;
function frame(now: number): void {
  const seconds = previousTime === undefined ? 0 : (now - previousTime) / 1000;
  previousTime = now;
  clock.advance(seconds, () => stepGame(game, keyboard.read()));
  render(ctx!, game);
  status.textContent = telemetry(game);
  canvas.dataset.phase = game.phase;
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
// Vite hot reload should never leave old keyboard listeners or animation loops alive.
if (import.meta.hot) import.meta.hot.dispose(() => { detach(); cancelAnimationFrame(frameId); });
