#!/bin/bash
# 停止 NEXI CHAT 后台服务（与 一键启动.bat 同目录）
ROOT="$(cd "$(dirname "$0")" && pwd)"
NEXICHAT="$ROOT/nexichat"
PID_FILE="$NEXICHAT/server/data/server.pid"
stopped=0

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    for _ in 1 2 3 4 5; do
      kill -0 "$PID" 2>/dev/null || { stopped=1; break; }
      sleep 1
    done
    [ $stopped -eq 0 ] && kill -9 "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo "已停止服务 (PID: $PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# 若 PID 文件不存在或进程已死，尝试按命令行匹配结束（仅限当前项目）
if pgrep -f "node.*$NEXICHAT/index.js" >/dev/null 2>&1; then
  pkill -f "node.*$NEXICHAT/index.js" 2>/dev/null && echo "已停止残留进程" || true
else
  echo "未发现运行中的 NEXI CHAT 服务"
fi
