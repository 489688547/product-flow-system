#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动产品全周期协同系统（本地测试模式）..."
echo "启动后请在浏览器打开: http://127.0.0.1:8127"
echo "关闭这个窗口即停止服务。"
node server.mjs
