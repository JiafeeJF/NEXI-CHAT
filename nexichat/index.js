const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
let sharp = null;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('[WARN] sharp 未安装或不可用，将禁用图片处理相关功能（头像/图片压缩）。');
}
const fs = require('fs');
const db = require('./server/db');
const oldDmPath = path.join(__dirname, 'server', 'data', 'dm_messages.json');
if (fs.existsSync(oldDmPath)) {
    db.resetAllMessages();
}
const logger = require('./server/log');
const badWordsFilter = require('./server/badwords');
const DEFAULT_AVATAR = 'images/default.png';
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const CHANNELS = ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel6'];
const REGISTRATION_ENABLED = true;
const VERSION = 'beta v2.2.0';

const { validateUsername, validatePassword, validateFriendReason, validateDeactivationReason } = require('./server/validation');

const ADMIN_CREDENTIALS_FILE = path.join(__dirname, 'server', 'data', 'admin_credentials.json');

function loadAdminCredentials() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    try {
        const dataDir = path.join(__dirname, 'server', 'data');
        if (fs.existsSync(ADMIN_CREDENTIALS_FILE)) {
            const raw = fs.readFileSync(ADMIN_CREDENTIALS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            const loadedPassword = parsed.password != null ? String(parsed.password).trim() : password;
            const loadedUsername = parsed.username != null ? String(parsed.username).trim() : username;
            return {
                username: loadedUsername || username,
                password: loadedPassword || password
            };
        }
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const initial = { username, password };
        fs.writeFileSync(ADMIN_CREDENTIALS_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    } catch (e) {
        console.warn('[WARN] loadAdminCredentials failed, using env/default:', e.message);
        return { username, password };
    }
}

function saveAdminCredentials() {
    try {
        const dataDir = path.join(__dirname, 'server', 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(ADMIN_CREDENTIALS_FILE, JSON.stringify({
            username: ADMIN_CREDENTIALS.username,
            password: ADMIN_CREDENTIALS.password
        }, null, 2), 'utf8');
    } catch (e) {
        console.error('[ERROR] saveAdminCredentials failed:', e);
    }
}

const ADMIN_CREDENTIALS = loadAdminCredentials();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb', parameterLimit: 1000000 }));
const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        next();
        return;
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.getUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ error: '用户不存在或已被删除', code: 'user_deleted' });
        }
        req.userId = decoded.userId;
        next();
    } catch (error) {
        next();
    }
};

function requireUser(req, res, next) {
    const uid = req.userId ?? req.body?.userId ?? req.query?.userId;
    const parsed = parseInt(uid);
    if (!parsed) return res.status(401).json({ error: 'Authorization required' });
    req.userId = parsed;
    next();
}

const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin token required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.admin) {
            next();
        } else {
            res.status(403).json({ error: 'Not authorized as admin' });
        }
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
console.log('Connected to JavaScript data storage.');
const defaultAvatarPath = path.join(__dirname, 'public', 'images', 'default.png');
if (!fs.existsSync(defaultAvatarPath)) {
    if (sharp) {
        sharp({
            create: {
                width: 100,
                height: 100,
                channels: 4,
                background: { r: 150, g: 150, b: 150, alpha: 1 }
            }
        })
            .png()
            .toFile(defaultAvatarPath, (err) => {
                if (err) console.error('Error creating default avatar:', err);
            });
    }
}
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
}

function deleteRecallAttachment(relativeUrl) {
    if (!relativeUrl || typeof relativeUrl !== 'string') return;
    const trimmed = relativeUrl.trim();
    if (!trimmed.startsWith('uploads/') || trimmed.includes('..')) return;
    const filePath = path.join(__dirname, 'public', trimmed);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Recall: deleted attachment', trimmed);
        }
    } catch (err) {
        console.error('Recall: failed to delete attachment', trimmed, err.message);
    }
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage
});

app.get('/api/registration-status', (req, res) => {
    res.json({ enabled: REGISTRATION_ENABLED });
});

app.get('/api/version', (req, res) => {
    res.json({ version: VERSION });
});

app.post('/api/channel/verify-password', (req, res) => {
    const { channel, password, userId } = req.body;

    if (!db.channels[channel]) {
        return res.status(400).json({ error: 'Not a private channel' });
    }

    if (db.channels[channel].password === password) {
        if (!db.channels[channel].members.includes(userId)) {
            db.channels[channel].members.push(userId);
            db.saveData();
        }
        return res.json({ success: true, message: 'Password verified successfully' });
    } else {
        return res.status(401).json({ error: 'Invalid password' });
    }
});

app.get('/api/channel/:channel/access/:userId', (req, res) => {
    const { channel, userId } = req.params;

    if (!db.channels[channel]) {
        return res.json({ hasAccess: true });
    }
    const hasAccess = db.channels[channel].members.includes(parseInt(userId));
    return res.json({ hasAccess });
});
app.post('/api/register', async (req, res) => {
    if (!REGISTRATION_ENABLED) {
        return res.status(403).json({ error: '注册功能已关闭' });
    }

    const { username, password, email, nickname } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '请填写用户名和密码' });
    }

    const userCheck = validateUsername(username);
    if (!userCheck.ok) return res.status(400).json({ error: userCheck.error });
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) return res.status(400).json({ error: passwordCheck.error });

    try {
        if (db.getUserByUsername(userCheck.value)) {
            return res.status(400).json({ error: '用户名已被使用' });
        }

        if (email && db.getUserByEmail(email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = db.insertUser({
            username: userCheck.value,
            password: hashedPassword,
            email,
            nickname
        });

        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        logger.auditLog('user_register', newUser.id, { username: newUser.username });

        res.status(201).json({
            token,
            userId: newUser.id,
            username: newUser.username,
            nickname: newUser.nickname
        });

    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const user = db.getUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.banned) return res.status(403).json({ error: '账号已被封禁', code: 'banned' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        logger.auditLog('user_login', user.id, { username: user.username });
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({
            token,
            userId: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar,
            bio: user.bio,
            gender: user.gender
        });

    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, admin: true });
    } else {
        res.status(401).json({ error: 'Invalid admin credentials' });
    }
});

