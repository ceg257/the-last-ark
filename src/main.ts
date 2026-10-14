import './style.css';
import { createGame, pause, stepGame, togglePause } from './game/game';
import { FixedClock } from './game/clock';
import { firstLevel } from './levels/first';
import { Keyboard } from './input/keyboard';
import { render, telemetry } from './render/canvas';
import { predictTrajectory } from './game/trajectory';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('此浏览器不支持 Canvas 2D。');
const status = document.querySelector<HTMLParagraphElement>('#telemetry')!;
let game = createGame(firstLevel);
const clock = new FixedClock();
let prediction = predictTrajectory(game);
let lastPredictionTime = -Infinity;
let predictionKey = '';
const keyboard = new Keyboard(action => {
  if (action === 'toggle') togglePause(game);
  if (action === 'reset') game = createGame(firstLevel);
  if (action === 'blur') pause(game);
  lastPredictionTime = -Infinity;
  clock.reset();
});
const detach = keyboard.attach(window);
let previousTime: number | undefined;
let frameId = 0;
function frame(now: number): void {
  const seconds = previousTime === undefined ? 0 : (now - previousTime) / 1000;
  previousTime = now;
  clock.advance(seconds, () => stepGame(game, keyboard.read()));
  // Refresh moving-world forecasts at 10 Hz; toggle/state changes refresh immediately.
  const nextKey = `${game.phase}:${game.players.map(player => player.active).join(',')}`;
  if (now - lastPredictionTime >= 100 || nextKey !== predictionKey) {
    prediction = predictTrajectory(game);
    lastPredictionTime = now;
    predictionKey = nextKey;
  }
  render(ctx!, game, prediction);
  status.textContent = telemetry(game);
  canvas.dataset.phase = game.phase;
  canvas.dataset.fields = game.players.map(player => player.active ? 'on' : 'off').join(',');
  canvas.dataset.prediction = prediction.outcome;
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
// Vite hot reload should never leave old keyboard listeners or animation loops alive.
if (import.meta.hot) import.meta.hot.dispose(() => { detach(); cancelAnimationFrame(frameId); });
