#!/bin/bash
# NEXI CHAT 服务器一键部署与启动（与 一键启动.bat 同目录）
# 支持：自动安装 Node.js、自动部署依赖、确保启动成功
#
# 用法:
#   ./一键部署启动.sh              # 前台启动
#   ./一键部署启动.sh --background # 后台启动
#   ./一键部署启动.sh --install    # 仅安装依赖
#   ./一键部署启动.sh --port 8080  # 指定端口
#
# 停止后台: ./停止.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
NEXICHAT="$ROOT/nexichat"
PID_FILE="$NEXICHAT/server/data/server.pid"
NODE_MIN_MAJOR=18

if [ ! -f "$NEXICHAT/package.json" ]; then
  echo "错误: 未找到 nexichat/package.json，请将本脚本放在项目根目录（与 一键启动.bat 同级）"
  exit 1
fi

# 默认参数
MODE="start"
PORT="${PORT:-3000}"
BACKGROUND=false
while [ $# -gt 0 ]; do
  case "$1" in
    --install)    MODE="install"; shift ;;
    --background) BACKGROUND=true; shift ;;
    --port)       PORT="${2:-3000}"; shift 2 ;;
    *)           echo "未知参数: $1"; exit 1 ;;
  esac
done

echo ""
echo "  ============================================="
echo "    NEXI CHAT 一键部署 / 启动"
echo "  ============================================="
echo "  项目目录: $ROOT"
echo "  应用目录: $NEXICHAT"
echo ""

# ---------- 自动安装 Node.js ----------
need_node_install=false
if ! command -v node &>/dev/null; then
  need_node_install=true
  echo "[Node] 未检测到 Node.js，将自动安装 LTS 版本..."
else
  NODE_VER=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
  if [ "$NODE_VER" -lt "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    need_node_install=true
    echo "[Node] 当前 Node.js 版本过低 ($(node -v))，将自动安装 $NODE_MIN_MAJOR+ ..."
  else
    echo "[OK] Node.js $(node -v)"
  fi
fi

if [ "$need_node_install" = true ]; then
  if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
    if ! command -v sudo &>/dev/null; then
      echo "错误: 需要 root 或 sudo 权限以安装 Node.js，请先安装 Node.js $NODE_MIN_MAJOR+ (https://nodejs.org)"
      exit 1
    fi
  else
    SUDO=""
  fi

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian|raspbian)
        echo "[Node] 使用 NodeSource 安装 (Debian/Ubuntu)..."
        export DEBIAN_FRONTEND=noninteractive
        $SUDO apt-get update -qq
        $SUDO apt-get install -y -qq curl ca-certificates
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO apt-get install -y -qq nodejs
        ;;
      centos|rhel|fedora|rocky|almalinux)
        echo "[Node] 使用 NodeSource 安装 (RHEL/CentOS)..."
        $SUDO yum install -y -q curl 2>/dev/null || $SUDO dnf install -y -q curl
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO yum install -y -q nodejs 2>/dev/null || $SUDO dnf install -y -q nodejs
        ;;
      alpine)
        echo "[Node] 使用 apk 安装 (Alpine)..."
        $SUDO apk add --no-cache nodejs npm
        ;;
      *)
        echo "[Node] 尝试使用系统包管理器安装..."
        $SUDO apt-get update -qq 2>/dev/null && $SUDO apt-get install -y -qq nodejs npm 2>/dev/null || \
        $SUDO yum install -y -q nodejs npm 2>/dev/null || $SUDO dnf install -y -q nodejs npm 2>/dev/null || \
        $SUDO apk add --no-cache nodejs npm 2>/dev/null || true
        ;;
    esac
  else
    $SUDO apt-get update -qq 2>/dev/null && $SUDO apt-get install -y -qq nodejs npm 2>/dev/null || \
    $SUDO yum install -y -q nodejs npm 2>/dev/null || true
  fi

  if ! command -v node &>/dev/null; then
    echo "错误: 自动安装 Node.js 失败，请手动安装 Node.js $NODE_MIN_MAJOR+ (https://nodejs.org)"
    exit 1
  fi
  NODE_VER=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
  if [ "$NODE_VER" -lt "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    echo "错误: 安装后版本仍不足 $NODE_MIN_MAJOR，当前: $(node -v)"
    exit 1
  fi
  echo "[OK] Node.js 已安装: $(node -v)"
fi

cd "$NEXICHAT"

# ---------- 自动部署依赖（带重试）----------
if [ ! -d "node_modules" ] || [ "$MODE" = "install" ]; then
  echo "[部署] 正在安装依赖..."
  NPM_ATTEMPTS=0
  NPM_MAX=3
  while [ $NPM_ATTEMPTS -lt $NPM_MAX ]; do
    if npm install --prefer-offline --no-audit --no-fund --loglevel=error; then
      echo "[OK] 依赖安装完成"
      break
    fi
    NPM_ATTEMPTS=$((NPM_ATTEMPTS + 1))
    echo "[部署] 第 $NPM_ATTEMPTS 次安装失败，重试中... ($NPM_ATTEMPTS/$NPM_MAX)"
    sleep 3
  done
  if [ $NPM_ATTEMPTS -eq $NPM_MAX ]; then
    echo "错误: 依赖安装失败 $NPM_MAX 次，请检查网络后重试"
    exit 1
  fi
  if [ "$MODE" = "install" ]; then
    echo "仅安装模式结束。启动请执行: ./一键部署启动.sh"
    exit 0
  fi
fi

# ---------- 目录与端口 ----------
mkdir -p server/data server/logs

# 若为后台启动且端口被占用，先尝试停止旧进程（本应用）
if [ "$BACKGROUND" = true ] && [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[启动] 检测到已在运行 (PID: $OLD_PID)，先停止..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
    rm -f "$PID_FILE"
  fi
fi

# 检查端口是否被占用（非本应用）
if command -v ss &>/dev/null; then
  INUSE=$(ss -tlnp 2>/dev/null | awk -v p=":$PORT " '$4 == p { print 1 }')
elif command -v netstat &>/dev/null; then
  INUSE=$(netstat -tlnp 2>/dev/null | awk -v p=":$PORT " '$4 == p { print 1 }')
else
  INUSE=""
fi
if [ -n "$INUSE" ]; then
  echo "错误: 端口 $PORT 已被占用，请更换端口: ./一键部署启动.sh --port 其他端口"
  exit 1
fi

export PORT
export SERVE_FRONTEND=1

# ---------- 启动 ----------
if [ "$BACKGROUND" = true ]; then
  LOG_FILE="$NEXICHAT/server/logs/server.log"
  echo "[启动] 后台运行，端口 $PORT，日志: $LOG_FILE"
  nohup node index.js >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 2
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "错误: 进程启动后退出，请查看: $LOG_FILE"
    tail -20 "$LOG_FILE" 2>/dev/null
    exit 1
  fi
  # 等待 HTTP 可访问
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q '200\|301\|302\|404'; then
      echo "[OK] 服务已启动并监听 (PID: $(cat "$PID_FILE"))"
      echo "     访问: http://$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo 'localhost'):$PORT"
      echo "     停止: ./停止.sh"
      exit 0
    fi
    sleep 1
  done
  echo "[OK] 进程已运行 (PID: $(cat "$PID_FILE"))，端口 $PORT 可能仍在初始化"
  echo "     访问: http://$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo 'localhost'):$PORT"
  echo "     停止: ./停止.sh"
else
  echo "[启动] 前台运行，端口 $PORT，按 Ctrl+C 停止"
  echo "     访问: http://localhost:$PORT"
  echo ""
  exec node index.js
fi