app.put('/api/admin/password', authenticateAdmin, (req, res) => {
    const rawCurrent = req.body.currentPassword;
    const rawNew = req.body.newPassword;
    const currentPassword = typeof rawCurrent === 'string' ? rawCurrent.trim() : '';
    const newPassword = typeof rawNew === 'string' ? rawNew.trim() : '';

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const storedPassword = ADMIN_CREDENTIALS.password != null ? String(ADMIN_CREDENTIALS.password).trim() : '';
    if (currentPassword !== storedPassword) {
        return res.status(401).json({
            error: 'Current password is incorrect',
            hint: '若您曾在旧版本中修改过密码且服务已重启，请使用 .env 中的 ADMIN_PASSWORD（或默认 admin123）作为当前密码重试。'
        });
    }

    ADMIN_CREDENTIALS.password = newPassword;
    saveAdminCredentials();
    res.json({ success: true, message: 'Admin password updated successfully' });
});

app.post('/api/admin/reset-messages', authenticateAdmin, (req, res) => {
    db.resetAllMessages();
    res.json({ success: true, message: 'All channel and DM messages have been reset' });
});

app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    const list = (db.getUsers ? db.getUsers() : (db.users || [])).map(u => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        email: u.email || null,
        banned: !!u.banned,
        created_at: u.created_at || null
    }));
    res.json(list);
});

app.put('/api/admin/users/:userId/ban', authenticateAdmin, (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === ADMIN_CREDENTIALS.username) return res.status(403).json({ error: '不能封禁管理员账号' });
    const updated = db.updateUser(userId, { banned: true });
    if (!updated) return res.status(500).json({ error: 'Failed to update' });
    io.to(`user:${userId}`).emit('userBanned');
    res.json({ success: true, message: '用户已封禁', user: { id: updated.id, username: updated.username, banned: true } });
});

app.put('/api/admin/users/:userId/unban', authenticateAdmin, (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = db.updateUser(userId, { banned: false });
    if (!updated) return res.status(500).json({ error: 'Failed to update' });
    io.to(`user:${userId}`).emit('userUnbanned');
    res.json({ success: true, message: '用户已解封', user: { id: updated.id, username: updated.username, banned: false } });
});

app.delete('/api/admin/users/:userId', authenticateAdmin, (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === ADMIN_CREDENTIALS.username) return res.status(403).json({ error: '不能删除管理员账号' });
    const ok = db.deleteUser(userId);
    if (!ok) return res.status(500).json({ error: 'Failed to delete' });
    io.to(`user:${userId}`).emit('userDeleted');
    res.json({ success: true, message: '用户已删除' });
});

app.post('/api/account/deactivation-request', authenticateUser, requireUser, (req, res) => {
    try {
        const { reason } = req.body || {};
        const v = validateDeactivationReason(reason);
        if (!v.ok) return res.status(400).json({ error: v.error });
        if (typeof db.addDeactivationRequest !== 'function') return res.status(503).json({ error: '服务未就绪，请重启后端服务后重试' });
        const result = db.addDeactivationRequest(req.userId, v.value);
        if (result && result.locked === true) {
            const until = result.lock_until ? new Date(result.lock_until).toLocaleString('zh-CN') : '24 小时后';
            return res.status(429).json({ error: '您今日申请次数已用尽，请 24 小时后再试', lock_until: result.lock_until });
        }
        if (!result) return res.status(400).json({ error: '您已提交过注销申请，请等待审核' });
        io.to('admin').emit('deactivationRequestNew', { request: result });
        res.status(201).json({ success: true, message: '注销申请已提交', request: result });
    } catch (err) {
        console.error('[deactivation] POST request error:', err);
        res.status(500).json({ error: err.message || '提交注销申请失败' });
    }
});

app.get('/api/account/deactivation-request', authenticateUser, requireUser, (req, res) => {
    try {
        if (typeof db.getDeactivationRequestByUserId !== 'function') return res.status(503).json({ error: '服务未就绪，请重启后端服务后重试' });
        const request = db.getDeactivationRequestByUserId(req.userId);
        let lock_until = null;
        if (typeof db.getDeactivationLock === 'function') lock_until = db.getDeactivationLock(req.userId);
        res.json({ request: request || null, lock_until });
    } catch (err) {
        console.error('[deactivation] GET request error:', err);
        res.status(500).json({ error: err.message || '获取申请状态失败' });
    }
});

app.get('/api/admin/deactivation-requests', authenticateAdmin, (req, res) => {
    try {
        if (typeof db.getDeactivationRequests !== 'function') return res.status(503).json({ error: '服务未就绪，请重启后端服务后重试' });
        const list = db.getDeactivationRequests().map(r => {
            const user = db.getUserById(r.user_id);
            return {
                id: r.id,
                user_id: r.user_id,
                username: user ? user.username : null,
                nickname: user ? (user.nickname || user.username) : null,
                reason: r.reason,
                status: r.status,
                created_at: r.created_at,
                updated_at: r.updated_at || null
            };
        });
        res.json({ requests: list });
    } catch (err) {
        console.error('[deactivation] GET admin list error:', err);
        res.status(500).json({ error: err.message || '获取注销申请列表失败' });
    }
});

