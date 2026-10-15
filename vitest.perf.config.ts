import { defineConfig } from 'vitest/config';

// 性能测量专用。刻意不放进 vitest.config.ts 的 include：
// 计时在 CI 上不稳定，`npm test` 不应受它影响。
export default defineConfig({
  test: {
    include: ['bench/**/*.perf.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // 测量结果走 console.log，必须让它直接落到 stdout 而不是被 vitest 缓冲。
    disableConsoleIntercept: true,
  },
});
