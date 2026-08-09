# Remove Mnemon

Every step is idempotent — safe to run even if some steps were never applied.

## 1. Strip the cli-tools.json manifest entry

Open `container/cli-tools.json` and delete the `mnemon` entry:

```json
{
  "name": "mnemon",
  "version": "0.1.17",
  "source": "github-release",
  "repo": "mnemon-dev/mnemon",
  "asset": "mnemon_{version}_linux_{arch}.tar.gz"
}
```

If the entry is already gone, skip this step.

## 2. Remove the startup hook

Delete `container/agent-runner/src/memory/mnemon-setup.ts` and
`container/agent-runner/src/memory/mnemon-setup.test.ts`, then remove the import and call from
`container/agent-runner/src/index.ts`:

```ts
import { ensureMnemonSetup } from './memory/mnemon-setup.js';
```

```ts
  // Optional: mnemon's Claude Code hooks, if the binary is present (added via
  // container/cli-tools.json). No-ops when absent.
  ensureMnemonSetup(log);
```

If any of these are already gone, skip that part.

## 3. Delete the copied manifest test

```bash
rm -f src/mnemon-manifest.test.ts
```

## 4. Rebuild and restart

```bash
./container/build.sh
source setup/lib/install-slug.sh

# macOS
launchctl kickstart -k gui/$(id -u)/$(launchd_label)

# Linux
systemctl --user restart $(systemd_unit)
```

On a hardened-image install, the next `./container/build.sh` (or `/update-nanoclaw`'s refresh)
naturally drops mnemon once the manifest entry is gone — it re-applies `cli-tools.json` from
scratch rather than removing individual tools.

## 5. Delete stored memory (optional)

Mnemon's graph lives at `/home/node/.claude/mnemon/` in each container, which maps to the
per-agent-group `.claude/` directory on the host. To find the host path and clear it:

```bash
docker inspect $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) \
  --format '{{range .Mounts}}{{if eq .Destination "/home/node/.claude"}}{{.Source}}{{end}}{{end}}'
```

Stop the container, then delete the `mnemon/` subdirectory from that path.