app.put('/api/admin/deactivation-requests/:id', authenticateAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { action } = req.body || {};
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action 必须为 approve 或 reject' });
        if (typeof db.getDeactivationRequestById !== 'function') return res.status(503).json({ error: '服务未就绪，请重启后端服务后重试' });
        const request = db.getDeactivationRequestById(id);
        if (!request) return res.status(404).json({ error: '申请不存在' });
        if (request.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });
        db.updateDeactivationRequestStatus(id, action === 'approve' ? 'approved' : 'rejected');
        const status = action === 'approve' ? 'approved' : 'rejected';
        const userId = request.user_id;
        io.to(`user:${userId}`).emit('deactivationRequestUpdated', { requestId: id, status });
        io.to('admin').emit('deactivationRequestUpdated', { requestId: id, status });
        if (action === 'approve') {
            const user = db.getUserById(userId);
            if (user && user.username !== ADMIN_CREDENTIALS.username) {
                db.deleteUser(userId);
                io.to(`user:${userId}`).emit('userDeleted');
            }
        }
        res.json({ success: true, message: action === 'approve' ? '已通过并注销该用户' : '已拒绝' });
    } catch (err) {
        console.error('[deactivation] PUT admin error:', err);
        res.status(500).json({ error: err.message || '操作失败' });
    }
});

app.get('/api/channel/:channel/members', authenticateAdmin, (req, res) => {
    const { channel } = req.params;
    if (!db.channels[channel]) {
        return res.status(400).json({ error: 'Not a private channel' });
    }
    const members = db.channels[channel].members.map(userId => {
        const user = db.getUserById(userId);
        return user ? { id: user.id, username: user.username } : null;
    }).filter(member => member !== null);

    res.json(members);
});

app.delete('/api/channel/:channel/members/:userId', authenticateAdmin, (req, res) => {
    const { channel, userId } = req.params;
    const parsedUserId = parseInt(userId);

    if (!db.channels[channel]) {
        return res.status(400).json({ error: 'Not a private channel' });
    }
    const memberIndex = db.channels[channel].members.indexOf(parsedUserId);
    if (memberIndex !== -1) {
        db.channels[channel].members.splice(memberIndex, 1);
        db.saveData();
        res.json({ success: true, message: 'User removed from channel' });
    } else {
        res.status(404).json({ error: 'User not found in channel' });
    }
});

app.put('/api/channel/:channel/password', authenticateAdmin, (req, res) => {
    const { channel } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
    }

    if (!db.channels[channel]) {
        return res.status(400).json({ error: 'Not a private channel' });
    }

    db.channels[channel].password = newPassword;
    db.saveData();
    res.json({ success: true, message: 'Channel password updated successfully' });
});
app.get('/api/profile/:userId', (req, res) => {
    const { userId } = req.params;
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userProfile = {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar,
        bio: user.bio,
        gender: user.gender,
        email: user.email,
        created_at: user.created_at,
        allow_add_friend_from_profile: user.allow_add_friend_from_profile === true || user.allow_add_friend_from_profile === 'true'
    };
    res.json(userProfile);
});

app.put('/api/profile/:userId', authenticateUser, requireUser, (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (userId !== parseInt(req.userId, 10)) return res.status(403).json({ error: '只能修改自己的资料' });
    const { bio, gender, email, nickname, allow_add_friend_from_profile } = req.body;
    if (email !== undefined && email !== null && email !== '') {
        const existingUser = db.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
            return res.status(400).json({ error: 'Email already exists' });
        }
    }
    const updates = {};
    if (bio !== undefined) updates.bio = bio;
    if (gender !== undefined) updates.gender = gender;
    if (email !== undefined) updates.email = email;
    if (nickname !== undefined) updates.nickname = nickname;
    if (allow_add_friend_from_profile !== undefined) {
        const v = allow_add_friend_from_profile;
        updates.allow_add_friend_from_profile = v === true || v === 'true';
    }
    if (Object.keys(updates).length === 0) return res.json({ success: true });
    const updatedUser = db.updateUser(userId, updates);
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
});
app.post('/api/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.ok) {
        return res.status(400).json({ error: passwordCheck.error, success: false });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const user = db.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            return res.status(401).json({ error: '当前密码错误', success: false });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updatedUser = db.updateUser(userId, { password: hashedPassword });
        if (!updatedUser) {
            return res.status(500).json({ error: 'Failed to update password', success: false });
        }

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token', success: false });
        }
        res.status(500).json({ error: 'Server error', success: false });
    }
});

app.post('/api/upload/avatar', upload.single('avatar'), async (req, res) => {
    const { userId } = req.body;

    if (!req.file || !userId) {
        return res.status(400).json({ error: 'File and user ID are required' });
    }

    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    if (!allowedExt.includes(originalExt)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '仅支持 JPG、PNG、GIF、WebP 格式' });
    }

    try {
        let avatarUrl;

        if (sharp) {
            const isGif = originalExt === '.gif';
            const optimizedPath = path.join(__dirname, 'public', 'uploads', 'optimized-' + req.file.filename);
            const sharpInstance = sharp(req.file.path)
                .resize(200, 200, { fit: 'cover' });

            if (isGif) {
                await sharpInstance.toFile(optimizedPath);
            } else {
                await sharpInstance
                    .png({ quality: 80 })
                    .toFile(optimizedPath);
            }
            fs.unlinkSync(req.file.path);
            avatarUrl = 'uploads/optimized-' + req.file.filename;
        } else {
            const safeName = 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + originalExt;
            const destPath = path.join(__dirname, 'public', 'uploads', safeName);
            fs.renameSync(req.file.path, destPath);
            avatarUrl = 'uploads/' + safeName;
        }

        const updatedUser = db.updateUser(userId, { avatar: avatarUrl });
        if (!updatedUser) return res.status(404).json({ error: 'User not found' });

        res.json({ success: true, avatar: avatarUrl });
    } catch (error) {
        console.error('Avatar upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }
        res.status(500).json({ error: error.message || 'Image processing error' });
    }
});

app.post('/api/upload/image', upload.single('image'), async (req, res) => {
    if (!req.file) {
        console.error('Upload failed: No file provided');
        return res.status(400).json({ error: 'File is required' });
    }

    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    if (!allowedExt.includes(originalExt)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '仅支持 JPG、PNG、GIF、WebP 格式' });
    }

    try {
        let imageUrl;

        if (sharp) {
            const isGif = originalExt === '.gif';
            const optimizedPath = path.join(__dirname, 'public', 'uploads', 'chat-' + req.file.filename);
            const sharpInstance = sharp(req.file.path)
                .resize(600, 450, { fit: 'inside' });

            if (isGif) {
                await sharpInstance.gif().toFile(optimizedPath);
            } else {
                await sharpInstance.png({ quality: 85 }).toFile(optimizedPath);
            }
            fs.unlinkSync(req.file.path);
            imageUrl = 'uploads/chat-' + req.file.filename;
        } else {
            const safeName = 'chat-' + req.file.filename;
            const destPath = path.join(__dirname, 'public', 'uploads', safeName);
            fs.renameSync(req.file.path, destPath);
            imageUrl = 'uploads/' + safeName;
        }

        res.json({ success: true, image: imageUrl });
    } catch (error) {
        console.error('Upload failed:', error);
        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File size exceeds limit (10MB)' });
        } else {
            res.status(500).json({ error: 'Image processing error' });
        }
    }
});

app.get('/api/admin/logs/list', authenticateAdmin, (req, res) => {
    const fs = require('fs');
    const path = require('path');

    const logDir = path.join(__dirname, 'server', 'logs');

    try {
        const files = fs.readdirSync(logDir);

        const logFiles = files.filter(file => file.match(/\.(log)$/))
            .map(file => {
                const stats = fs.statSync(path.join(logDir, file));
                return {
                    filename: file,
                    size: stats.size,
                    createdAt: stats.birthtime,
                    modifiedAt: stats.mtime
                };
            })
            .sort((a, b) => b.modifiedAt - a.modifiedAt);

        res.json({ logFiles });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get log files: ' + error.message });
    }
});

app.get('/api/admin/logs/content/:filename', authenticateAdmin, (req, res) => {
    const fs = require('fs');
    const path = require('path');

    const { filename } = req.params;
    const { search = '', page = 1, limit = 50, type = '' } = req.query;

    if (!filename.match(/^[a-zA-Z0-9\-_\.]+$/)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const logPath = path.join(__dirname, 'server', 'logs', filename);

    try {
        const content = fs.readFileSync(logPath, 'utf8');

        let logs = content.trim().split('\n')
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(log => log !== null);

        if (type) {
            const t = String(type).toLowerCase();
            if (t === 'chat') {
                logs = logs.filter(log => log.channel != null);
            } else if (t === 'audit') {
                logs = logs.filter(log => log.action != null && log.channel == null);
            } else {
                logs = logs.filter(log => log.action === t);
            }
        }

        if (search) {
            const searchLower = search.toLowerCase();
            logs = logs.filter(log => {
                return JSON.stringify(log).toLowerCase().includes(searchLower);
            });
        }

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedLogs = logs.slice(startIndex, endIndex);

        res.json({
            logs: paginatedLogs,
            total: logs.length,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(logs.length / limit)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read log file: ' + error.message });
    }
});

app.post('/api/upload/voice', upload.single('voice'), async (req, res) => {
    if (!req.file) {
        console.error('Voice upload failed: No file provided');
        return res.status(400).json({ error: 'File is required' });
    }

    console.log('Voice upload started:', {
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        mimetype: req.file.mimetype
    });

    try {
        const originalExt = path.extname(req.file.originalname).toLowerCase();

        const voicePath = path.join(__dirname, 'public', 'uploads', 'voice-' + req.file.filename);

        fs.renameSync(req.file.path, voicePath);

        const voiceUrl = 'uploads/voice-' + req.file.filename;
        console.log('Voice upload completed successfully:', voiceUrl);
        res.json({ success: true, voice: voiceUrl });
    } catch (error) {
        console.error('Voice upload failed:', error);
        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File size exceeds limit (10MB)' });
        } else {
            res.status(500).json({ error: 'Voice upload error' });
        }
    }
});

app.post('/api/channel/:channel/clear', authenticateUser, requireUser, (req, res) => {
    const { channel } = req.params;
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Invalid channel' });
    const userId = parseInt(req.userId, 10);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const last_clear_at = db.setChannelClearTime(userId, channel);
        res.json({ success: true, last_clear_at });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Clear failed' });
    }
});

app.get('/api/messages/:channel', authenticateUser, (req, res) => {
    const { channel } = req.params;

    if (!CHANNELS.includes(channel)) {
        return res.status(400).json({ error: 'Invalid channel' });
    }

    let messages = db.getMessagesByChannel(channel);

    if (req.userId) {
        messages = messages.filter(msg => {
            return !msg.is_blocked || msg.user_id === parseInt(req.userId);
        });
        const lastClearAt = db.getChannelClearTime(req.userId, channel);
        if (lastClearAt) {
            const t = new Date(lastClearAt).getTime();
            messages = messages.filter(msg => new Date(msg.created_at).getTime() > t);
        }
    } else {
        messages = messages.filter(msg => !msg.is_blocked);
    }

    const messagesWithUserInfo = messages.map(msg => {
        const user = db.getUserById(msg.user_id);

        const messageData = {
            ...msg,
            username: user?.username || '该账户已注销',
            nickname: user?.nickname || user?.username || '该账户已注销',
            avatar: user?.avatar || DEFAULT_AVATAR,
            reply_info: null
        };

        if (msg.reply_to) {
            const repliedMessage = db.getMessageById(msg.reply_to);
            if (repliedMessage) {
                const repliedUser = db.getUserById(repliedMessage.user_id);
                messageData.reply_info = {
                    message_id: repliedMessage.id,
                    username: repliedUser?.username || '该账户已注销',
                    nickname: repliedUser?.nickname || repliedUser?.username || '该账户已注销',
                    content: repliedMessage.content,
                    image: repliedMessage.image,
                    voice: repliedMessage.voice
                };
            }
        }

        return messageData;
    });

    res.json(messagesWithUserInfo);
});

app.get('/api/friends', authenticateUser, requireUser, (req, res) => {
    const list = db.getFriends(req.userId);
    res.json({ friends: list });
});

app.get('/api/friends/requests', authenticateUser, requireUser, (req, res) => {
    const requests = db.getIncomingFriendRequests(req.userId);
    res.json({ requests });
});

app.post('/api/friends/request', authenticateUser, requireUser, (req, res) => {
    const { to, message } = req.body;
    const targetUser = db.getUserByIdentifier(to);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    const allowAdd = targetUser.allow_add_friend_from_profile;
    if (allowAdd !== true && allowAdd !== 'true') {
        return res.status(403).json({ error: '对方暂未开启权限', code: 'add_friend_disabled' });
    }
    if (db.isBlocked(targetUser.id, req.userId)) {
        return res.status(403).json({ error: '对方设置了权限，您暂时不可以添加对方为好友', code: 'blocked_by_target' });
    }
    if (db.isBlocked(req.userId, targetUser.id)) {
        return res.status(403).json({ error: '如果想添加对方为好友，请先移出黑名单', code: 'you_blocked_target' });
    }
    const reasonCheck = validateFriendReason(message);
    if (!reasonCheck.ok) return res.status(400).json({ error: reasonCheck.error });
    const result = db.createFriendRequest(req.userId, targetUser.id, reasonCheck.value);
    if (!result.ok) {
        const map = {
            cannot_add_self: '不能添加自己为好友',
            target_not_found: '用户不存在',
            already_friends: '你们已经是好友了',
            request_already_pending: '好友申请已在处理中'
        };
        return res.status(400).json({ error: map[result.error] || 'Failed to create request' });
    }
    io.to(`user:${targetUser.id}`).emit('friendRequestReceived', {
        requestId: result.request.id,
        fromUserId: req.userId
    });
    res.json({ success: true, request: result.request });
});

app.post('/api/friends/request/:requestId/respond', authenticateUser, requireUser, (req, res) => {
    const { requestId } = req.params;
    const { action } = req.body;
    const result = db.respondFriendRequest(requestId, req.userId, action);
    if (!result.ok) {
        const map = {
            not_found: '申请不存在',
            not_authorized: '无权限操作该申请',
            already_resolved: '该申请已处理',
            invalid_action: '无效操作'
        };
        return res.status(400).json({ error: map[result.error] || 'Failed to respond request' });
    }
    io.to(`user:${result.request.from_user_id}`).emit('friendRequestUpdated', { requestId: result.request.id, status: result.request.status });
    io.to(`user:${result.request.to_user_id}`).emit('friendRequestUpdated', { requestId: result.request.id, status: result.request.status });
    res.json({ success: true, request: result.request });
});

app.delete('/api/friends/:friendUserId', authenticateUser, requireUser, (req, res) => {
    const friendUserId = parseInt(req.params.friendUserId);
    if (!friendUserId) return res.status(400).json({ error: 'Invalid friend id' });
    const ok = db.removeFriendship(req.userId, friendUserId);
    if (!ok) db.clearDmDataBetween(req.userId, friendUserId);
    if (ok) {
        io.to(`user:${req.userId}`).emit('friendsChanged');
        const deletedUser = friendUserId;
        const deleter = db.getUserById(req.userId);
        if (deleter) {
            io.to(`user:${deletedUser}`).emit('friendRemovedYou', {
                user: { id: deleter.id, username: deleter.username, nickname: deleter.nickname || deleter.username, avatar: deleter.avatar || DEFAULT_AVATAR }
            });
        }
    }
    res.json({ success: true });
});

app.get('/api/block/list', authenticateUser, requireUser, (req, res) => {
    try {
        const blockedIds = db.getBlockedUserIds(req.userId);
        const users = blockedIds.map(id => {
            const u = db.getUserById(id);
            return u ? { id: u.id, username: u.username, nickname: u.nickname || u.username, avatar: u.avatar || DEFAULT_AVATAR } : null;
        }).filter(Boolean);
        return res.json({ blockedIds, users });
    } catch (e) {
        console.error('getBlockedUserIds error:', e);
        return res.status(500).json({ error: '获取黑名单失败' });
    }
});

app.post('/api/block/:userId', authenticateUser, requireUser, (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId, 10);
        if (!targetUserId || Number.isNaN(targetUserId)) return res.status(400).json({ error: '无效的用户' });
        if (targetUserId === parseInt(req.userId, 10)) return res.status(400).json({ error: '不能拉黑自己' });
        db.addBlock(req.userId, targetUserId);
        return res.json({ success: true, message: '已加入黑名单' });
    } catch (e) {
        console.error('addBlock error:', e);
        return res.status(500).json({ error: '操作失败，请重试' });
    }
});

app.delete('/api/block/:userId', authenticateUser, requireUser, (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId, 10);
        if (!targetUserId || Number.isNaN(targetUserId)) return res.status(400).json({ error: '无效的用户' });
        db.removeBlock(req.userId, targetUserId);
        return res.json({ success: true, message: '已移出黑名单' });
    } catch (e) {
        console.error('removeBlock error:', e);
        return res.status(500).json({ error: '操作失败，请重试' });
    }
});

app.post('/api/dm/:peerUserId/clear', authenticateUser, requireUser, (req, res) => {
    const peerUserId = parseInt(req.params.peerUserId);
    if (!peerUserId) return res.status(400).json({ error: 'Invalid peer id' });
    if (!db.areFriends(req.userId, peerUserId)) return res.status(403).json({ error: 'Not friends' });
    const dmKey = [parseInt(req.userId, 10), peerUserId].sort((a, b) => a - b).join('_');
    try {
        const last_clear_at = db.setDmClearTime(req.userId, dmKey);
        res.json({ success: true, last_clear_at });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Clear failed' });
    }
});

app.get('/api/dm/:peerUserId/messages', authenticateUser, requireUser, (req, res) => {
    const peerUserId = parseInt(req.params.peerUserId);
    if (!peerUserId) return res.status(400).json({ error: 'Invalid peer id' });
    if (!db.areFriends(req.userId, peerUserId)) return res.status(403).json({ error: 'Not friends' });
    let raw = db.getDmMessagesBetween(req.userId, peerUserId, req.userId);
    const dmKey = [parseInt(req.userId, 10), peerUserId].sort((a, b) => a - b).join('_');
    const lastClearAt = db.getDmClearTime(req.userId, dmKey);
    if (lastClearAt) {
        const t = new Date(lastClearAt).getTime();
        raw = raw.filter(m => new Date(m.created_at).getTime() > t);
    }
    const messages = raw.map(m => {
        const out = { ...m };
        if (m.reply_to) {
            const replied = db.getDmMessageById(m.reply_to);
            const fromUser = replied ? db.getUserById(replied.from_user_id) : null;
            out.reply_info = replied ? {
                content: replied.is_recalled ? '[此消息已撤回]' : (replied.content || '图片消息'),
                username: fromUser?.username || '该账户已注销',
                nickname: fromUser?.nickname || fromUser?.username || '该账户已注销'
            } : null;
        }
        return out;
    });
    res.json({ messages });
});

app.delete('/api/dm/messages/:messageId', authenticateUser, requireUser, (req, res) => {
    const { messageId } = req.params;
    const result = db.deleteDmMessageForUser(messageId, req.userId);
    if (!result.ok) return res.status(404).json({ error: 'Message not found' });
    io.to(`user:${req.userId}`).emit('dmMessageDeleted', { messageId: parseInt(messageId) });
    res.json({ success: true });
});

