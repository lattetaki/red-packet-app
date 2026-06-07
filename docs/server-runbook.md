# Server Runbook / 服务器操作小抄

这份文档用于线上服务器的日常维护。  
This file is a practical runbook for the production server.

## 常用路径 / Common Paths

| Purpose | Path |
| --- | --- |
| App source | `/home/ubuntu/apps/red-packet-app` |
| Frontend web root | `/var/www/red-packet-app` |
| Production database | `/home/ubuntu/red-packet-data/hongbao.db` |
| Database backups | `/home/ubuntu/red-packet-backups` |
| Backend service | `red-packet-api` |

## 更新部署 / Deploy Update

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/deploy.sh
```

完成后确认服务：

```bash
sudo systemctl status red-packet-api --no-pager
curl -I http://127.0.0.1
curl http://127.0.0.1:8000/health
```

## 备份数据库 / Backup Database

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/backup_db.sh
```

查看备份：

```bash
ls -lh /home/ubuntu/red-packet-backups
```

## 恢复数据库 / Restore Database

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/restore_db.sh /home/ubuntu/red-packet-backups/hongbao-YYYYMMDD-HHMMSS.db.gz
```

恢复脚本会：

- 停止后端服务
- 备份当前数据库
- 恢复指定备份
- 重新启动后端服务

The restore script stops the API, backs up the current database, restores the selected backup, and starts the API again.

## 自动备份 / Automatic Backup

安装每日自动备份：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/install_backup_timer.sh
```

查看 timer：

```bash
sudo systemctl list-timers red-packet-backup.timer --no-pager
```

查看最近一次备份日志：

```bash
sudo journalctl -u red-packet-backup.service -n 50 --no-pager
```

## 查看日志 / View Logs

后端服务日志：

```bash
sudo journalctl -u red-packet-api -n 100 --no-pager
```

持续查看：

```bash
sudo journalctl -u red-packet-api -f
```

Caddy 日志：

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

## 数据库迁移到独立目录 / Move Database To Data Directory

只需要做一次。先停止服务：

```bash
sudo systemctl stop red-packet-api
mkdir -p /home/ubuntu/red-packet-data
cp /home/ubuntu/apps/red-packet-app/backend/hongbao.db /home/ubuntu/red-packet-data/hongbao.db
chmod 664 /home/ubuntu/red-packet-data/hongbao.db
```

然后在 `/etc/systemd/system/red-packet-api.service` 中加入：

```ini
Environment=RED_PACKET_DATABASE_PATH=/home/ubuntu/red-packet-data/hongbao.db
```

重载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl start red-packet-api
```

确认数据正常后，再考虑保留或删除旧的 `backend/hongbao.db`。

## HTTPS 检查 / HTTPS Check

浏览器访问：

```text
https://daluandoubaoju.xyz
```

如果 HTTPS 没有生效，通常检查：

- DNS 的 `@` 和 `www` 是否指向服务器公网 IP
- 腾讯云防火墙是否开放 80 和 443
- 服务器上的 Caddy 是否运行

Commands:

```bash
sudo systemctl status caddy --no-pager
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 少手动编辑的方法 / Avoid Manual Editing

日常部署使用 `bash scripts/deploy.sh`。  
数据库备份使用 `bash scripts/backup_db.sh`。  
数据库恢复使用 `bash scripts/restore_db.sh`。

如果必须改 systemd 或 Caddy 配置，建议先把完整配置发给我确认，再一次性复制粘贴到服务器。这样比在 `nano` 里一行一行改更稳。
