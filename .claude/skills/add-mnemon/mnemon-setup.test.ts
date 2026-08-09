import { describe, expect, it } from 'bun:test';

import { ensureMnemonSetup } from './mnemon-setup.js';

function fakeSpawnSync(
  behavior: (cmd: string, args: readonly string[]) => { status: number; stderr?: string },
): typeof import('node:child_process').spawnSync {
  return ((cmd: string, args: readonly string[]) => {
    const r = behavior(cmd, args);
    return { status: r.status, stderr: r.stderr ?? '', stdout: '', pid: 0, output: [], signal: null } as ReturnType<
      typeof import('node:child_process').spawnSync
    >;
  }) as typeof import('node:child_process').spawnSync;
}

describe('ensureMnemonSetup', () => {
  it('no-ops silently when mnemon is not on PATH', () => {
    const logs: string[] = [];
    let setupCalled = false;
    const spawnSync = fakeSpawnSync((cmd, args) => {
      if (cmd === 'sh' && args[1] === 'command -v mnemon') return { status: 1 };
      if (cmd === 'mnemon') setupCalled = true;
      return { status: 0 };
    });

    ensureMnemonSetup((msg) => logs.push(msg), { spawnSync, env: {} });

    expect(setupCalled).toBe(false);
    expect(logs).toEqual([]);
  });

  it('runs mnemon setup targeting claude-code with MNEMON_DATA_DIR set, when present', () => {
    const logs: string[] = [];
    let capturedArgs: readonly string[] = [];
    let capturedEnv: NodeJS.ProcessEnv = {};
    const spawnSync = fakeSpawnSync((cmd, args) => {
      if (cmd === 'sh') return { status: 0 };
      capturedArgs = args;
      return { status: 0 };
    });
    const wrappedSpawnSync = ((cmd: string, args: readonly string[], opts?: { env?: NodeJS.ProcessEnv }) => {
      if (cmd === 'mnemon' && opts?.env) capturedEnv = opts.env;
      return spawnSync(cmd, args);
    }) as typeof import('node:child_process').spawnSync;

    ensureMnemonSetup((msg) => logs.push(msg), { spawnSync: wrappedSpawnSync, env: { PATH: '/usr/bin' } });

    expect(capturedArgs).toEqual(['setup', '--target', 'claude-code', '--yes', '--global']);
    expect(capturedEnv.MNEMON_DATA_DIR).toBe('/home/node/.claude/mnemon');
    expect(logs).toEqual(['mnemon memory hooks registered']);
  });

  it('logs and does not throw when setup itself fails', () => {
    const logs: string[] = [];
    const spawnSync = fakeSpawnSync((cmd) => {
      if (cmd === 'sh') return { status: 0 };
      return { status: 1, stderr: 'boom' };
    });

    expect(() => ensureMnemonSetup((msg) => logs.push(msg), { spawnSync, env: {} })).not.toThrow();
    expect(logs).toEqual(['mnemon setup failed: boom']);
  });
});
