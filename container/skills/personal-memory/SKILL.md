---
name: personal-memory
description: Build durable, cross-session memory during ordinary conversation using mnemon — recall relevant context before responding, and decide what's worth keeping after a substantive exchange. Applies to every conversation you have, not just document ingestion.
allowed-tools: Bash(mnemon:*)
---

# Personal Memory

mnemon is your fact graph — a persistent store of things worth remembering across sessions, separate
from any one conversation's context window. This skill is the judgment layer: when to reach for it and
what belongs in it. For exact command syntax (`remember`, `recall`, `link`), see the `mnemon` skill.

This is distinct from `/workspace/agent/memory/`, your own standing index (role, persona, durable
project facts you maintain directly per `container/CLAUDE.md`). Keep that for the small set of things
you always want loaded up front. Use mnemon for the larger, growing body of specific facts you want
back only when they're relevant — recalled by query, not read in full every time.

## Recall — before responding

Default to recalling on any message that touches past context: a decision, a preference, an ongoing
project, something referenced from before. Skip it only for a direct in-topic follow-up that's already
fully in the current conversation.

```
mnemon recall "<focused, keyword-rich query>" --limit 5
```

Don't pass the raw user message as the query — extract the actual topic.

## Remember — after a substantive exchange

Bias toward storing. A low-importance memory costs nothing; a missing one costs having to re-derive
context later, or getting it wrong. Ask whether the exchange contained any of:

- An explicit preference, decision, correction, or "remember this"
- A durable fact about the user, their projects, or their setup
- A conclusion you reasoned your way to that isn't trivially re-derivable
- Something the user is currently exploring, curious about, or working on

If none of these apply, don't store anything — not every exchange needs to leave a trace.

**Categories**: `preference` · `decision` · `insight` · `fact` · `context`.
**Importance**: use the full 1–5 scale — most things land at 2–4; reserve 5 for cross-session core
facts and strong, stated preferences. Defaulting everything to 4–5 defeats the point of the scale.

**Delegate the write.** Never run `mnemon remember` or `mnemon link` yourself from the main
conversation — hand off to a Task sub-agent (`subagent_type="general-purpose"`) with only what to
store: the content, category, importance, entities, and whether it's new or an update to something
existing. The sub-agent reads the `mnemon` skill and executes the write; it should not delegate again.

## What not to store

- Anything that already lives in your own `/workspace/agent/memory/` index — don't duplicate it
- Secrets, credentials, or anything operational/transient to this one exchange
- Source material that's really another agent's job to ingest — e.g. someone sends you a document or
  article meant for the shared wiki: pass it along rather than extracting facts from it yourself
