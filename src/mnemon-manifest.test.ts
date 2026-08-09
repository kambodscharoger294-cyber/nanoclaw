/**
 * Structural guard for the mnemon cli-tools.json reach-in (the dependency install).
 *
 * mnemon ships as a GitHub-release binary, not an npm package, so it can't be
 * imported or typechecked. The only red-on-drift guard is asserting the
 * manifest entry is present with the fields install-cli-tools.sh needs: drop
 * it on an upgrade and the container starts with mnemon simply absent (the
 * entrypoint guard means this fails quietly), but nothing else fails.
 */
import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

/** Repo root — the dir holding container/, wherever this file is copied to. */
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'container', 'cli-tools.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('container/cli-tools.json not found walking up from ' + __dirname);
}

describe('mnemon is installed via container/cli-tools.json', () => {
  const root = repoRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'container', 'cli-tools.json'), 'utf8')) as Array<{
    name: string;
    version: string;
    source?: string;
    repo?: string;
    asset?: string;
  }>;
  const mnemon = manifest.find((t) => t.name === 'mnemon');

  it('appears in the CLI manifest as a github-release tool', () => {
    expect(mnemon).toBeDefined();
    expect(mnemon?.source).toBe('github-release');
  });

  it('is pinned to an exact version, so the supply-chain policy still applies', () => {
    expect(mnemon?.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  });

  it('points at the mnemon-dev/mnemon repo with a resolvable asset template', () => {
    expect(mnemon?.repo).toBe('mnemon-dev/mnemon');
    expect(mnemon?.asset).toContain('{version}');
    expect(mnemon?.asset).toContain('{arch}');
  });
});
