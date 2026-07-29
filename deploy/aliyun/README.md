# 阿里云 ECS 运行手册

## 边界

- 应用只监听宿主机 `127.0.0.1:8080`，公网入口由现有 Nginx Proxy Manager
  提供。
- 两个 D1 binding 都落在 `/opt/product-flow/data` 的本地 SQLite。
- `runtime.env` 权限必须为 `600`，不得启用 `LOCAL_ONLINE_ACCOUNT_MODE`。
- OSS 只接收私有对象和一致性 SQL 备份，不承载在线数据库。

## 首次预发布

```bash
install -d -m 700 /opt/product-flow/config /opt/product-flow/data /opt/product-flow/backups
install -m 600 deploy/aliyun/runtime.env.example /opt/product-flow/config/runtime.env
chown -R 1000:1000 /opt/product-flow/data
docker network inspect nginx-proxy-manage_default
docker compose -f deploy/aliyun/docker-compose.yml config
docker compose -f deploy/aliyun/docker-compose.yml build
```

若中国大陆 ECS 无法拉取 Docker Hub 镜像，可从官方镜像安装 Node.js，并使用
加固后的原生 systemd unit：

```bash
chown root:pfs /opt/product-flow
chmod 750 /opt/product-flow
chown -R root:pfs /opt/product-flow/app
chmod -R g+rX /opt/product-flow/app
chown -R pfs:pfs /opt/product-flow/data
install -m 0644 deploy/aliyun/product-flow.service /etc/systemd/system/product-flow.service
systemctl daemon-reload
systemctl enable --now product-flow
```

原生服务仅监听 `127.0.0.1:8080`，以非特权 `pfs` 用户运行，内存上限为
768 MiB，应用唯一可写目录是 `/opt/product-flow/data`。

填入 `/opt/product-flow/config/runtime.env` 后，将已校验的 D1 导出目录上传到
服务器，再执行：

```bash
node scripts/aliyun/import-local-d1.mjs /opt/product-flow/import /opt/product-flow/data/wrangler
docker compose -f deploy/aliyun/docker-compose.yml up -d
curl -fsS http://127.0.0.1:8080/ >/dev/null
docker inspect --format '{{.State.Health.Status}}' product-flow-app
```

## 备份与回滚

```bash
node scripts/aliyun/backup-local-d1.mjs \
  /opt/product-flow/backups/$(date +%Y%m%d-%H%M%S) \
  /opt/product-flow/data/wrangler
```

若阿里云入口异常，停止 ECS 写入并恢复 Cloudflare DNS。两端一旦都产生新写入，
不得自动合并 SQLite 与 D1。
