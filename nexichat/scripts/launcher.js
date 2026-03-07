#!/usr/bin/env node
/**
 * NEXI CHAT 专业启动器
 * - 检查 Node 版本与依赖
 * - 启动后端与前端服务
 * - 就绪后自动打开浏览器
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const BACKEND_URL = 'https://localhost:3000';
const FRONTEND_URL = 'http://localhost:3001';

function log(tag, msg) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${t}] [${tag}] ${msg}`);
}

function checkNodeVersion() {
  const v = process.version.slice(1).split('.').map(Number);
  const major = v[0] || 0;
  if (major < 16) {
    console.error('错误: 需要 Node.js 16 或更高版本，当前为 ' + process.version);
    process.exit(1);
  }
}

function ensureDeps() {
  const nodeModules = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    log('启动器', '首次运行，正在安装依赖...');
    const r = spawn('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true
    });
    const code = r.status ?? (r.exitCode ?? 1);
    if (code !== 0) {
      console.error('依赖安装失败，请检查网络与 Node 环境。');
      process.exit(1);
    }
    log('启动器', '依赖安装完成。');
  }
}

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(start, [url], { shell: true, stdio: 'ignore' }).on('error', () => {});
}

function waitBackendReady(maxWaitMs = 15000) {
  return new Promise((resolve) => {
    const begin = Date.now();
    const opts = { hostname: 'localhost', port: 3000, path: '/', method: 'GET', rejectUnauthorized: false };
    function tryOnce() {
      if (Date.now() - begin > maxWaitMs) {
        resolve(false);
        return;
      }
      const req = https.request(opts, (res) => { resolve(true); });
      req.on('error', () => setTimeout(tryOnce, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(tryOnce, 500); });
      req.end();
    }
    tryOnce();
  });
}

function main() {
  process.chdir(ROOT);
  console.log('');
  console.log('  ============================================');
  console.log('    NEXI CHAT 专业启动包');
  console.log('  ============================================');
  console.log('');

  checkNodeVersion();
  ensureDeps();

  log('启动器', '正在启动后端服务 (HTTPS :3000) ...');
  const backend = spawn('node', ['index.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  backend.stdout.on('data', (d) => process.stdout.write('[后端] ' + d));
  backend.stderr.on('data', (d) => process.stderr.write('[后端] ' + d));
  backend.on('error', (err) => {
    log('启动器', '后端启动失败: ' + err.message);
    process.exit(1);
  });

  log('启动器', '正在启动前端服务 (HTTP :3001) ...');
  const frontend = spawn('node', ['frontend-server.js'], {
    cwd: path.join(ROOT, 'scripts'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  frontend.stdout.on('data', (d) => process.stdout.write('[前端] ' + d));
  frontend.stderr.on('data', (d) => process.stderr.write('[前端] ' + d));
  frontend.on('error', (err) => {
    log('启动器', '前端启动失败: ' + err.message);
    backend.kill();
    process.exit(1);
  });

  let browserOpened = false;
  waitBackendReady().then((ok) => {
    if (ok && !browserOpened) {
      browserOpened = true;
      log('启动器', '服务已就绪，正在打开浏览器...');
      openBrowser(FRONTEND_URL);
    }
  });

  console.log('');
  console.log('  后端: ' + BACKEND_URL);
  console.log('  前端: ' + FRONTEND_URL);
  console.log('  关闭本窗口或按 Ctrl+C 停止服务');
  console.log('');

  function shutdown() {
    if (backend.killed && frontend.killed) return;
    log('启动器', '正在停止服务...');
    backend.kill();
    frontend.kill();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
