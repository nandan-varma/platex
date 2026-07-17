import { runCli } from './cli.js';

// Ctrl-C aborts the in-flight compile (killing local TeX subprocesses or the
// remote request) and lets runCli return, instead of leaving orphans behind.
const controller = new AbortController();
process.once('SIGINT', () => {
  controller.abort();
  // Second Ctrl-C force-quits.
  process.once('SIGINT', () => process.exit(130));
});

process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal });
