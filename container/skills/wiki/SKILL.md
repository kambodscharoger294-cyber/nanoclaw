---
name: wiki
description: Maintain the personal LLM wiki — a persistent, cross-linked knowledge base built from ingested sources. Use whenever a source needs ingesting, a question should be answered from accumulated knowledge, or the wiki needs a health check.
allowed-tools: Bash(pdftotext:*), Bash(tesseract:*), Bash(ffmpeg:*), Bash(curl:*), Bash(mnemon:*), Bash(bun:*)
---

# Wiki Maintenance

Pattern: [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). Three
layers — raw sources (immutable), a mnemon fact graph, and this synthesized markdown wiki — with you as
the maintainer doing the bookkeeping a human would abandon.

```
sources/                  raw, immutable — never edit these
wiki/
  index.md                catalog of every page, updated on every ingest
  log.md                  append-only activity log
  entities/                people, organizations, tools, places — one page each
  concepts/                ideas, techniques, recurring themes — one page each
  timelines/               chronological threads — one page per thread
```

## Ingest — one source at a time

**Never batch-read multiple files and then process them together.** For each source: extract text →
`mnemon remember` the discrete facts → update/create the relevant wiki pages → update `index.md` →
append `log.md` → only then move to the next file. Batching produces shallow, generic pages instead of
real integration.

### 1. Get full text out of the source

| Source | How |
|---|---|
| Markdown / plain text | Read directly. |
| PDF | `pdftotext sources/file.pdf -`. If output is empty or near-empty (scanned/image PDF), render pages and OCR them: `pdftoppm -png sources/file.pdf /tmp/page && tesseract /tmp/page-1.png -` per page. |
| Image | `tesseract sources/image.png -` pulls text *in* the image (screenshots, receipts, scanned notes). This is OCR only — it cannot describe a photo's contents (no vision model wired up yet). If the image has no embedded text, note in the source's index entry that it's stored but not yet ingested, rather than fabricating a description. |
| Voice note | See **Transcription** below. |
| URL | See **URLs** below. |

Always save the source itself into `sources/` first (even audio/images pending future capability), so nothing is lost.

### Transcription (voice notes)

whisper.cpp is not baked into the image — install it once into the persistent workspace (survives
container restarts; skip if already present):

```bash
WHISPER_DIR="/workspace/agent/tools/whisper"
if [ ! -f "$WHISPER_DIR/.installed" ]; then
  mkdir -p "$WHISPER_DIR"
  ARCH=$(dpkg --print-architecture)
  case "$ARCH" in
    amd64) ASSET="whisper-bin-ubuntu-x64.tar.gz" ;;
    arm64) ASSET="whisper-bin-ubuntu-arm64.tar.gz" ;;
    *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
  esac
  curl -fsSL "https://github.com/ggerganov/whisper.cpp/releases/latest/download/$ASSET" -o /tmp/whisper.tar.gz
  tar -xzf /tmp/whisper.tar.gz -C "$WHISPER_DIR"
  rm -f /tmp/whisper.tar.gz
  # ggml-small: multilingual (handles German), ~488MB, good speed/accuracy balance.
  curl -fsSL "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" -o "$WHISPER_DIR/ggml-small.bin"
  touch "$WHISPER_DIR/.installed"
fi

WHISPER_BIN="$WHISPER_DIR/bin/whisper-cli"
[ -x "$WHISPER_BIN" ] || WHISPER_BIN="$WHISPER_DIR/bin/main"  # older releases name it `main`

# whisper.cpp wants 16kHz mono WAV — convert first (voice notes usually arrive as ogg/opus/m4a).
ffmpeg -y -i sources/note.ogg -ar 16000 -ac 1 -c:a pcm_s16le /tmp/note.wav
"$WHISPER_BIN" -m "$WHISPER_DIR/ggml-small.bin" -f /tmp/note.wav -l auto -otxt -of /tmp/note-transcript
```

Read `/tmp/note-transcript.txt` as the source's full text, then treat it like any other text source.

### URLs

