#!/bin/bash
# 把这台机器上的网页采集器切到专用浏览器模式，并核对它真的换成了新代码。
#
# 为什么需要这个脚本：抖音的新采集通道（罗盘首页接口 / 自助取数）只在 dedicated 模式下
# 生效，而绑定店铺的那台机器一直跑在 extension 模式的旧代码上。
#
# 改完之后必须逐项核对，不能只看进程起来了——实测踩过两次：
#   一次是 bootout 报了 "Input/output error" 但进程参数看着是对的，
#     实际注册状态已损坏，服务反复启动失败三天没人发现；
#   一次是在另一台机器上改代码、部署、验证，而真正在采集的是这一台。
#
# 因此每一步都回读确认，任何一步不对就停下来，不往下走。
#
# 用法：在**绑定了店铺的那台机器**上执行
#   bash scripts/switch-collector-to-dedicated.sh

set -euo pipefail

REPO=/Users/roger/Documents/product-flow-system
LABEL=com.company.web-data-collector
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
# 日志路径从 plist 里读回来，不写死。
# 它是 `<归档根目录>/处理报告/<label>.log`，而归档根目录是每台机器自己配的 --root，
# 猜一个路径的后果不是报错而是「读不到」——第 5 步的模式与指纹核对会全部落空，
# 那正好是这个脚本存在的理由。
LOG=""

say() { printf '\n=== %s ===\n' "$1"; }
die() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

say "0. 这台机器是谁"
echo "  主机名: $(hostname)"
echo "  抖音店铺绑定在哪台机器上，就必须在那台上执行。"
echo "  绑定的 runner 名字可以在数据同步页或 D1 的 web_collection_stores 里看到。"

say "1. 更新代码到 main"
cd "$REPO"
git checkout main
# 拉取失败就停在这里，不要拿旧代码去重启服务——这正是今天要避免的情形。
# （实测遇到过鉴权抖动，重试一次通常就好。）
git fetch origin main || die "拉取失败，没有更新到最新代码。重试一次；仍失败请检查网络与 git 凭据。"
git merge --ff-only origin/main || die "无法快进到 origin/main，本地可能有未提交的改动或分叉。"
echo "  当前提交: $(git log --oneline -1)"

for f in \
  scripts/web-data-collector/browser/providers/douyinHomepageApi.js \
  scripts/web-data-collector/browser/providers/douyinExtractApi.js
do
  [ -f "$f" ] || die "缺少 $f，代码没更新到位。"
done
echo "  新通道的文件都在。"

say "2. 算出期望的代码指纹"
EXPECTED=$(node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const files = ["orchestrator.mjs","browser/providers/douyin.mjs","browser/providers/douyinExtractApi.js","browser/providers/douyinHomepageApi.js"];
const h = createHash("sha256");
for (const f of files) { try { h.update(await readFile("scripts/web-data-collector/" + f)); } catch { h.update("missing:" + f); } }
process.stdout.write(h.digest("hex").slice(0, 12));
')
echo "  磁盘代码指纹: $EXPECTED"

say "3. 把浏览器模式改成 dedicated"
[ -f "$PLIST" ] || die "找不到 $PLIST，这台机器可能没装采集器。"
cp "$PLIST" "$PLIST.backup-$(date +%Y%m%d-%H%M%S)"
LOG=$(/usr/libexec/PlistBuddy -c "Print :StandardOutPath" "$PLIST" 2>/dev/null || true)
[ -n "$LOG" ] || die "plist 里没有 StandardOutPath，读不到日志就无法核对跑的是哪份代码。"
# 目录不在，launchd 连日志都写不出来，服务会起不来且没有任何线索。
[ -d "$(dirname "$LOG")" ] || die "日志目录 $(dirname "$LOG") 不存在，launchd 无法写日志。先建好这个目录再跑。"
echo "  日志文件: $LOG"
MODE=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$PLIST" | tr -d ' ' | grep -E '^(extension|dedicated)$' || true)
echo "  改之前: ${MODE:-未知}"
if [ "$MODE" = "dedicated" ]; then
  echo "  已经是 dedicated，跳过。"
else
  LINE=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$PLIST" | grep -n "extension" | head -1 | cut -d: -f1)
  [ -n "${LINE:-}" ] || die "plist 里找不到 --browser-mode 的取值，请手动确认。"
  # PlistBuddy 的数组下标从 0 开始，而 Print 的首行是 "Array {"
  IDX=$((LINE - 2))
  /usr/libexec/PlistBuddy -c "Set :ProgramArguments:$IDX dedicated" "$PLIST"
  AFTER=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments" "$PLIST" | tr -d ' ' | grep -E '^(extension|dedicated)$' || true)
  [ "$AFTER" = "dedicated" ] || die "改完之后读回来还是「$AFTER」，没有生效。"
  echo "  改之后: dedicated"
fi

say "4. 重启服务"
# 必须 bootout 再 bootstrap。kickstart 在注册状态已损坏时只会反复重试，
# 表现为「一直起不来但看不出原因」。
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 4
[ "$(launchctl list | grep -c "$LABEL" || true)" = "0" ] || die "注销没干净，请手动检查 launchctl list。"
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
sleep 20

say "5. 逐项核对（这一步最重要）"
STATUS=$(launchctl list | grep "$LABEL" || true)
[ -n "$STATUS" ] || die "服务没有注册成功。"
CODE=$(echo "$STATUS" | awk '{print $2}')
PID=$(echo "$STATUS" | awk '{print $1}')
echo "  launchctl: PID=$PID 上次退出码=$CODE"
[ "$CODE" = "0" ] || die "退出码是 $CODE（0 才正常）。78 通常是注册状态或权限问题。"
[ "$PID" != "-" ] || die "进程没跑起来（PID 显示为 -）。"

PORT_PID=$(lsof -nP -iTCP:17653 -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $2}' || true)
[ -n "${PORT_PID:-}" ] || die "端口 17653 没有监听，服务没真正起来。"
echo "  端口 17653: PID $PORT_PID"

ACTUAL=$(grep -o '"codeVersion": *"[a-f0-9]*"' "$LOG" 2>/dev/null | tail -1 | grep -o '[a-f0-9]\{12\}' || true)
RUNMODE=$(grep -o '"browserMode": *"[a-z]*"' "$LOG" 2>/dev/null | tail -1 | sed 's/.*"\([a-z]*\)"$/\1/' || true)
echo "  日志里的模式: ${RUNMODE:-读不到}"
echo "  日志里的指纹: ${ACTUAL:-读不到}"
[ "$RUNMODE" = "dedicated" ] || die "日志里的模式是「${RUNMODE:-读不到}」，不是 dedicated。"
[ "$ACTUAL" = "$EXPECTED" ] || die "指纹对不上：磁盘 $EXPECTED，运行中 ${ACTUAL:-读不到}。说明跑的不是这份代码。"

printf '\n✓ 切换完成：dedicated 模式，代码指纹 %s，与磁盘一致。\n' "$EXPECTED"
cat <<TIPS

接下来：
  1) 专用浏览器需要登录抖音。服务会自己把它拉起来，登录失效时会明确报 login_required。
  2) 只重采一条抖音任务来验证，不要批量重排——批量失败会让通知一条条弹。
  3) 看日志确认任务交给了谁：
       tail -f "$LOG" | grep routing
     出现「→ dedicated」才说明走上了新通道。
TIPS
