const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const db = require('./server/db');
const logger = require('./server/log');
const badWordsFilter = require('./server/badwords');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';
const CHANNELS = ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel105'];
const REGISTRATION_ENABLED = true;
const VERSION = 'beta v2.0.0';
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin123'
};
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
        req.userId = decoded.userId;
        next();
    } catch (error) {
        next();
    }
};
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
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/uploads/');
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
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        if (db.getUserByUsername(username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        if (email && db.getUserByEmail(email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = db.insertUser({
            username,
            password: hashedPassword,
            email,
            nickname
        });

        const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '24h' });
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
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        logger.auditLog('user_login', user.id, { username: user.username });
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
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
        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, admin: true });
    } else {
        res.status(401).json({ error: 'Invalid admin credentials' });
    }
});

app.put('/api/admin/password', authenticateAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (currentPassword !== ADMIN_CREDENTIALS.password) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    ADMIN_CREDENTIALS.password = newPassword;
    res.json({ success: true, message: 'Admin password updated successfully' });
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
        created_at: user.created_at
    };

    res.json(userProfile);
});
app.put('/api/profile/:userId', (req, res) => {
    const { userId } = req.params;
    const { bio, gender, email, nickname } = req.body;
    if (email) {
        const existingUser = db.getUserByEmail(email);
        if (existingUser && existingUser.id != userId) {
            return res.status(400).json({ error: 'Email already exists' });
        }
    }
    const updatedUser = db.updateUser(userId, { bio, gender, email, nickname });
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
});
app.post('/api/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
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
            return res.status(401).json({ error: 'Current password is incorrect', success: false });
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

    try {
        const originalExt = path.extname(req.file.originalname).toLowerCase();
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

        const avatarUrl = 'uploads/optimized-' + req.file.filename;
        const updatedUser = db.updateUser(userId, { avatar: avatarUrl });

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });

        res.json({ success: true, avatar: avatarUrl });
    } catch (error) {
        res.status(500).json({ error: 'Image processing error' });
    }
});

app.post('/api/upload/image', upload.single('image'), async (req, res) => {
    if (!req.file) {
        console.error('Upload failed: No file provided');
        return res.status(400).json({ error: 'File is required' });
    }

    console.log('Upload started:', {
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        mimetype: req.file.mimetype
    });

    try {
        const originalExt = path.extname(req.file.originalname).toLowerCase();
        const isGif = originalExt === '.gif';

        console.log('File info:', {
            originalExt,
            isGif,
            mimetype: req.file.mimetype
        });

        const optimizedPath = path.join(__dirname, 'public', 'uploads', 'chat-' + req.file.filename);
        const sharpInstance = sharp(req.file.path)
            .resize(600, 450, { fit: 'inside' });

        if (isGif) {
            console.log('Processing GIF file...');
            await sharpInstance
                .gif()
                .toFile(optimizedPath);
        } else {
            console.log('Processing non-GIF file...');
            await sharpInstance
                .png({ quality: 85 })
                .toFile(optimizedPath);
        }

        console.log('Image processed successfully:', optimizedPath);

        try {
            fs.unlinkSync(req.file.path);
            console.log('Original file deleted:', req.file.path);
        } catch (deleteError) {
            console.error('Failed to delete original file:', deleteError);
        }

        const imageUrl = 'uploads/chat-' + req.file.filename;
        console.log('Upload completed successfully:', imageUrl);
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
    const { search = '', page = 1, limit = 50 } = req.query;

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
    } else {
        messages = messages.filter(msg => !msg.is_blocked);
    }

    const messagesWithUserInfo = messages.map(msg => {
        const user = db.getUserById(msg.user_id);

        const messageData = {
            ...msg,
            username: user?.username || 'Unknown',
            nickname: user?.nickname || user?.username || 'Unknown',
            avatar: user?.avatar || 'images/default.png',
            reply_info: null
        };

        if (msg.reply_to) {
            const repliedMessage = db.getMessageById(msg.reply_to);
            if (repliedMessage) {
                const repliedUser = db.getUserById(repliedMessage.user_id);
                messageData.reply_info = {
                    message_id: repliedMessage.id,
                    username: repliedUser?.username || 'Unknown',
                    nickname: repliedUser?.nickname || repliedUser?.username || 'Unknown',
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
        logger.auditLog('user_connect', userId, { socketId: socket.id });
        socket.userId = userId;
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
        console.log(`User joined channel: ${channel}`);
        socket.emit('channelJoined', { channel });
    });

    socket.on('sendMessage', (data) => {
        console.log('接收到sendMessage事件:', data);
        const { userId, channel, content, image, voice } = data;

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

        const user = db.getUserById(userId);
        if (!user) return;

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
                    username: repliedUser?.username || 'Unknown',
                    nickname: repliedUser?.nickname || repliedUser?.username || 'Unknown',
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

    socket.on('recallMessage', (data) => {
        const { messageId, channel } = data;

        const message = db.getMessageById(messageId);
        if (!message) {
            console.log(`撤回请求：未找到消息 ${messageId}`);
            return;
        }

        const messageTime = new Date(message.created_at);
        const now = new Date();
        const timeDiff = (now - messageTime) / (1000 * 60);

        console.log(`撤回请求处理：messageId=${messageId}, created_at=${message.created_at}, messageTime=${messageTime}, now=${now}, timeDiff=${timeDiff.toFixed(2)}分钟`);

        if (timeDiff <= 2) {
            const updatedMessage = db.updateMessage(messageId, {
                content: '[此消息已撤回]',
                image: null,
                voice: null,
                is_recalled: true,
                recalled_at: new Date().toISOString()
            });

            if (updatedMessage) {
                logger.auditLog('message_recall', message.user_id, {
                    messageId,
                    channel,
                    originalContent: message.content
                });

                io.to(channel).emit('messageRecalled', {
                    messageId,
                    channel,
                    content: '[此消息已撤回]',
                    image: null,
                    voice: null,
                    is_recalled: true,
                    recalled_at: updatedMessage.recalled_at
                });
            }
        } else {
            console.log(`撤回请求：消息 ${messageId} 已超过2分钟撤回时限 (${timeDiff.toFixed(2)}分钟)`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        if (socket.userId) {
            logger.auditLog('user_disconnect', socket.userId, { socketId: socket.id });
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Available addresses:');

    const os = require('os');
    const networkInterfaces = os.networkInterfaces();

    for (const ifaceName in networkInterfaces) {
        const interfaces = networkInterfaces[ifaceName];
        for (const iface of interfaces) {
            if (iface.family === 'IPv4') {
                console.log(`  http://${iface.address}:${PORT} (${ifaceName})`);
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
});

app.use(express.static(path.join(__dirname, 'public')));

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    process.exit(0);
});