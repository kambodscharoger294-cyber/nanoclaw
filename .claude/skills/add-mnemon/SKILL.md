---
name: add-mnemon
description: Add persistent graph-based memory via mnemon. Agents recall past context before responding and remember insights after each turn.
---

# Add Mnemon — Persistent Memory

Installs [mnemon](https://github.com/mnemon-dev/mnemon)'s binary in the agent container image via
`container/cli-tools.json` — the same manifest that installs `agent-browser` and
`@anthropic-ai/claude-code`, extended with a `github-release` tool source since mnemon ships as a
release binary, not an npm package. Going through the manifest (rather than a Dockerfile edit)
means the install works whether this checkout builds its own image or pulls a hardened one —
`container/build.sh`'s overlay path applies the same manifest either way.

At agent-runner startup, `mnemon setup` registers Claude Code hooks that surface relevant memory
before the agent responds and store new insights after each turn. This runs from
`container/agent-runner/src/memory/mnemon-setup.ts`, called at the top of `main()` in
`container/agent-runner/src/index.ts` — **not** from `container/entrypoint.sh`. The host always
spawns sessions with `--entrypoint bash -c 'exec bun run /app/src/index.ts'`
(`src/container-runner.ts`), bypassing the image's own `ENTRYPOINT` entirely; `entrypoint.sh` only
runs for the standalone `docker run -i <image>` debug path (and that path also execs into
`index.ts`, so wiring it there covers both). Memory is written to the per-agent-group `.claude/`
mount and survives container restarts.

## Provider Compatibility

mnemon hooks fire only under `--target claude-code`. Use this skill on agent groups that run the
default Claude provider. The provider is the materialized `provider` key in each group's
`container.json` (absent or `claude` = default Claude provider). Confirm it before applying:

```bash
grep -H '"provider"' groups/*/container.json 2>/dev/null   # no match, or "provider": "claude" = Claude
```

If a group sets a different provider (e.g. `"provider": "opencode"`), it spawns its own process and
never invokes the `claude` CLI, so the hooks registered by `mnemon setup` do not run for that
group. This is harmless, not an error — `ensureMnemonSetup` is best-effort and never blocks the
agent from starting.

## Phase 1: Pre-flight

### Check if already applied

```bash
grep -q '"mnemon"' container/cli-tools.json && echo "Already applied" || echo "Not applied"
```

If already applied, re-run Phase 2 anyway — every step is idempotent and skips work that is
already in place — then continue to Phase 3 (Verify).

### Check latest mnemon version

```bash
curl -fsSL https://api.github.com/repos/mnemon-dev/mnemon/releases/latest | grep '"tag_name"'
```

Note the version (e.g. `v0.1.17`) — use it without the `v` prefix as the manifest `"version"` in
the next step.

## Phase 2: Apply Changes

### 1. cli-tools.json — add the mnemon manifest entry

Append this entry to the array in `container/cli-tools.json` (skip if a `"mnemon"` entry is
already present — bump its `"version"` instead if you're upgrading):

```json
{
  "name": "mnemon",
  "version": "0.1.17",
  "source": "github-release",
  "repo": "mnemon-dev/mnemon",
  "asset": "mnemon_{version}_linux_{arch}.tar.gz"
}
```

`install-cli-tools.sh` resolves `{version}` and `{arch}` (from `dpkg --print-architecture`,
`amd64`/`arm64`) against `repo`'s GitHub releases, downloads the tarball, and installs the
`mnemon` binary to `/usr/local/bin`. No `binary` field is needed here since it defaults to `name`.

### 2. Ship the startup hook

Copy the module and its test into the agent-runner source tree (skip if
`container/agent-runner/src/memory/mnemon-setup.ts` already exists):

```bash
cp .claude/skills/add-mnemon/mnemon-setup.ts container/agent-runner/src/memory/mnemon-setup.ts
cp .claude/skills/add-mnemon/mnemon-setup.test.ts container/agent-runner/src/memory/mnemon-setup.test.ts
```

`ensureMnemonSetup` shells out to `mnemon setup --target claude-code --yes --global` with
`MNEMON_DATA_DIR=/home/node/.claude/mnemon` set, guarded so a container without the binary (an
install that hasn't rebuilt yet, or opted the tool back out) no-ops silently instead of erroring.

Wire it into `container/agent-runner/src/index.ts` (skip either edit if already present):

```bash
grep -q "ensureMnemonSetup" container/agent-runner/src/index.ts && echo "Already wired" || echo "Wire it"
```

Add the import next to the other `memory/` imports:

```ts
import { ensureMnemonSetup } from './memory/mnemon-setup.js';
```

And the call right after `ensureMemoryScaffold();` inside `main()`:

```ts
  // Every provider shares one persistent memory tree. Legacy imports are an
  // operator-run migration and never happen in this normal startup path.
  ensureMemoryScaffold();

  // Optional: mnemon's Claude Code hooks, if the binary is present (added via
  // container/cli-tools.json). No-ops when absent.
  ensureMnemonSetup(log);
```

### 3. Run the tests

```bash
cd container/agent-runner && bun test src/memory/mnemon-setup.test.ts
pnpm exec tsc -p container/agent-runner/tsconfig.json --noEmit
```

Then copy and run the manifest guard in the host tree:

```bash
cp .claude/skills/add-mnemon/mnemon-manifest.test.ts src/mnemon-manifest.test.ts
pnpm exec vitest run src/mnemon-manifest.test.ts
```

`mnemon-manifest.test.ts` asserts `cli-tools.json` has a `mnemon` entry with `source:
github-release` and a pinned version (red if the entry is dropped on an upgrade).
`mnemon-setup.test.ts` asserts the startup hook is guarded (no-ops when the binary is absent) and
calls `mnemon setup --target claude-code` with `MNEMON_DATA_DIR` set when it's present.

### 4. Rebuild and smoke-test the image

Only the binary install (`cli-tools.json`) needs an image rebuild — `container/agent-runner/src`
is bind-mounted from this checkout at every spawn, so the startup-hook edit takes effect on the
next container start with no rebuild needed. Rebuild works the same whether this install builds
locally or pulls a hardened base — `container/build.sh` decides which on its own from `.env`'s
`NANOCLAW_HARDENED_IMAGE` (see [docs/hardened-image.md](../../../docs/hardened-image.md)):

```bash
./container/build.sh
source setup/lib/install-slug.sh
docker run --rm --entrypoint mnemon "$(container_image_base):latest" --version
```

Don't assume the image tag is `nanoclaw-agent:latest` — each install's tag is slug-scoped
(`nanoclaw-agent-v2-<slug>`), which is what `container_image_base` resolves.

## Phase 3: Restart and Verify

### Restart the service

Run from your NanoClaw project root:

```bash
source setup/lib/install-slug.sh
systemctl --user restart $(systemd_unit)              # Linux
# launchctl kickstart -k gui/$(id -u)/$(launchd_label)   # macOS
```

### Confirm mnemon hooks are registered

Send the agent a message so a fresh container spawns, then check for the startup log line:

```bash
docker logs $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>&1 | grep -i mnemon
```

`mnemon memory hooks registered` means it ran; `mnemon setup failed: ...` means it ran but errored
(see Troubleshooting); no line at all means the binary wasn't found (rebuild).

Then inspect the hooks inside the running container:

```bash
docker exec $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) \
  cat /home/node/.claude/settings.json | grep -A5 mnemon
```

### Test memory recall

Have a conversation with the agent, then start a new session and reference something from the
earlier one. Mnemon should surface the relevant context automatically without you restating it.

## Memory Storage

Mnemon writes to `/home/node/.claude/mnemon/` inside the container, which maps to the per-agent-group
`.claude/` directory on the host. To find the exact host path:

```bash
docker inspect $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) \
  --format '{{range .Mounts}}{{if eq .Destination "/home/node/.claude"}}{{.Source}}{{end}}{{end}}'
```

To reset all memory for an agent, stop the container and delete the `mnemon/` subdirectory from
that host path.

## Troubleshooting

### `mnemon: command not found`, or no "registered" log line

The image wasn't rebuilt after adding the manifest entry, or (on a pulled/hardened install) the
overlay never ran. Run `./container/build.sh` and restart — `ensureMnemonSetup` fails quietly (the
container starts normally without memory hooks), so check the logs rather than assuming a crash
would tell you.

### On a hardened-image install: tools added but not hardened

`./container/build.sh`'s overlay path layers `cli-tools.json` on top of the pulled image rather
than rebuilding it, so the published base stays exactly what its publisher hardened — but mnemon
itself wasn't part of that scan. This is expected; see the printed note after the build, or
[docs/hardened-image.md](../../../docs/hardened-image.md).

### Memory not persisting across restarts

Verify `MNEMON_DATA_DIR` resolves to a mounted path (not an in-container ephemeral directory):

```bash
docker exec <container> sh -c 'ls -la $MNEMON_DATA_DIR'
```

If the directory is empty after conversations, the mount is missing or the path is wrong. Check
the host mount with the `docker inspect` command above.

### Agent not using past memory

`mnemon setup` writes hooks into `/home/node/.claude/settings.json`. Verify:

```bash
docker exec <container> cat /home/node/.claude/settings.json
```

If the hooks are absent, `mnemon setup` may have failed silently — check for the
`mnemon setup failed: ...` log line described above.

### Setup fails at container start

Run setup manually inside a running container to see the full error:

```bash
docker exec -it <container> mnemon setup --target claude-code --yes --global
```
