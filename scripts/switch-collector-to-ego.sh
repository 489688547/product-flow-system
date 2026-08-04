#!/bin/bash
# Safely switch the company collector to the formal Ego-only Douyin channel.
# The Aliyun target is checked before the LaunchAgent is changed.

set -euo pipefail

REPO=${EC_COLLECTOR_REPO:-/Users/roger/Desktop/EC-management-system}
LABEL=com.company.web-data-collector
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DEFAULT_EGO_CLI=/Users/roger/.local/bin/ego-browser
EGO_CLI=${EGO_BROWSER_CLI:-$DEFAULT_EGO_CLI}

say() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

plist_argument_after() {
  /usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$PLIST" \
    | awk -v target="$1" '$0 ~ "^[[:space:]]*" target "[[:space:]]*$" { getline; gsub(/^[[:space:]]+|[[:space:]]+$/, ""); print; exit }'
}

print_probe_command() {
  printf '\n备案或 HTTPS 尚未就绪时，只允许本地单任务探针：\n'
  printf '  %q %q probe-ego --ego-cli %q --store-id 90862283 --resource video_daily --business-date YYYY-MM-DD\n' \
    "$(command -v node)" "$REPO/scripts/web-data-collector/index.mjs" "$EGO_CLI"
}

say "0. 核对主检出与 Ego CLI"
[ -d "$REPO/.git" ] || die "主检出不存在：$REPO"
[ "$(git -C "$REPO" rev-parse --show-toplevel)" = "$REPO" ] || die "当前路径不是登记的主检出。"
[ -f "$REPO/scripts/web-data-collector/index.mjs" ] || die "主检出缺少采集器入口。"
case "$EGO_CLI" in /*) ;; *) die "Ego CLI 必须是绝对路径。" ;; esac
[ -x "$EGO_CLI" ] || die "Ego CLI 不存在或不可执行：$EGO_CLI"
REAL_EGO_CLI=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$EGO_CLI")
[ -f "$REAL_EGO_CLI" ] || die "Ego CLI 最终目标不是普通文件。"
case "$REAL_EGO_CLI" in "$REPO"/*|*/Downloads/*) die "Ego CLI 不得位于仓库或下载目录。" ;; esac
echo "  主检出: $REPO"
echo "  当前提交: $(git -C "$REPO" rev-parse --short HEAD)"
echo "  Ego CLI: $EGO_CLI"

say "1. 读取现有 LaunchAgent"
[ -f "$PLIST" ] || die "找不到 $PLIST，这台机器尚未安装采集器。"
ROOT=$(plist_argument_after --root)
BASE_URL=$(plist_argument_after --base-url)
MODE=$(plist_argument_after --browser-mode)
[ -n "$ROOT" ] || die "LaunchAgent 缺少 --root。"
[ -n "$BASE_URL" ] || die "LaunchAgent 缺少 --base-url。"
echo "  当前模式: ${MODE:-未知}"
echo "  当前目标: $BASE_URL"

say "2. 在修改前验证阿里云正式入口"
[ "$BASE_URL" = "https://deshan-tiyes.cn" ] || {
  print_probe_command
  die "正式 Ego 采集只允许登记的阿里云入口；plist 未修改。"
}
if ! curl -fsS --max-time 10 "$BASE_URL/" >/dev/null; then
  print_probe_command
  die "阿里云入口当前不可达（可能仍在等待 ICP/HTTPS）；plist 未修改。"
fi
echo "  阿里云入口可达。"

say "3. 计算本机代码指纹"
EXPECTED=$(cd "$REPO" && node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const files = ["orchestrator.mjs", "browser/ego-runtime.mjs", "browser/providers/douyin.mjs", "browser/providers/douyinEgoTask.mjs", "browser/providers/douyinEgoState.mjs", "browser/providers/douyinExtractApi.js", "browser/providers/douyinHomepageApi.js"];
const hash = createHash("sha256");
for (const file of files) { try { hash.update(await readFile(`scripts/web-data-collector/${file}`)); } catch { hash.update(`missing:${file}`); } }
process.stdout.write(hash.digest("hex").slice(0, 12));
')
echo "  磁盘代码指纹: $EXPECTED"

say "4. 原子安装 Ego LaunchAgent"
cp "$PLIST" "$PLIST.backup-$(date +%Y%m%d-%H%M%S)"
node "$REPO/scripts/web-data-collector/index.mjs" install \
  --root "$ROOT" \
  --base-url "$BASE_URL" \
  --browser-mode ego \
  --ego-cli "$EGO_CLI"

AFTER_MODE=$(plist_argument_after --browser-mode)
AFTER_EGO_CLI=$(plist_argument_after --ego-cli)
[ "$AFTER_MODE" = "ego" ] || die "安装后模式不是 ego。"
[ "$AFTER_EGO_CLI" = "$EGO_CLI" ] || die "安装后的 Ego CLI 与已验证路径不一致。"

say "5. 核对进程、loopback bridge 与日志"
sleep 10
STATUS=$(launchctl list | grep "$LABEL" || true)
[ -n "$STATUS" ] || die "服务没有注册成功。"
PID=$(echo "$STATUS" | awk '{print $1}')
EXIT_CODE=$(echo "$STATUS" | awk '{print $2}')
[ "$PID" != "-" ] || die "服务进程没有运行。"
[ "$EXIT_CODE" = "0" ] || die "服务上次退出码为 $EXIT_CODE。"
PORT_PID=$(lsof -nP -iTCP:17653 -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $2}' || true)
[ "$PORT_PID" = "$PID" ] || die "loopback bridge 未由当前采集器 PID 监听。"
LOG=$(/usr/libexec/PlistBuddy -c "Print :StandardOutPath" "$PLIST")
[ -f "$LOG" ] || die "采集器日志尚未生成：$LOG"
RUNMODE=$(grep -o '"browserMode": *"[a-z]*"' "$LOG" | tail -1 | sed 's/.*"\([a-z]*\)"$/\1/' || true)
ACTUAL=$(grep -o '"codeVersion": *"[a-f0-9]*"' "$LOG" | tail -1 | grep -o '[a-f0-9]\{12\}' || true)
[ "$RUNMODE" = "ego" ] || die "日志模式不是 ego。"
[ "$ACTUAL" = "$EXPECTED" ] || die "运行中代码指纹与磁盘不一致。"

printf '\n✓ Ego 服务已启动：PID=%s，代码指纹=%s。\n' "$PID" "$EXPECTED"
printf '只重采一条任务，并用以下命令确认出现 → ego：\n'
printf '  tail -f %q | grep routing\n' "$LOG"