app.get('/api/profile/:userId', (req, res) => {
    const { userId } = req.params;

    try {
        const user = db.getUserById(parseInt(userId));

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userProfile = {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            avatar: user.avatar,
            bio: user.bio,
            gender: user.gender,
            email: user.email,
            created_at: user.created_at
        };

        res.json(userProfile);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('authenticate', (userId) => {
        const uid = userId != null ? parseInt(userId) : null;
        logger.auditLog('user_connect', uid, { socketId: socket.id });
        socket.userId = uid;
        if (uid != null && !Number.isNaN(uid)) {
            const room = 'user:' + uid;
            socket.join(room);
        }
    });

    socket.on('adminJoin', (token, cb) => {
        if (!token) {
            if (typeof cb === 'function') cb('no_token');
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.admin) {
                socket.join('admin');
                if (typeof cb === 'function') cb(null);
            } else {
                if (typeof cb === 'function') cb('not_admin');
            }
        } catch (e) {
            if (typeof cb === 'function') cb('invalid');
        }
    });

    socket.on('joinChannel', (channel, userId) => {
        if (db.channels[channel]) {
            if (!userId || !db.channels[channel].members.includes(parseInt(userId))) {
                socket.emit('channelAccessDenied', { channel, error: 'You do not have access to this channel' });
                return;
            }
        }
        socket.leaveAll();
        socket.join(channel);
        const uid = userId != null ? parseInt(userId) : (socket.userId != null ? parseInt(socket.userId) : null);
        if (uid != null && !Number.isNaN(uid)) socket.join('user:' + uid);
        console.log('User joined channel:', channel);
        socket.emit('channelJoined', { channel });
    });

    socket.on('joinDmConversation', (data) => {
        const userId = data && (data.userId != null) ? parseInt(data.userId) : null;
        const peerUserId = data && (data.peerUserId != null) ? parseInt(data.peerUserId) : null;
        if (!userId || !peerUserId || userId === peerUserId) return;
        if (!db.areFriends(userId, peerUserId)) return;
        if (socket.dmRoom) socket.leave(socket.dmRoom);
        const room = 'dm:' + [userId, peerUserId].sort((a, b) => a - b).join(':');
        socket.join(room);
        socket.dmRoom = room;
        if (userId != null && !Number.isNaN(userId)) socket.join('user:' + userId);
    });

    socket.on('sendMessage', (data) => {
        console.log('接收到sendMessage事件:', data);
        const { userId, channel, content, image, voice } = data;

        const user = db.getUserById(userId);
        if (!user) return;
        if (user.banned) {
            socket.emit('messageError', { error: '账号已被封禁，无法发送消息' });
            return;
        }

        const containsBadWords = badWordsFilter.containsBadWords(content);

        const messageType = data.image ? 'image' : (data.voice ? 'voice' : 'text');
        logger.chatLog(channel, userId, content, messageType, {
            image: data.image,
            voice: data.voice,
            reply_to: data.reply_to,
            is_blocked: containsBadWords
        });

        if (containsBadWords) {
            logger.auditLog('message_blocked', userId, {
                channel,
                content,
                messageType
            });
        }

        const newMessage = db.insertMessage({
            user_id: userId,
            channel,
            content,
            image,
            voice: data.voice,
            reply_to: data.reply_to,
            is_blocked: containsBadWords
        });

        const messageData = {
            id: newMessage.id,
            user_id: userId,
            channel: channel,
            content: content,
            image: image,
            voice: newMessage.voice,
            created_at: newMessage.created_at,
            username: user.username,
            nickname: user.nickname || user.username,
            avatar: user.avatar,
            reply_to: newMessage.reply_to,
            reply_info: null,
            is_blocked: newMessage.is_blocked,
            blocked_at: newMessage.blocked_at
        };

        if (newMessage.reply_to) {
            const repliedMessage = db.getMessageById(newMessage.reply_to);
            if (repliedMessage) {
                const repliedUser = db.getUserById(repliedMessage.user_id);
                messageData.reply_info = {
                    message_id: repliedMessage.id,
                    username: repliedUser?.username || '该账户已注销',
                    nickname: repliedUser?.nickname || repliedUser?.username || '该账户已注销',
                    content: repliedMessage.content,
                    image: repliedMessage.image,
                    is_blocked: repliedMessage.is_blocked
                };
            }
        }

        if (newMessage.is_blocked) {
            socket.emit('messageReceived', messageData);
            socket.emit('messageBlocked', {
                messageId: newMessage.id,
                reason: '消息包含屏蔽词',
                content: content
            });

            setTimeout(() => {
                const msg = db.getMessageById(newMessage.id);
                if (msg && msg.is_blocked) {
                    db.deleteMessage(newMessage.id);
                    io.to(channel).emit('messageDeleted', { messageId: newMessage.id });
                }
            }, 24 * 60 * 60 * 1000);
        } else {
            io.to(channel).emit('messageReceived', messageData);
        }
    });

    socket.on('sendPrivateMessage', (data) => {
        const { fromUserId, toUserId, content, image, voice, reply_to } = data || {};
        const fromId = parseInt(fromUserId);
        const toId = parseInt(toUserId);
        if (!fromId || !toId) return;
        if (socket.userId && parseInt(socket.userId) !== fromId) return;
        const fromUser = db.getUserById(fromId);
        if (fromUser && fromUser.banned) {
            socket.emit('privateMessageError', { error: '账号已被封禁，无法发送消息' });
            return;
        }
        if (!db.areFriends(fromId, toId)) {
            socket.emit('privateMessageError', { error: '对方不是你的好友，请先添加对方为好友', code: 'not_friends' });
            return;
        }
        if (db.isBlocked(toId, fromId)) {
            socket.emit('privateMessageError', { error: '消息被对方拒收了', code: 'blocked' });
            return;
        }
        const newMessage = db.insertDmMessage({
            from_user_id: fromId,
            to_user_id: toId,
            content,
            image,
            voice,
            reply_to: reply_to != null ? reply_to : undefined
        });
        if (!newMessage) return;
        const messageData = {
            ...newMessage,
            username: fromUser?.username || '该账户已注销',
            nickname: fromUser?.nickname || fromUser?.username || '该账户已注销',
            avatar: fromUser?.avatar || DEFAULT_AVATAR,
            reply_info: null
        };
        if (newMessage.reply_to) {
            const replied = db.getDmMessageById(newMessage.reply_to);
            const repliedFrom = replied ? db.getUserById(replied.from_user_id) : null;
            messageData.reply_info = replied ? {
                content: replied.is_recalled ? '[此消息已撤回]' : (replied.content || '图片消息'),
                username: repliedFrom?.username || '该账户已注销',
                nickname: repliedFrom?.nickname || repliedFrom?.username || '该账户已注销'
            } : null;
        }
        io.to(`user:${fromId}`).emit('privateMessageReceived', messageData);
        io.to(`user:${toId}`).emit('privateMessageReceived', messageData);
    });

    socket.on('recallMessage', (data) => {
        const { messageId, channel } = data;
        const uid = socket.userId != null ? parseInt(socket.userId) : null;

        const message = db.getMessageById(messageId);
        if (!message) {
            console.log(`撤回请求：未找到消息 ${messageId}`);
            socket.emit('recallFailed', { reason: 'not_found' });
            return;
        }
        if (message.channel !== channel) {
            socket.emit('recallFailed', { reason: 'channel_mismatch' });
            return;
        }
        if (uid != null && message.user_id !== uid) {
            console.log(`撤回请求：非本人消息 message.user_id=${message.user_id} uid=${uid}`);
            socket.emit('recallFailed', { reason: 'not_author' });
            return;
        }

        const messageTime = new Date(message.created_at);
        const now = new Date();
        const timeDiff = (now - messageTime) / (1000 * 60);

        if (timeDiff > 2) {
            console.log(`撤回请求：消息 ${messageId} 已超过2分钟撤回时限 (${timeDiff.toFixed(2)}分钟)`);
            socket.emit('recallFailed', { reason: 'time_limit' });
            return;
        }

        deleteRecallAttachment(message.image);
        deleteRecallAttachment(message.voice);

        const updated = db.updateMessage(messageId, {
            content: '[此消息已撤回]',
            image: null,
            voice: null,
            is_recalled: true,
            recalled_at: new Date().toISOString()
        });
        if (updated) {
            logger.auditLog('message_recall', message.user_id, { messageId, channel, originalContent: message.content });
            const recaller = db.getUserById(message.user_id);
            const recalledByDisplayName = recaller ? (recaller.nickname || recaller.username) : '用户';
            io.to(channel).emit('messageRecalled', {
                messageId,
                channel,
                content: '[此消息已撤回]',
                image: null,
                voice: null,
                is_recalled: true,
                recalled_at: updated.recalled_at,
                originalContent: message.content || null,
                recalledByDisplayName
            });
            setTimeout(() => {
                if (db.deleteMessage(messageId)) {
                    io.to(channel).emit('recalledMessageDeleted', { messageId, channel });
                }
            }, 5 * 60 * 1000);
        } else {
            socket.emit('recallFailed', { reason: 'update_failed' });
        }
    });

    socket.on('recallDmMessage', (data) => {
        const mid = data && data.messageId != null ? parseInt(data.messageId) : NaN;
        if (!Number.isInteger(mid) || mid < 1) {
            socket.emit('recallDmFailed', { reason: 'invalid_id' });
            return;
        }
        const message = db.getDmMessageById(mid);
        if (!message) {
            socket.emit('recallDmFailed', { reason: 'not_found' });
            return;
        }
        const uid = socket.userId != null ? parseInt(socket.userId) : null;
        if (uid == null || Number.isNaN(uid)) {
            socket.emit('recallDmFailed', { reason: 'not_authenticated' });
            return;
        }
        if (Number(message.from_user_id) !== uid) {
            socket.emit('recallDmFailed', { reason: 'not_author' });
            return;
        }
        const created = new Date(message.created_at).getTime();
        if (Number.isNaN(created) || (Date.now() - created) / (1000 * 60) > 2) {
            socket.emit('recallDmFailed', { reason: 'time_limit' });
            return;
        }
        deleteRecallAttachment(message.image);
        deleteRecallAttachment(message.voice);

        const updated = db.updateDmMessage(mid, {
            content: '[此消息已撤回]',
            image: null,
            voice: null,
            is_recalled: true,
            recalled_at: new Date().toISOString()
        });
        if (!updated) {
            socket.emit('recallDmFailed', { reason: 'update_failed' });
            return;
        }
        logger.auditLog('dm_message_recall', uid, { messageId: mid });
        const recaller = db.getUserById(message.from_user_id);
        const recalledByDisplayName = recaller ? (recaller.nickname || recaller.username) : '用户';
        const payload = { messageId: mid, content: '[此消息已撤回]', image: null, voice: null, is_recalled: true, recalled_at: updated.recalled_at, originalContent: message.content || null, recalledByDisplayName };
        const fromId = Number(message.from_user_id);
        const toId = Number(message.to_user_id);
        io.to('user:' + fromId).emit('dmMessageRecalled', payload);
        io.to('user:' + toId).emit('dmMessageRecalled', payload);
        setTimeout(() => {
            if (db.removeRecalledDmMessageById(mid)) {
                io.to('user:' + fromId).emit('dmRecalledMessageDeleted', { messageId: mid });
                io.to('user:' + toId).emit('dmRecalledMessageDeleted', { messageId: mid });
            }
        }, 5 * 60 * 1000);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        if (socket.userId) {
            logger.auditLog('user_disconnect', socket.userId, { socketId: socket.id });
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT} (API only, set SERVE_FRONTEND=1 to serve frontend from this port)`);
    console.log('Available addresses:');

    const os = require('os');
    const networkInterfaces = os.networkInterfaces();

    for (const ifaceName in networkInterfaces) {
        const interfaces = networkInterfaces[ifaceName];
        for (const iface of interfaces) {
            if (iface.family === 'IPv4') {
                console.log(`  http://${iface.address}:${PORT}`);
            }
        }
    }

    console.log(`Available channels: ${CHANNELS.join(', ')}`);

    const allMessages = [];
    CHANNELS.forEach(channel => {
        const channelMessages = db.getMessagesByChannel(channel);
        allMessages.push(...channelMessages);
    });

    const blockedMessages = allMessages.filter(msg => msg.is_blocked);

    blockedMessages.forEach(msg => {
        const messageTime = new Date(msg.created_at);
        const now = new Date();
        const timeDiff = (now - messageTime) / (1000 * 60 * 60);

        if (timeDiff < 24) {
            const remainingTime = (24 - timeDiff) * 60 * 60 * 1000;

            setTimeout(() => {
                const updatedMsg = db.getMessageById(msg.id);
                if (updatedMsg && updatedMsg.is_blocked) {
                    db.deleteMessage(msg.id);
                    io.to(msg.channel).emit('messageDeleted', { messageId: msg.id });
                }
            }, remainingTime);
        } else {
            db.deleteMessage(msg.id);
            io.to(msg.channel).emit('messageDeleted', { messageId: msg.id });
        }
    });

    console.log(`已为 ${blockedMessages.length} 条被屏蔽消息设置自动删除定时器`);

    const RECALL_PURGE_MS = 5 * 60 * 1000;
    setInterval(() => {
        const channelRemoved = db.purgeRecalledChannelMessagesOlderThan(RECALL_PURGE_MS);
        channelRemoved.forEach(({ id, channel }) => {
            io.to(channel).emit('recalledMessageDeleted', { messageId: id, channel });
        });
        const dmRemoved = db.purgeRecalledDmMessagesOlderThan(RECALL_PURGE_MS);
        dmRemoved.forEach(({ messageId, fromId, toId }) => {
            io.to('user:' + fromId).emit('dmRecalledMessageDeleted', { messageId });
            io.to('user:' + toId).emit('dmRecalledMessageDeleted', { messageId });
        });
    }, 60 * 1000);
});

if (process.env.SERVE_FRONTEND === '1' || process.env.SERVE_FRONTEND === 'true') {
    app.use(express.static(path.join(__dirname, 'public')));
} else {
    app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
    app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
}

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    process.exit(0);
});