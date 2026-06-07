# Red Packet App / 红包记录管理

一个用于小型多人红包局的记录、审核、统计和用户管理 Web 应用。

This is a small multi-user web app for managing red packet records, review workflows, statistics, and user access.

## 功能 / Features

- 红包录入：管理员录入发包人、抢包人和金额，默认金额可按发包人记忆。
- 记录管理：查看、筛选、编辑、软删除红包记录。
- 审核队列：待审核记录由管理员确认后进入统计。
- 已删除记录：管理员可查看回收站并恢复误删记录。
- 用户管理：区分网页访问用户和红包参与者。
- 统计看板：总览、全员排行、趋势图和个人统计排名。
- 我的提交：普通用户可查看自己的提交状态。

- Record entry with remembered sender-specific default amounts.
- Record list with filters, detail view, edit, and soft delete.
- Admin review queue before records enter statistics.
- Deleted-record recycle bin with restore support.
- Separate app users and red packet participants.
- Dashboard statistics, rankings, trends, and personal rankings.
- Viewer-facing submission status page.

## 技术栈 / Tech Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: FastAPI + SQLAlchemy + SQLite
- Deployment: Caddy + systemd + Tencent Cloud Lighthouse

## 本地开发 / Local Development

后端：

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

前端：

```bash
cd frontend
npm install
npm run dev
```

本地默认后端地址是 `http://127.0.0.1:8000`，前端开发服务器通常是 `http://localhost:5173`。

## 环境变量 / Environment Variables

后端：

| Name | Description |
| --- | --- |
| `RED_PACKET_DATABASE_PATH` | SQLite database path. Default: `backend/hongbao.db`. |
| `RED_PACKET_TOKEN_SECRET` | JWT signing secret. Use a long random value in deployment. |

前端：

| Name | Description |
| --- | --- |
| `VITE_API_BASE_URL` | API base URL. Production normally uses `/api`. |
| `VITE_APP_ENV_LABEL` | Optional label shown in the header, for example `线上`. |

## 数据库位置 / Database Location

生产服务器建议把数据库放在项目目录之外：

```text
/home/ubuntu/red-packet-data/hongbao.db
```

这样更新代码、重新构建前端或清理项目目录时，不会误动线上数据。

The production database should live outside the git checkout:

```text
/home/ubuntu/red-packet-data/hongbao.db
```

## 备份与恢复 / Backup And Restore

创建数据库备份：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/backup_db.sh
```

从备份恢复：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/restore_db.sh /home/ubuntu/red-packet-backups/hongbao-YYYYMMDD-HHMMSS.db.gz
```

恢复脚本会先停止后端服务，给当前数据库再做一份临时备份，然后恢复指定文件并重启服务。

## 部署更新 / Deploy Updates

服务器上拉取最新代码并部署：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/deploy.sh
```

这个脚本会：

- 拉取 GitHub 最新代码
- 准备 `/home/ubuntu/red-packet-data`
- 安装后端依赖
- 构建前端
- 同步前端文件到 `/var/www/red-packet-app`
- 重启 FastAPI 服务并 reload Caddy

The deploy script pulls the latest code, prepares the data directory, installs backend dependencies, builds the frontend, syncs static files, restarts FastAPI, and reloads Caddy.

## 自动备份 / Automatic Backup

安装每日自动备份 timer：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/install_backup_timer.sh
```

默认每天服务器时间 `03:30` 备份一次。可以用下面的命令查看：

```bash
sudo systemctl list-timers red-packet-backup.timer --no-pager
sudo journalctl -u red-packet-backup.service -n 50 --no-pager
```

The timer creates a daily SQLite backup at `03:30` server time by default.

## systemd 示例 / systemd Example

线上后端服务需要设置数据库路径：

```ini
[Unit]
Description=Red Packet FastAPI
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/apps/red-packet-app/backend
Environment=RED_PACKET_DATABASE_PATH=/home/ubuntu/red-packet-data/hongbao.db
Environment=RED_PACKET_BACKUP_DIR=/home/ubuntu/red-packet-backups
Environment=RED_PACKET_TOKEN_SECRET=change-this-to-a-long-random-secret
ExecStart=/home/ubuntu/apps/red-packet-app/backend/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

修改后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart red-packet-api
```

## Caddy 示例 / Caddy Example

```caddyfile
daluandoubaoju.xyz, www.daluandoubaoju.xyz {
    root * /var/www/red-packet-app
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    try_files {path} /index.html
    file_server
}
```

Caddy 会自动申请和续期 HTTPS 证书。域名 DNS 指向服务器公网 IP 后，HTTPS 通常会自动生效。

Caddy automatically issues and renews HTTPS certificates once DNS points to the server.

## 安全说明 / Security Notes

- 不要提交 `.db`、`.json`、旧工具源码和真实密钥。
- GitHub token 泄露后必须 revoke，并重新生成新的 token。
- 线上应使用独立的 `RED_PACKET_TOKEN_SECRET`。
- 管理员账户应定期更换密码。
- 删除记录目前是软删除，管理员可在“已删除记录”中恢复。

- Do not commit databases, JSON data files, old local-tool source files, or secrets.
- Revoke exposed GitHub tokens immediately.
- Use a deployment-only `RED_PACKET_TOKEN_SECRET`.
- Rotate admin passwords when needed.
- Record deletion is soft deletion; admins can restore records from the recycle bin.

## 手动操作变少的方法 / Reducing Manual Server Edits

日常更新尽量使用：

```bash
cd /home/ubuntu/apps/red-packet-app
bash scripts/deploy.sh
```

配置文件以后也建议优先用脚本或整段命令生成，而不是在 `nano` 里手动编辑。需要改服务器配置时，可以先在本地项目里维护模板，再复制到服务器，这样不容易输错，也方便回滚。

For day-to-day updates, use `scripts/deploy.sh`. For server configuration, prefer templates or copy-paste commands over manual `nano` edits.
