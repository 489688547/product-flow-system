# 阿里云 ECS 运行手册

## 边界

- 生产应用只监听宿主机 `127.0.0.1:8080`；按需测试 API 只监听
  `127.0.0.1:8081`，公网入口由现有 Nginx Proxy Manager 提供。
- 生产和测试的兼容 binding 分别落在 `/opt/product-flow/data` 与
  `/opt/product-flow-test/data` 的独立本地 SQLite，禁止交叉挂载。
- `runtime.env` 权限必须为 `600`，不得启用 `LOCAL_ONLINE_ACCOUNT_MODE`。
- 启动脚本只在受限运行目录创建 `.dev.vars` 符号链接，使 Pages Functions
  能从只读的 `/run/pfs/runtime.env` 读取 binding；不得把 Secret 复制进镜像。
- 镜像安装系统 CA，并通过 `SSL_CERT_FILE` 提供给 workerd，保证钉钉等 HTTPS
  Provider 的证书链可以在 ECS 容器内校验。
- OSS 只接收私有对象和 SQLite 一致性快照，不承载在线数据库。

## 首次预发布

```bash
install -d -m 700 /opt/product-flow/config /opt/product-flow/data /opt/product-flow/backups
install -d -m 700 /opt/product-flow-test/config /opt/product-flow-test/data
install -m 600 deploy/aliyun/runtime.env.example /opt/product-flow/config/runtime.env
install -m 600 deploy/aliyun/test-runtime.env.example /opt/product-flow-test/config/runtime.env
chown -R 1000:1000 /opt/product-flow/data
chown -R 1000:1000 /opt/product-flow-test/data
chown 1000:1000 /opt/product-flow/config/runtime.env
chown 1000:1000 /opt/product-flow-test/config/runtime.env
chmod 600 /opt/product-flow/config/runtime.env
chmod 600 /opt/product-flow-test/config/runtime.env
docker network inspect nginx-proxy-manage_default
docker compose -f deploy/aliyun/docker-compose.yml config
PFS_BUILD_COMMIT="$(git rev-parse HEAD)" \
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

测试 API 只在验收窗口按 profile 启动：

```bash
docker compose -f deploy/aliyun/docker-compose.yml --profile test up -d product-flow-test-api
curl -fsS http://127.0.0.1:8081/api/auth/session >/dev/null || test "$?" = 22
docker inspect --format '{{.State.Health.Status}}' product-flow-test-api
```

## 容器健康恢复

Docker 的 `unless-stopped` 不会因为 healthcheck 变成 `unhealthy` 自动重启。安装
受限恢复定时器：连续两次异常才重启，15 分钟内最多一次，一小时三次失败后停止
自动恢复并保留 JSON 审计。

```bash
install -d -m 700 /opt/product-flow/health-recovery
install -m 0644 deploy/aliyun/product-flow-health-recovery.service /etc/systemd/system/
install -m 0644 deploy/aliyun/product-flow-health-recovery.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now product-flow-health-recovery.timer
systemctl start product-flow-health-recovery.service
journalctl -u product-flow-health-recovery.service -n 20 --no-pager
```

## 域名代理预配置

`deshan-tiyes.cn` 已完成 ICP、HTTPS 和钉钉真实登录验收。测试 API 另用
`api-test.deshan-tiyes.cn`，不得代理到生产容器：

```bash
install -m 0644 \
  deploy/aliyun/nginx-proxy-manager/deshan-tiyes.cn.conf \
  /clouddream/nginx-proxy-manage/data/nginx/proxy_host/99-product-flow.conf
install -m 0644 \
  deploy/aliyun/nginx-proxy-manager/api-test.deshan-tiyes.cn.conf \
  /clouddream/nginx-proxy-manage/data/nginx/proxy_host/98-product-flow-test-api.conf
docker exec nginx-app nginx -t
docker exec nginx-app s6-svc -h /var/run/s6/services/nginx
curl -fsS -H 'Host: deshan-tiyes.cn' \
  http://127.0.0.1/ >/dev/null
```

该 Nginx Proxy Manager 镜像由 s6 管理 Nginx，未写入
`/var/run/nginx.pid`，因此必须用 `s6-svc -h` 热加载，不能使用
`nginx -s reload`。

公网安全组只开放 80/443；Nginx Proxy Manager 管理端口不得向
`0.0.0.0/0` 开放。两个域名都必须启用 HTTPS，测试 API 的 CORS 只允许
`https://test.deshan-tiyes.cn`。

## 备份与回滚

先为 ECS 绑定只允许访问目标备份前缀的实例 RAM 角色，再安装并校验
`ossutil 2.3.0`。`/root/.ossutilconfig` 只声明实例角色、杭州地域和内网
Endpoint，不保存 AccessKey：

```ini
[default]
mode = Ali-EcsRamRole
region = cn-hangzhou
endpoint = oss-cn-hangzhou-internal.aliyuncs.com
```

手工执行一次备份并检查生成的 SHA-256 清单：

```bash
node scripts/aliyun/backup-local-d1.mjs \
  /opt/product-flow/backups/$(date +%Y%m%d-%H%M%S) \
  /opt/product-flow/data/wrangler
```

备份脚本直接使用 SQLite Online Backup API 生成可恢复的 `.sqlite` 快照，不调用
宿主机不兼容的 Wrangler/workerd。确认首次上传和恢复校验成功后启用每日任务：

```bash
install -m 0644 deploy/aliyun/product-flow-backup.service /etc/systemd/system/
install -m 0644 deploy/aliyun/product-flow-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now product-flow-backup.timer
systemctl start product-flow-backup.service
systemctl status product-flow-backup.service --no-pager
```

若阿里云入口异常，进入维护状态，停止写入，恢复上一个已验收镜像及匹配的
SQLite/OSS 快照。Cloudflare 不再作为生产 API 或数据库回滚入口。
