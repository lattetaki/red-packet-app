#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${RED_PACKET_APP_DIR:-/home/ubuntu/apps/red-packet-app}"
WEB_DIR="${RED_PACKET_WEB_DIR:-/var/www/red-packet-app}"
DATA_DIR="${RED_PACKET_DATA_DIR:-/home/ubuntu/red-packet-data}"
DB_PATH="${RED_PACKET_DATABASE_PATH:-$DATA_DIR/hongbao.db}"

cd "$APP_DIR"
git pull

mkdir -p "$DATA_DIR"
if [ ! -f "$DB_PATH" ] && [ -f "$APP_DIR/backend/hongbao.db" ]; then
  cp "$APP_DIR/backend/hongbao.db" "$DB_PATH"
fi
chmod 664 "$DB_PATH" 2>/dev/null || true

cd "$APP_DIR/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -r requirements.txt

cd "$APP_DIR/frontend"
printf 'VITE_API_BASE_URL=/api\nVITE_APP_ENV_LABEL=Online\n' > .env.production
npm install
npm run build

sudo mkdir -p "$WEB_DIR"
sudo rsync -a --delete dist/ "$WEB_DIR/"
sudo chown -R www-data:www-data "$WEB_DIR"

sudo systemctl restart red-packet-api
sudo systemctl reload caddy

echo "Deploy complete."
