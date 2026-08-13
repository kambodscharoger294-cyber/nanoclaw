/**
 * Host-side env forwarding for tools that call the host's Ollama daemon
 * directly: the Ollama MCP tool, and mnemon's embedding backfill. Returns
 * the Docker `-e` arguments to pass into every container.
 *
 * Ollama is local and keyless — these are configuration, not credentials:
 * `OLLAMA_HOST` is the base URL of the host's Ollama daemon (Ollama MCP
 * tool), `OLLAMA_ADMIN_TOOLS` is the opt-in flag for its library-management
 * tools, and `MNEMON_EMBED_ENDPOINT` is where mnemon's `embed` subcommand
 * sends embedding requests. mnemon ships in every container regardless of
 * whether the Ollama MCP tool is installed, so its endpoint is always
 * forwarded (defaulting to `host.docker.internal`, Docker's host-reachable
 * hostname) rather than gated behind `OLLAMA_HOST` — harmless no-op if no
 * Ollama daemon is running on the host.
 *
 * Lives in its own file so the reach-in in `container-runner.ts` is a single
 * call (`args.push(...ollamaEnvArgs())`) and this logic is behavior-testable in
 * isolation, without invoking the OneCLI-entangled `buildContainerArgs`.
 */
export function ollamaEnvArgs(): string[] {
  const args: string[] = [];
  if (process.env.OLLAMA_HOST) {
    args.push('-e', `OLLAMA_HOST=${process.env.OLLAMA_HOST}`);
  }
  if (process.env.OLLAMA_ADMIN_TOOLS) {
    args.push('-e', `OLLAMA_ADMIN_TOOLS=${process.env.OLLAMA_ADMIN_TOOLS}`);
  }
  const mnemonEmbedEndpoint = process.env.MNEMON_EMBED_ENDPOINT || 'http://host.docker.internal:11434';
  args.push('-e', `MNEMON_EMBED_ENDPOINT=${mnemonEmbedEndpoint}`);
  return args;
}
