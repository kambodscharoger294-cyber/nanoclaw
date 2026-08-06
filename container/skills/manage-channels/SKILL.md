---
name: manage-channels
description: Wire a chat/channel to an agent, adjust how you engage in a conversation, or set up a new agent for a different person — from inside the chat, using ncl. Use when the user asks things like "let this Signal group talk to you", "add my Slack channel", "only respond when I mention you here", "give someone else access", or "make a separate assistant for X". Requires cli_scope: global — group-scoped agents cannot do this.
---

# Manage Channels (from chat)

This is the in-chat counterpart to the operator's `/manage-channels` workflow — it does the same job (wiring chats to agents, adjusting engagement rules) but entirely through `ncl`, since you don't have host filesystem or direct DB access from inside the container.

## When to use

- "Let [person/group] message you here too"
- "Only reply when someone @-mentions you in this group"
- "Stop replying to everything in this chat"
- "Set up a separate assistant for [person]"
- "Who can talk to me right now?"

## Prerequisite: you need global CLI scope

Channel wiring (`messaging-groups`, `wirings`) is **not** in the group-scoped resource allowlist (`groups`, `sessions`, `destinations`, `members`, `tasks` only) — a group-scoped agent gets a hard "CLI access is scoped to this agent group" error, and cannot escalate itself (the host guard explicitly blocks a group-scoped agent from changing its own `cli_scope`, to prevent privilege escalation).

Check your own scope:
```
ncl groups config get --id <your-group-id>
```
If `cli_scope` isn't `global`, tell the user this needs the operator to run, from the host machine (not from here):
```
ncl groups config update --id <group-id> --cli-scope global
```
Then stop — you cannot do this step yourself.

## Everything here needs admin approval

Even at global scope, creating/updating/deleting a `messaging-group` or `wiring` is approval-gated — same UX as `install_packages`. Running the command submits a request; an admin gets a card to approve or reject; you're notified of the outcome. Set that expectation before you act: *"I'll wire that up — it needs a quick approval first."* `list`/`get` are open (no approval needed) — use those freely to look around first.

## Look at current state

```
ncl messaging-groups list
ncl wirings list
ncl groups list
ncl roles list
```

## Wire an already-known chat to an agent

The common case: someone already messaged in (so a `messaging_groups` row exists) but nothing is wired to it — messages from them are being rejected under the default `strict` unknown-sender policy.

1. Find it: `ncl messaging-groups list` (or filter by channel type / platform id if the user gave you one).
2. Ask the isolation question — this determines which agent group to wire to:
   - **Same conversation as us** → wire to your own agent group, `--session-mode agent-shared` (all messages land in one shared session).
   - **You, but a separate conversation** → wire to your own agent group, `--session-mode shared` (shared memory/workspace, independent thread).
   - **A fully separate assistant** → create a new agent group first (see below), then wire to that.
3. Wire it:
   ```
   ncl wirings create --messaging-group-id <mg-id> --agent-group-id <ag-id> --session-mode <mode>
   ```
   Omit `--engage-mode`/`--engage-pattern`/etc. to inherit the channel's declared defaults (DM vs group aware). Run `ncl wirings help` for the full flag list — don't guess at flags, they can drift; the `help` output is always current.

## Set up a separate assistant for someone

```
ncl groups create --folder <slug> --name "<display name>"
ncl wirings create --messaging-group-id <mg-id> --agent-group-id <new-ag-id>
```
This is a genuinely separate, isolated agent group (own workspace, own memory) — different from `create_agent`, which spins up a *companion* sub-agent under you for delegation. Use `ncl groups create` for "a different person gets their own assistant"; use `create_agent` only when the request is really "I want a helper I can delegate tasks to."

## Wiring a brand-new platform (Telegram, Slack, Discord, etc.)

You can't do this from here — it needs a code-level channel adapter installed (credentials, OAuth, a new dependency), which is a host-side operation. Tell the user the operator needs to run the relevant `/add-<channel>` skill from the host. Don't attempt to touch source files or install dependencies yourself for this.

## Adjusting how you engage in a chat you're already wired to

```
ncl wirings update <wiring-id> --engage-mode mention
ncl wirings update <wiring-id> --engage-mode pattern --engage-pattern '(?i)^@?YourName\b'
ncl wirings update <wiring-id> --threads false
```
- `mention` — only when actually @-mentioned (or any DM).
- `mention-sticky` — mentioned once in a thread, then responds to the rest of that thread without further mentions. Needs threads to actually be on for that chat — if they're off, this silently downgrades to plain `mention`.
- `pattern` — matches every message against a regex; `.` means respond to everything.
- A channel with no mention signal (its adapter declares `mentions: 'never'`) can never use `mention`/`mention-sticky` — `ncl` will reject it. Use a name-pattern instead.

## Gotchas

- **Renaming your agent group doesn't update stored name-patterns.** If a wiring's `engage_pattern` was built from your old name, it keeps matching the old name until someone updates it explicitly.
- **Moving a wiring to a different agent doesn't move history.** Old sessions stay with the old agent; new messages start fresh sessions under the new one.
- **`ncl <resource> help` is always current** — prefer it over memorizing flags, since flags can change between versions.
