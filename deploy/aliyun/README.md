# 阿里云 ECS 运行手册

## 边界

- 生产应用只监听宿主机 `127.0.0.1:8080`；按需测试 API 只监听
  `127.0.0.1:8081`，公网入口由现有 Nginx Proxy Manager 提供。
- 生产和测试的兼容 binding 分别落在 `/opt/product-flow/data` 与
  `/opt/product-flow-test/data` 的独立本地 SQLite，禁止交叉挂载。
- `runtime.env` 权限必须为 `600`，不得启用 `LOCAL_ONLINE_ACCOUNT_MODE`。
- 镜像构建阶段把 Pages Functions 编译为单一 bundle；容器请求路径只运行
  Node.js 24、Hono 和 SQLite Worker Thread，不启动 Wrangler、workerd 或 esbuild。
- 运行时从只读 `/run/pfs/runtime.env` 接收 Secret；不得把 Secret 复制进镜像。
- 镜像安装系统 CA，并通过 `SSL_CERT_FILE` 保证钉钉等 HTTPS Provider 的证书链
  可以在 ECS 容器内校验。
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
curl -fsS http://127.0.0.1:8080/healthz >/dev/null
docker inspect --format '{{.State.Health.Status}}' product-flow-app
```

测试 API 只在验收窗口按 profile 启动：

```bash
docker compose -f deploy/aliyun/docker-compose.yml --profile test up -d product-flow-test-api
curl -fsS http://127.0.0.1:8081/healthz >/dev/null
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

备份脚本直接使用 SQLite Online Backup API 生成可恢复的 `.sqlite` 快照，不依赖
应用容器运行时。每日 service 配置了私有 OSS 前缀：只有两个数据库校验并上传成功
后，才会删除本地旧目录并只保留当前一份；上传失败时本地历史完全保留。确认首次
上传和恢复校验成功后启用每日任务：

```bash
install -m 0644 deploy/aliyun/product-flow-backup.service /etc/systemd/system/
install -m 0644 deploy/aliyun/product-flow-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now product-flow-backup.timer
systemctl start product-flow-backup.service
systemctl status product-flow-backup.service --no-pager
```

## ACR 自动发布

自动发布每两个日历分钟检查固定 ACR `main`。相同镜像只记录 `no_change`，不会
备份或重启。新镜像先静态复制 Compose 文件并与主机合同比较，不执行候选代码；
随后要求私有 OSS 备份成功，才临时停止测试容器并替换生产。生产在 60 秒内不健康
会自动恢复 `product-flow-system:rollback`，测试容器无论成功失败都恢复原状态。

安装并验证 unit：

```bash
install -m 0644 deploy/aliyun/product-flow-rollout.service /etc/systemd/system/
install -m 0644 deploy/aliyun/product-flow-rollout.timer /etc/systemd/system/
systemctl daemon-reload
systemd-analyze verify product-flow-rollout.service product-flow-rollout.timer
systemctl start product-flow-backup.service
find /opt/product-flow/backups -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
systemctl start product-flow-rollout.service
journalctl -u product-flow-rollout.service -n 30 --no-pager
systemctl enable --now product-flow-rollout.timer
systemctl list-timers product-flow-rollout.timer --no-pager
```

首次手工 rollout 必须返回 `no_change`。常见安全错误为 `PULL_FAILED`、
`CONTRACT_MISMATCH`、`BACKUP_FAILED`、`START_FAILED`、`HEALTH_FAILED` 和
`ROLLBACK_FAILED`；除 `ROLLBACK_FAILED` 外都在替换前停止或自动回滚，最后一项
必须立即人工恢复。

暂停自动发布但保留当前生产：

```bash
systemctl disable --now product-flow-rollout.timer
docker inspect --format '{{.Name}} {{.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \
  product-flow-app product-flow-test-api
```

合同变化时先通过 GitOps 发布代码，再人工更新
`/opt/product-flow/app/deploy/aliyun/docker-compose.yml` 和发布脚本，重新执行 unit
校验与一次 `no_change` 检查后恢复 timer。不得用修改镜像标签绕过合同检查。

若阿里云入口异常，进入维护状态，停止写入，恢复上一个已验收镜像及匹配的
SQLite/OSS 快照。Cloudflare 不再作为生产 API 或数据库回滚入口。
