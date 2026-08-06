import type { ContainerConfig } from './container-config.js';

/**
 * `gh` refuses to attempt any API call without a locally-present token — it
 * checks for one before making a request, unlike a raw HTTP client the
 * OneCLI gateway can intercept unconditionally. `GH_TOKEN=onecli-managed` is
 * a placeholder value only: `gh` sends it as a Bearer header, and the
 * gateway proxy rewrites that header in flight with the real vaulted token
 * (same convention as the MCP servers' `env: { TOKEN: "onecli-managed" }`
 * entries). Gated on `gh` actually being installed for this group so other
 * agents' containers don't carry an unused env var.
 */
export function ghCliEnvArgs(containerConfig: ContainerConfig): string[] {
  if (!containerConfig.packages.apt.includes('gh')) return [];
  return ['-e', 'GH_TOKEN=onecli-managed'];
}
