#!/bin/bash
# Backup of NanoClaw's live state (central DB, session DBs, agent
# workspaces, .env) to Google Drive, run once per login via launchd. Git only
# covers code — none of this is committed, so without this, losing the
# laptop loses it all.
#
# No automated pruning: launchd background processes can't modify or move
# existing files in a synced Google Drive folder (only creating new ones
# works — confirmed by testing find/mv/delete, all blocked with "Operation
# not permitted" without Full Disk Access, which can't be granted from a
# script). Old archives are small (a few MB each) and safe to leave — delete
# or move them yourself in Finder whenever you like.
set -euo pipefail

PROJECT_ROOT="/Users/waswer/nanoclaw"
DEST_DIR="/Users/waswer/Library/CloudStorage/GoogleDrive-kambodscharoger294@gmail.com/Meine Ablage/NanoClaw-Backups"

mkdir -p "$DEST_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$DEST_DIR/nanoclaw-backup-$TIMESTAMP.tar.gz"

cd "$PROJECT_ROOT"
tar -czf "$ARCHIVE" \
  --exclude="data/cli.sock" \
  --exclude="data/ncl.sock" \
  data/ groups/ .env

echo "Backed up to: $ARCHIVE"
