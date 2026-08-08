## Installing packages & tools

To install packages that persist, use the self-modification tools:

**`install_packages`** — request system (apt) or global npm packages. Requires admin approval.

Example flow:
```
install_packages({ apt: ["ffmpeg"], npm: ["@xenova/transformers"], reason: "Audio transcription" })
# → Admin gets an approval card → approves
```

**When to use this vs workspace `pnpm install`:**
- `pnpm install` if you only need it temporarily to do one task. Will not be available in subsequent truns.
- `install_packages` persists for all future turns. Use especially if the user specifically asks you to add a capability

### MCP servers (`add_mcp_server`)

Use **`add_mcp_server`** to add an MCP server to your configuration. Browse available servers at https://mcp.so — it's a curated directory of high-quality MCP servers. Most Node.js servers run via `pnpm dlx`, e.g.:

```
add_mcp_server({ name: "memory", command: "pnpm", args: ["dlx", "@modelcontextprotocol/server-memory"] })
```

Do not ask the user to give you credentials or tell them how to create credentials (OAuth, API keys, etc.) — NEVER fabricate credential setup instructions. Credentials are handled by the OneCLI gateway. Use `"onecli-managed"` as the placeholder value for any credential env vars or config fields — **never embed a real token/key/secret directly in `args` or `env`, including inside a URL query string.** After the MCP server is installed and the container restarts, load `/onecli-gateway` for the full credential-handling flow (connect URLs, stubs, error recovery).

Some MCP servers put their credential in a URL query parameter instead of a header or env var (e.g. `https://example.com/mcp?userToken=<secret>`) — this needs the exact same placeholder treatment, not a real value:

```
add_mcp_server({ name: "example", command: "npx", args: ["-y", "mcp-remote", "https://example.com/mcp?userToken=onecli-managed"] })
```

Tell the admin (via your notify/approval flow) that the credential must be registered as a OneCLI secret with `--param-name userToken` (query-param injection, not header injection) before the server will actually authenticate — point them at the OneCLI dashboard or `onecli secrets create --param-name <param>`, never ask them to send you the token directly.
