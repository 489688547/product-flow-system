#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动供应链货流测试环境..."
echo "页面地址：http://127.0.0.1:8161/#supply-overview"
npm run preview:goods-flow
