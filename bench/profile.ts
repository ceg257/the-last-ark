import { runWorkload } from './workload';

// CPU profile 入口。**必须跑在主 node 进程里**——vitest 的 worker 抓不到：
// forks 池不会把 --cpu-prof 传给子进程（试过 execArgv、也试过父进程命令行，
// 产出的都只有父进程那份 94% idle 的 profile），threads 池更不是主 isolate。
//
//   npx esbuild bench/profile.ts --bundle --format=esm --platform=node \
//     --outfile=bench/.build/profile.mjs
//   node --cpu-prof --cpu-prof-dir=bench/.prof --cpu-prof-interval=200 bench/.build/profile.mjs small
//   node bench/aggregate.mjs bench/.prof
//
// 参数 small|mid 选工作量，见 workload.ts。
runWorkload(process.argv[2] ?? 'small');
