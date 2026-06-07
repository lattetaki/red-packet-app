#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${RED_PACKET_APP_DIR:-/home/ubuntu/apps/red-packet-app}"
DATA_DIR="${RED_PACKET_DATA_DIR:-/home/ubuntu/red-packet-data}"
DB_PATH="${RED_PACKET_DATABASE_PATH:-$DATA_DIR/hongbao.db}"
BACKUP_DIR="${RED_PACKET_BACKUP_DIR:-/home/ubuntu/red-packet-backups}"
BACKUP_TIME="${RED_PACKET_BACKUP_TIME:-03:30:00}"

sudo tee /etc/systemd/system/red-packet-backup.service >/dev/null <<SERVICE
[Unit]
Description=Red Packet SQLite backup

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=$APP_DIR
Environment=RED_PACKET_DATABASE_PATH=$DB_PATH
Environment=RED_PACKET_BACKUP_DIR=$BACKUP_DIR
ExecStart=/usr/bin/env bash $APP_DIR/scripts/backup_db.sh
SERVICE

sudo tee /etc/systemd/system/red-packet-backup.timer >/dev/null <<TIMER
[Unit]
Description=Daily Red Packet SQLite backup

[Timer]
OnCalendar=*-*-* $BACKUP_TIME
Persistent=true

[Install]
WantedBy=timers.target
TIMER

sudo systemctl daemon-reload
sudo systemctl enable --now red-packet-backup.timer
sudo systemctl list-timers red-packet-backup.timer --no-pager
