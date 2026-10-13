import { spawnSync } from 'node:child_process';

/** Capture a bounded analyzer invocation, including timeout and signal evidence. */
export function execute(command, parameters, { cwd, env, timeout = 180_000 } = {}) {
  const result = spawnSync(command, parameters, {
    cwd, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
    // A handled SIGTERM can keep spawnSync blocked beyond its timeout.
    killSignal: 'SIGKILL',
  });
  return {
    command: [command, ...parameters], exitCode: result.status, signal: result.signal,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}
