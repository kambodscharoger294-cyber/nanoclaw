/**
 * OneCLI gateway networking vars (HTTPS_PROXY + CA trust) that route and
 * authenticate outbound HTTPS calls through the credential vault. The
 * container process gets these injected by the host (see
 * `onecli.applyContainerConfig` in `src/container-runner.ts`), but MCP
 * servers spawned over stdio start with a bare environment (HOME/PATH/etc
 * only — `@modelcontextprotocol/sdk`'s `getDefaultEnvironment()`) and never
 * see them unless explicitly forwarded. Without this, a third-party MCP
 * server wired via `add_mcp_server` has no way to reach OneCLI-vaulted
 * credentials transparently — the operator would have to embed raw API keys
 * in its `env` instead, which is exactly what the gateway model exists to
 * avoid.
 */
export const GATEWAY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'GIT_SSL_CAINFO',
  'GIT_HTTP_PROXY_AUTHMETHOD',
  'GIT_TERMINAL_PROMPT',
  'DENO_CERT',
] as const;

/** Gateway env vars present in `source` (defaults to process.env). */
export function gatewayEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of GATEWAY_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * Merge gateway env into a third-party MCP server's own env. An explicit
 * value the operator set on the server itself wins over the gateway default
 * on key collision — the forwarding is a default, not an override.
 */
export function withGatewayEnv(
  env: Record<string, string> | undefined,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return { ...gatewayEnv(source), ...(env ?? {}) };
}
