import { spawnSync as defaultSpawnSync } from 'node:child_process';

/**
 * Registers mnemon's Claude Code memory hooks at agent-runner startup, if the
 * optional mnemon binary is present. mnemon is added via
 * container/cli-tools.json (a github-release tool source) — not every install
 * has it, so absence is a silent no-op, not an error.
 *
 * Runs here rather than in container/entrypoint.sh: the host spawns sessions
 * with `--entrypoint bash -c 'exec bun run /app/src/index.ts'`
 * (src/container-runner.ts), bypassing the image's own ENTRYPOINT entirely —
 * entrypoint.sh only runs for the standalone `docker run -i <image>` debug
 * path, never for a real session.
 *
 * `mnemon setup` is idempotent, so calling it on every boot is fine.
 * MNEMON_DATA_DIR points into the per-agent-group `.claude/` mount so memory
 * persists across container restarts. It must also be written back into
 * `env` (not just passed to the one-off `mnemon setup` subprocess): index.ts
 * forwards `process.env` into the agent SDK's own subprocess env right after
 * calling this function, and every `mnemon remember`/`recall` the agent runs
 * via its Bash tool inherits that same env. Without this, those calls used to
 * silently fall back to mnemon's built-in default data dir instead of the
 * mounted one — the CLI reported success, but nothing landed in the
 * persisted store.
 */
const MNEMON_DATA_DIR = '/home/node/.claude/mnemon';

export function ensureMnemonSetup(
  log: (msg: string) => void,
  deps: { spawnSync?: typeof defaultSpawnSync; env?: NodeJS.ProcessEnv } = {},
): void {
  const spawn = deps.spawnSync ?? defaultSpawnSync;
  const env = deps.env ?? process.env;

  const which = spawn('sh', ['-c', 'command -v mnemon'], { encoding: 'utf-8' });
  if (which.status !== 0) return;

  const result = spawn('mnemon', ['setup', '--target', 'claude-code', '--yes', '--global'], {
    encoding: 'utf-8',
    env: { ...env, MNEMON_DATA_DIR },
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim() || result.error?.message || `exit ${String(result.status)}`;
    log(`mnemon setup failed: ${detail}`);
    return;
  }
  env.MNEMON_DATA_DIR = MNEMON_DATA_DIR;
  log('mnemon memory hooks registered');
}
