---
name: swap-mcp-for-cli
description: Replace an agent's MCP server with an equivalent CLI tool for lower token overhead, using ncl and the OneCLI gateway's transparent credential injection. Use when the user asks to "switch X from MCP to CLI", "drop the <name> MCP server", "is there a CLI alternative to <mcp server>", or wants to cut standing MCP tool-definition cost.
---

# Swap an MCP Server for its CLI Equivalent

An MCP server's tool definitions sit in context on every turn whether used or not, and its responses tend to be verbose JSON. A CLI call via `Bash` only costs tokens when actually invoked, and the OneCLI gateway's credential injection is a whole-container HTTPS proxy — not MCP-specific — so a CLI tool gets the same transparent vault credentials an MCP server would, no extra plumbing required in the common case.

## When to use

- The user asks to replace an MCP server with a CLI, or asks whether one exists
- You're evaluating whether a newly-requested capability is better served by an existing CLI than a new MCP server

## Is it actually a good swap?

Check capability parity before dropping the MCP server — a CLI is not automatically a full substitute:

- **A general-purpose, well-documented CLI covering the same operations** → clean swap. Example from this fork: GitHub's MCP server → `gh` CLI. `gh` covers issues/PRs/releases/workflows, and `gh api <endpoint>` reaches anything it doesn't have a subcommand for — the same REST/GraphQL surface the MCP server itself wraps.
- **A hosted MCP server doing real LLM-specific work** (semantic search, ranked discovery, structured results tailored for model consumption) → keep it. Example: Hugging Face's MCP server does hosted semantic search across models/datasets/spaces; the standard `huggingface-cli`/`hf` CLI is a download/upload/repo-management tool with no equivalent discovery capability. Swapping here would be a real capability loss, not just a token optimization.

## Procedure

### 1. Confirm the CLI is actually installable

Two different mechanisms depending on scope — don't conflate them:

- **Every agent should have it** (like `agent-browser`, `claude-code`) → add a pinned entry to `container/cli-tools.json` (pnpm-installed Node CLIs only, baked into the base image for every group). See the `add-vercel` skill for the full flow, including its manifest-guard test pattern.
- **One agent group wants it** (the common case for a single user's request) → use the per-group package flow instead, which also supports apt (not just npm/pip):
  ```bash
  ncl groups config add-package --id <group-id> --apt <pkg>   # or --npm / --pip
  ncl groups restart --id <group-id> --rebuild
  ```

Either way, verify the package actually resolves before committing to the plan — don't assume it's in the default repos:
```bash
docker run --rm <base-image-from-container/Dockerfile-FROM-line> bash -c "apt-get update -qq && apt-cache policy <pkg>"
```

### 2. Drop the MCP server being replaced (if any)

```bash
ncl groups config remove-mcp-server --id <group-id> --name <mcp-name>
```

Both `config add-package` and `config remove-mcp-server` are `access: 'approval'`-gated resources, but running them directly from the host CLI (not from inside a container) executes immediately — approval holds only arise for agent-originated `cli_request` calls, not operator ones.

### 3. Test whether the CLI needs a persistent token

Many official CLIs (like `gh`) have their own local auth-state check and refuse to attempt a request at all without a token already present — they gate *before* the OneCLI proxy ever gets a chance to intercept and rewrite the request. Raw HTTP tools (`curl`, `fetch`) don't have this problem; CLIs with their own auth flow often do. Test directly, ideally by asking the agent to run it (it has the live container):

```bash
<tool> <some-authenticated-command>                     # bare first
<TOKEN_ENV_VAR>=onecli-managed <tool> <same-command>     # then with the placeholder
```

- Bare version already works → done. The whole-container proxy already covers it; no further wiring needed.
- Bare version fails ("not logged in" or similar) but the placeholder-prefixed version works → the token needs to be wired permanently (step 4).

### 4. If it needs a persistent token, wire it as a container env var

There's no generic per-group env-var column in `container_configs` — add a small helper gated on the package being installed, mirroring the existing pattern (`src/atomic-chat-env.ts`, `src/gh-cli-env.ts`):

```typescript
import type { ContainerConfig } from './container-config.js';

export function <tool>EnvArgs(containerConfig: ContainerConfig): string[] {
  if (!containerConfig.packages.apt.includes('<pkg>')) return [];
  return ['-e', '<TOKEN_ENV_VAR>=onecli-managed'];
}
```

Gate it on the package actually being present so agents without the tool don't carry an unused env var. Wire it into `src/container-runner.ts`'s `buildContainerArgs`, next to where `atomicChatEnvArgs()`/`ghCliEnvArgs()` already sit:

```typescript
args.push(...<tool>EnvArgs(containerConfig));
```

Add a unit test for the helper's own gating logic, plus a structural (AST) wiring test asserting `buildContainerArgs` actually calls it — `buildContainerArgs` is entangled with OneCLI and not cheaply invocable directly, so the reach-in needs a structural test, not a call-the-function test. Copy `src/gh-cli-env-wiring.test.ts` as the template (swap the function/file names).

### 5. Validate and ship

```bash
pnpm run build
pnpm test
```

Restart the host service (to pick up the new `container-runner.ts` code) and restart the agent's container. No image rebuild needed for the env-var wiring step itself — only the package-install step in step 1 needed `--rebuild`.

## Gotchas

- **`cli-tools.json` and per-group packages are different mechanisms for different jobs.** `cli-tools.json` is pnpm-only and install-wide with no per-group opt-in — right for a tool every agent should carry. Per-group `packages_apt`/`packages_npm`/`packages_pip` is opt-in and supports apt, which `cli-tools.json` can't install at all. Don't reach for `cli-tools.json` for an apt package.
- **A CLI's own local auth-gate is a separate problem from the OneCLI proxy.** The proxy only rewrites credentials on requests the tool actually attempts — a CLI that refuses to try without a local token needs that token wired first (step 3), regardless of how well-configured the gateway itself is.
- **Not every MCP server has a CLI worth swapping to** — check capability parity (see "Is it actually a good swap?") before dropping one. A token-cost win that also loses real functionality isn't a win.
- **Verify package availability before promising the swap** — test against the actual base image, not general assumptions about what a distro ships.
