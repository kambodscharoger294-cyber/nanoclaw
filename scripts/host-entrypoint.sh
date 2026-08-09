#!/bin/bash
#
# launchd's actual ProgramArguments target. Rebuilds dist/ from src/ before
# every start, then execs the host.
#
# Why this exists: dist/index.js is a compiled bundle (see package.json's
# "build" script), and nothing rebuilt it automatically. src/ changes could
# be committed, tested, and merged while the live service kept running a
# stale dist/ — silently, no error, just old code — until whoever restarted
# it happened to also run `pnpm run build` by hand first. Real incident
# (2026-08-09): two bug fixes from the day before were sitting in git looking
# shipped but had never actually run, because the intervening restarts were
# all bare `launchctl kickstart` / crash-restarts with no build step.
#
# Invokes tsc directly (node_modules/.bin/tsc) rather than `pnpm run build` —
# launchd's PATH (set in the plist) doesn't include wherever pnpm lives, and
# tsc with no args already does exactly what "build" runs.
#
# `set -e`: a broken build must not silently fall through to executing a
# stale or partial dist/ — better to fail loudly (visible in
# nanoclaw.error.log, and KeepAlive will keep retrying) than run wrong code.
set -e
cd "$(dirname "${BASH_SOURCE[0]}")/.."
./node_modules/.bin/tsc
exec node dist/index.js
