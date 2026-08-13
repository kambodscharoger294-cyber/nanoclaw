import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ollamaEnvArgs } from './ollama-env.js';

const ENV_KEYS = ['OLLAMA_HOST', 'OLLAMA_ADMIN_TOOLS', 'MNEMON_EMBED_ENDPOINT'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('ollamaEnvArgs', () => {
  it('always forwards a default MNEMON_EMBED_ENDPOINT even with no Ollama env set', () => {
    expect(ollamaEnvArgs()).toEqual(['-e', 'MNEMON_EMBED_ENDPOINT=http://host.docker.internal:11434']);
  });

  it('forwards OLLAMA_HOST and OLLAMA_ADMIN_TOOLS when set, alongside the mnemon endpoint', () => {
    process.env.OLLAMA_HOST = 'http://192.168.1.5:11434';
    process.env.OLLAMA_ADMIN_TOOLS = 'true';
    expect(ollamaEnvArgs()).toEqual([
      '-e',
      'OLLAMA_HOST=http://192.168.1.5:11434',
      '-e',
      'OLLAMA_ADMIN_TOOLS=true',
      '-e',
      'MNEMON_EMBED_ENDPOINT=http://host.docker.internal:11434',
    ]);
  });

  it('honors an explicit MNEMON_EMBED_ENDPOINT override', () => {
    process.env.MNEMON_EMBED_ENDPOINT = 'http://192.168.1.5:11434';
    expect(ollamaEnvArgs()).toEqual(['-e', 'MNEMON_EMBED_ENDPOINT=http://192.168.1.5:11434']);
  });
});
