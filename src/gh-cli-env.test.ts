import { describe, it, expect } from 'vitest';

import { ghCliEnvArgs } from './gh-cli-env.js';
import type { ContainerConfig } from './container-config.js';

function config(apt: string[]): ContainerConfig {
  return { mcpServers: {}, packages: { apt, npm: [], pip: [] }, additionalMounts: [], skills: [] };
}

describe('ghCliEnvArgs', () => {
  it('returns the placeholder GH_TOKEN when gh is installed', () => {
    expect(ghCliEnvArgs(config(['gh']))).toEqual(['-e', 'GH_TOKEN=onecli-managed']);
  });

  it('returns nothing when gh is not installed', () => {
    expect(ghCliEnvArgs(config(['ffmpeg']))).toEqual([]);
    expect(ghCliEnvArgs(config([]))).toEqual([]);
  });
});
