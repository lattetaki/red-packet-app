#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${RED_PACKET_DATABASE_PATH:-/home/ubuntu/red-packet-data/hongbao.db}"
BACKUP_DIR="${RED_PACKET_BACKUP_DIR:-/home/ubuntu/red-packet-backups}"
KEEP_DAYS="${RED_PACKET_BACKUP_KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$BACKUP_DIR/hongbao-$timestamp.db"

cp "$DB_PATH" "$backup_path"
gzip -f "$backup_path"

find "$BACKUP_DIR" -name 'hongbao-*.db.gz' -type f -mtime +"$KEEP_DAYS" -delete

echo "Created backup: $backup_path.gz"
