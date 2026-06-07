#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: ./scripts/restore_db.sh /path/to/hongbao-YYYYMMDD-HHMMSS.db.gz" >&2
  exit 1
fi

BACKUP_PATH="$1"
DB_PATH="${RED_PACKET_DATABASE_PATH:-/home/ubuntu/red-packet-data/hongbao.db}"

if [ ! -f "$BACKUP_PATH" ]; then
  echo "Backup not found: $BACKUP_PATH" >&2
  exit 1
fi

sudo systemctl stop red-packet-api
mkdir -p "$(dirname "$DB_PATH")"

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.before-restore-$(date +%Y%m%d-%H%M%S)"
fi

case "$BACKUP_PATH" in
  *.gz) gzip -dc "$BACKUP_PATH" > "$DB_PATH" ;;
  *) cp "$BACKUP_PATH" "$DB_PATH" ;;
esac

chmod 664 "$DB_PATH"
sudo systemctl start red-packet-api
sudo systemctl status red-packet-api --no-pager