`WebFetch` returns a summary, not full text — never use it as the actual ingested source, only for a
quick "is this worth pulling in" triage. For real ingestion:

- Direct file (PDF, image, etc.): `curl -sLo sources/name.pdf "<url>"`, then process per the table above.
- Web page: try `curl -sL "<url>"` first for static HTML. If the content looks client-rendered (thin
  HTML, mostly `<script>`), use `agent-browser` to open it and extract the rendered text instead.

### 2. Extract facts into mnemon

For each discrete fact worth keeping:

```bash
mnemon remember "<fact>" --cat <category> --imp <1-5> --entities "e1,e2" --source agent
```

Review the `semantic_candidates` / `causal_candidates` mnemon returns — use judgment, not mechanical
rules. Only `mnemon link <id> <candidate> --type <causal|semantic> --weight <0-1>` when the relationship
is genuinely meaningful, not just keyword overlap.

### 3. Synthesize into wiki pages

A single source might touch several pages:

- New or existing **entity** pages (`wiki/entities/<name>.md`) for people, orgs, tools, places it
  mentions
- New or existing **concept** pages (`wiki/concepts/<name>.md`) for ideas/techniques it touches
- A **timeline** entry (`wiki/timelines/<thread>.md`) if it's part of an ongoing chronological thread
- Cross-references — link related pages to each other, both directions

Every page (new or touched) carries Open Knowledge Format (OKF) v0.1 YAML frontmatter — the same
convention `memory/system/definition.md` documents for this agent's own memory — prepended above the H1,
body untouched otherwise:

```yaml
---
type: entity   # or: concept
title: <display name>
description: <one-line summary>
tags: [tag1, tag2, ...]
resource: sources/<file>.md   # omit if no single source file backs this page
timestamp: <YYYY-MM-DD>       # date of this edit
---
```

`wiki/index.md` itself declares `okf_version: "0.1"` at the top (matching `memory/index.md`'s
convention) — check it's still there when you touch the index.

Each page: a short summary at the top, then detail, then a `## Sources` section listing which raw
sources and mnemon insight IDs it's built from. Keep pages narrative, not just fact dumps — synthesis is
the point.

### 4. Update the index and log

`wiki/index.md` — one line per page: link, one-line summary, category, last-updated date. Update the
entries for every page you touched this ingest.

`wiki/log.md` — append one entry, oldest-to-newest, parseable prefix:

```
## [2026-08-09] ingest | <source title>
Touched: entities/X.md, concepts/Y.md, timelines/Z.md. <one-line note on what was learned>
```

`grep "^## \[" wiki/log.md | tail -5` gives the last 5 entries — check this when picking up context on
what happened recently.

## Query

Read `wiki/index.md` first to find relevant pages before drilling in — this scales to ~100 sources /
hundreds of pages on its own. Use `mnemon recall "<query>"` / `mnemon search "<query>"` to pull facts
the wiki pages might not fully surface — this is the first move for concrete, nameable topics.

For abstract or philosophical questions where the phrasing might not match the wiki's original wording
(keyword search misses these — e.g. "why does deleting data release heat" won't keyword-match a fact
phrased around "Landauer's principle"), fall back to meaning-based search:

```bash
bun /app/skills/wiki/scripts/mnemon-semantic-search.ts "<query>" --limit 5
```

This is a supplementary fallback, not a replacement for the index-first approach above. Cite sources. A
genuinely good answer can be filed back into the wiki as a new page rather than left in chat — that's
how exploration compounds instead of disappearing.

## Lint

Periodically (see the scheduled task, if one exists):

- Contradictions between pages, or a page contradicting a newer source
- Stale claims a newer source superseded but the page wasn't updated
- Orphan pages — nothing links to them
- Entities/concepts mentioned repeatedly in sources but with no dedicated page yet
- Missing cross-references between clearly related pages
- `mnemon gc --threshold 0.4` for graph-side cleanup suggestions

Log the lint pass in `wiki/log.md` (`## [date] lint | <summary>`) and report findings — don't
silently fix contradictions, surface them.
