import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// 把 `node --cpu-prof` 产出的 .cpuprofile 汇总成"自身耗时"排行榜。
// 自身耗时（self time）才是真正要优化的位置——被调次数多但不耗时的函数会自带放大。
import { statSync } from 'node:fs';

const dir = process.argv[2] ?? 'bench/.prof';
// 一次运行会产出多个 profile（主进程 + 各 spawn 的子进程）。挑最大的那个，
// 它才装着我们真正在跑的热循环。
const candidates = readdirSync(dir).filter(f => f.endsWith('.cpuprofile'))
  .map(f => ({ f, size: statSync(join(dir, f)).size })).sort((a, b) => b.size - a.size);
const file = candidates[0].f;
const profile = JSON.parse(readFileSync(join(dir, file), 'utf8'));

const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const selfByNode = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  const dt = profile.timeDeltas[i] ?? 0;
  selfByNode.set(id, (selfByNode.get(id) ?? 0) + dt);
}

const short = url => (url || '(native)').replace(/^.*[\\/]/, '');
const byFunction = new Map();
const byFile = new Map();
let total = 0;
for (const [id, us] of selfByNode) {
  const node = nodes.get(id);
  if (!node) continue;
  const cf = node.callFrame;
  total += us;
  const fn = `${cf.functionName || '(anonymous)'}  ${short(cf.url)}:${cf.lineNumber + 1}`;
  byFunction.set(fn, (byFunction.get(fn) ?? 0) + us);
  byFile.set(short(cf.url), (byFile.get(short(cf.url)) ?? 0) + us);
}

const line = ([k, us]) => `${(us / 1000).toFixed(1).padStart(8)} ms ${(us / total * 100).toFixed(1).padStart(5)}%  ${k}`;
console.log(`profile: ${file}   samples=${profile.samples.length}   total=${(total / 1000).toFixed(1)} ms\n`);
console.log('=== 按函数（self time） ===');
for (const row of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(line(row));
console.log('\n=== 按文件（self time） ===');
for (const row of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(line(row));

// 函数级排行榜只能告诉你"该动哪个函数"。真正要改哪一行，得看 V8 的 positionTicks
// （只有被优化的函数才有）。用法：node bench/aggregate.mjs bench/.prof stepGame
const wanted = process.argv[3];
if (wanted) {
  const lines = new Map();
  let bundlePath = null;
  for (const node of profile.nodes) {
    const cf = node.callFrame;
    if (cf.functionName !== wanted || !node.positionTicks) continue;
    // 路径里有中文，V8 给的 url 是 percent-encoded 的，不能直接喂给 readFileSync。
    if (cf.url && cf.url.endsWith('profile.mjs')) bundlePath ??= decodeURIComponent(cf.url.replace(/^file:\/\/\//, ''));
    for (const tick of node.positionTicks) lines.set(tick.line, (lines.get(tick.line) ?? 0) + tick.ticks);
  }
  const source = bundlePath ? readFileSync(bundlePath, 'utf8').split('\n') : [];
  const totalTicks = [...lines.values()].reduce((a, b) => a + b, 0);
  // 第四参数：看前几行。函数被内联时，被内联者的 tick 会落在它自己的源行上（可能是另一个
  // 文件），所以只盯前 18 行很容易只看到调用方、看不到真正在算的那几行。
  const top = Number(process.argv[4] ?? 18);
  console.log(`\n=== ${wanted} 内部的热行（positionTicks，共 ${totalTicks} tick） ===`);
  for (const [lineNo, ticks] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    const text = (source[lineNo] ?? '').trim().slice(0, 100);
    console.log(`${String(ticks).padStart(6)} ${(ticks / totalTicks * 100).toFixed(1).padStart(5)}%  L${lineNo + 1}  ${text}`);
  }
}
