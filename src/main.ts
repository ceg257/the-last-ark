import './style.css';
import { pause } from './game/game';
import { FixedClock } from './game/clock';
import { Keyboard } from './input/keyboard';
import { render, renderTitle, telemetry } from './render/canvas';
import { predictTrajectory } from './game/trajectory';
import type { Trajectory } from './game/trajectory';
import { SceneController } from './scenes/controller';
import { createCamera, follow, resizeCamera, setZoom } from './camera/camera';
import { scenes as registry } from './scenes/registry';
import { developmentRegistry } from './debug/config';
import { movementTelemetry } from './debug/telemetry';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('此浏览器不支持 Canvas 2D。');
const status = document.querySelector<HTMLParagraphElement>('#telemetry')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('dev') === '1';
const scenes = new SceneController(debug ? developmentRegistry(registry,location.search) : registry);
if (debug && new URLSearchParams(location.search).get('scene') === 'coop_test') scenes.enter('coop_test');
const debugView = debug ? document.createElement('pre') : undefined;
if (debugView) { debugView.id='debug'; debugView.style.whiteSpace='pre-wrap'; debugView.style.fontSize='12px'; document.querySelector('main')!.append(debugView); }
const camera = createCamera({x:0,y:0});
const clock = new FixedClock();
let prediction: Trajectory = {points:[],seconds:0,outcome:'horizon'};
let lastPredictionTime = -Infinity;
let predictionKey = '';
let revision = -1;
const keyboard = new Keyboard(action => {
  if (action === 'toggle') scenes.toggle();
  if (action === 'reset' || action === 'restart') scenes.retry(action === 'restart');
  if (action === 'title') scenes.enter('title');
  if (action === 'blur' && scenes.game) pause(scenes.game);
  if (action === 'zoom-in') setZoom(camera, camera.zoom * 1.2);
  if (action === 'zoom-out') setZoom(camera, camera.zoom / 1.2);
  if (action === 'zoom-reset') setZoom(camera, 0.8);
  lastPredictionTime = -Infinity; clock.reset();
});
const detach = keyboard.attach(window);
const onStart = () => { scenes.enter('prototype'); canvas.focus(); };
start.addEventListener('click',onStart);
let dpr = 1;
function resize(): void {
  const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  resizeCamera(camera, rect.width, rect.height);
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
}
const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
function syncScene(): void {
  if (revision === scenes.revision) return;
  revision = scenes.revision; keyboard.clear(); clock.reset(); lastPredictionTime = -Infinity;
  const ship = scenes.game?.bodies.find(b => b.kind === 'ship');
  if (ship) follow(camera,ship.position,ship.velocity,0,true);
  start.hidden = scenes.scene !== 'title';
}
let previousTime: number | undefined;
let frameId = 0;
function frame(now: number): void {
  const seconds = previousTime === undefined ? 0 : (now - previousTime) / 1000; previousTime = now;
  syncScene();
  clock.advance(seconds, () => { scenes.step(keyboard.read()); syncScene(); });
  const game = scenes.game;
  ctx!.setTransform(dpr,0,0,dpr,0,0);
  if (game) {
    const nextKey = game.phase + ':' + game.players.map(p => p.active).join(',');
    if (now - lastPredictionTime >= 100 || nextKey !== predictionKey) {
      prediction = predictTrajectory(game); lastPredictionTime = now; predictionKey = nextKey;
    }
    const ship = game.bodies.find(b => b.kind === 'ship')!;
    follow(camera,ship.position,ship.velocity,seconds);
    render(ctx!,game,prediction,camera); status.textContent = telemetry(game);
    if (debugView) debugView.textContent = movementTelemetry(game);
    canvas.dataset.phase = game.phase; canvas.dataset.fields = game.players.map(p => p.active ? 'on' : 'off').join(',');
    canvas.dataset.prediction = prediction.outcome;
  } else {
    renderTitle(ctx!,camera); status.textContent = '标题 · 仅原试玩关可用'; canvas.dataset.phase = 'title';
    delete canvas.dataset.fields; delete canvas.dataset.prediction;
    if (debugView) debugView.textContent = '开发模式：进入试玩，或使用 ?dev=1&scene=coop_test';
  }
  canvas.dataset.scene = scenes.scene; canvas.dataset.zoom = camera.zoom.toFixed(2);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
if (import.meta.hot) import.meta.hot.dispose(() => { detach(); observer.disconnect(); debugView?.remove(); start.removeEventListener('click',onStart); cancelAnimationFrame(frameId); });
