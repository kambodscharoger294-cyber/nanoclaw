import { describe, it, expect } from 'bun:test';

import { gatewayEnv, withGatewayEnv } from './mcp-gateway-env.js';

describe('gatewayEnv', () => {
  it('picks up known gateway keys and ignores unrelated ones', () => {
    const source = {
      HTTPS_PROXY: 'http://x:tok@127.0.0.1:10255',
      NODE_EXTRA_CA_CERTS: '/tmp/ca.pem',
      UNRELATED_VAR: 'should-not-appear',
    };
    expect(gatewayEnv(source)).toEqual({
      HTTPS_PROXY: 'http://x:tok@127.0.0.1:10255',
      NODE_EXTRA_CA_CERTS: '/tmp/ca.pem',
    });
  });

  it('returns an empty object when no gateway keys are present', () => {
    expect(gatewayEnv({ FOO: 'bar' })).toEqual({});
  });
});

describe('withGatewayEnv', () => {
  const source = {
    HTTPS_PROXY: 'http://x:tok@127.0.0.1:10255',
    SSL_CERT_FILE: '/tmp/ca.pem',
  };

  it('forwards gateway env into a server with no explicit env', () => {
    expect(withGatewayEnv(undefined, source)).toEqual(source);
  });

  it('merges gateway env with an explicit env', () => {
    expect(withGatewayEnv({ EXA_API_KEY: 'abc' }, source)).toEqual({
      ...source,
      EXA_API_KEY: 'abc',
    });
  });

  it('lets an explicit value win over the gateway default on key collision', () => {
    expect(withGatewayEnv({ HTTPS_PROXY: 'http://explicit-override:1' }, source)).toEqual({
      HTTPS_PROXY: 'http://explicit-override:1',
      SSL_CERT_FILE: '/tmp/ca.pem',
    });
  });
});
