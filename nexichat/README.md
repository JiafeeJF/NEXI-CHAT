# NEXI CHAT - 开源项目指引

## 项目简介
NEXI CHAT 是一个基于 Node.js 开发的多频道聊天应用，采用现代化的简约风格设计，支持实时消息传递、图片上传、语音消息等功能。

## 开源作者
- 作者：Jiafee
- 个人游戏博客（有兴趣看看）:https://hambg5.cn/gmbg/gameblog.html

## 技术栈
- **后端**：Node.js + Express + Socket.io
- **前端**：HTML5 + CSS3 + JavaScript (ES6+)
- **数据库**：JSON 文件存储（轻量级）
- **实时通信**：Socket.io
- **安全**：BCrypt 密码加密、JWT 认证
- **文件处理**：Multer + Sharp

## 功能特性
- ✅ 多频道实时聊天
- ✅ 支持文本消息、图片上传、语音消息
- ✅ 用户认证与授权
- ✅ 管理员控制面板
- ✅ 消息回复功能
- ✅ 消息撤回功能（2分钟内）
- ✅ 屏蔽词过滤
- ✅ 私聊频道（带密码保护）

## 快速开始

### 1. 环境要求
- Node.js 16.0 或更高版本
- npm 8.0 或更高版本

### 2. 安装依赖
```bash
# 安装所有依赖包
npm install
```

### 3. 配置项目

#### 创建环境变量文件（可选）
在项目根目录创建 `.env` 文件，配置以下参数：
```
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

#### 配置 SSL 证书
1. 在 `cert/` 目录下放置 SSL 证书文件（cert.crt）和私钥文件（cert.key）
2. 或运行 `generate-cert.js` 生成自签名证书：
```bash
node generate-cert.js
```

### 4. 启动项目

#### 启动主服务器（HTTPS）
```bash
npm start
```

#### 启动前端服务器（HTTP）
```bash
npm run frontend
```

#### 同时启动两个服务器
```bash
npm run start-all
```

### 5. 访问应用
- 后端：https://localhost:3000
- 前端应用：http://localhost:3001

## 使用说明

### 用户注册与登录
1. 访问登录页面：https://localhost:3001/login.html
2. 点击"注册"链接创建新账号
3. 使用创建的账号登录

### 管理员功能
1. 访问管理员登录：https://localhost:3001/admin-login.html
2. 使用管理员凭证登录（默认：admin/admin123）
3. 管理员可以管理用户、频道和查看日志

### 发送消息
1. 选择左侧频道
2. 在消息输入框中输入内容
3. 点击发送按钮或按 Enter 键发送

### 上传图片
1. 点击图片上传按钮
2. 选择要上传的图片文件
3. 等待上传完成后自动发送

### 发送语音消息
1. 按住麦克风按钮开始录制
2. 松开按钮结束录制并发送
3. 最长录制时间为 60 秒

## 项目结构
```
nexichat/
├── cert/                 # SSL 证书文件
├── public/               # 前端静态资源
│   ├── aud/              # 音频文件
│   ├── css/              # 样式文件
│   ├── images/           # 图片资源
│   ├── js/               # JavaScript 文件
│   ├── uploads/          # 上传文件存储
│   └── videos/           # 视频文件
├── server/               # 后端代码
│   ├── data/             # 数据库文件
│   ├── logs/             # 日志文件
│   ├── badwords.js       # 屏蔽词过滤
│   ├── db.js             # 数据库操作
│   └── log.js            # 日志系统
├── check-cert.js         # 证书检查工具
├── generate-cert.js      # 证书生成工具
├── frontend-server.js    # 前端服务器
├── package.json          # 项目配置
├── package-lock.json     # 依赖锁文件
├── server.js             # 主服务器
└── README.md             # 项目说明
```

## 安全注意事项
- 生产环境中请务必修改默认的 JWT 密钥
- 定期更新依赖包以修复安全漏洞
- 不要将敏感信息（如证书、密钥）提交到版本控制系统
- 使用 HTTPS 协议保护数据传输

## 更新日志

### beta v1.0.0
- ✨ 全新风格设计
- ✨ 支持语音消息功能
- ✨ 消息回复与撤回
- ✨ 管理员控制面板
- ✨ 改进的文件上传体验
- 🔒 增强的安全性能

###  alpha v1.0.0
- 🚀 初始版本发布
- ✅ 基础聊天功能
- ✅ 用户认证系统
- ✅ 文件上传支持
- ✅ 多频道管理

---

感谢您使用 NEXI CHAT！如果您喜欢这个项目，请继续支持作者！
