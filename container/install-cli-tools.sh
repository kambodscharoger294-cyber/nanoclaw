#!/bin/sh
# Install the global CLI tools the agent invokes at runtime, from cli-tools.json.
#
# A skill adds a tool by appending an entry to that manifest (a json-merge)
# instead of editing the Dockerfile — the reach-in becomes the safest change
# shape, deterministic and removable. It's also the only shape that works on
# both build paths: container/build.sh runs this same script, against the same
# manifest, whether it's building the image from scratch or layering onto a
# pulled hardened base (its "overlay" path) — a Dockerfile edit only ever
# reaches the former.
#
# Two tool sources, keyed by "source" (defaults to "npm" when absent):
#   - npm: { name, version, onlyBuilt? } — installed via
#     `pnpm install -g name@version`, pinned, so the pnpm supply-chain policy
#     still applies. "onlyBuilt": true opts into a native postinstall (pnpm
#     skips build scripts by default).
#   - github-release: { name, version, source: "github-release", repo, asset,
#     binary? } — downloads one release asset from `repo` (an "owner/repo"
#     string) at tag "v<version>", untars it, and installs "binary" (defaults
#     to "name") to /usr/local/bin. "asset" is a filename template with
#     {version} and {arch} placeholders; {arch} substitutes
#     `dpkg --print-architecture` (amd64/arm64), which is how most Go release
#     tools name their Linux assets.
#
# Run as root before `USER node`, so /root/.npmrc and /usr/local/bin are the
# right homes.
set -eu

MANIFEST="${1:-/tmp/cli-tools.json}"

# Write the per-tool only-built-dependencies opt-ins pnpm reads at install time.
node -e '
  const tools = require(process.argv[1]).filter((t) => (t.source || "npm") === "npm");
  const optIns = tools.filter((t) => t.onlyBuilt).map((t) => "only-built-dependencies[]=" + t.name);
  require("fs").writeFileSync("/root/.npmrc", optIns.join("\n") + (optIns.length ? "\n" : ""));
' "$MANIFEST"

# Install every npm-sourced tool, pinned. name@version specs never contain
# spaces, so the unquoted expansion word-splits cleanly into positional args.
# shellcheck disable=SC2046
set -- $(node -e '
  require(process.argv[1])
    .filter((t) => (t.source || "npm") === "npm")
    .forEach((t) => console.log(t.name + "@" + t.version));
' "$MANIFEST")
if [ "$#" -gt 0 ]; then
  pnpm install -g "$@"
fi

# Install every github-release-sourced tool: one pinned binary tarball each,
# extracted straight to /usr/local/bin. Tab-separated so a `read` loop can
# split it without word-splitting on spaces inside a repo path or asset name.
ARCH="$(dpkg --print-architecture)"
node -e '
  require(process.argv[1])
    .filter((t) => t.source === "github-release")
    .forEach((t) => console.log([t.name, t.version, t.repo, t.asset, t.binary || t.name].join("\t")));
' "$MANIFEST" | while IFS="$(printf '\t')" read -r NAME VERSION REPO ASSET BINARY; do
  [ -n "$NAME" ] || continue
  RESOLVED_ASSET=$(printf '%s' "$ASSET" | sed "s/{version}/$VERSION/g; s/{arch}/$ARCH/g")
  curl -fsSL "https://github.com/$REPO/releases/download/v$VERSION/$RESOLVED_ASSET" \
    | tar -xz -C /usr/local/bin "$BINARY"
  chmod +x "/usr/local/bin/$BINARY"
done
