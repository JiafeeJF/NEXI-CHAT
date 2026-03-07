const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');
const DM_DIR = path.join(DATA_DIR, 'dm');
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const FRIEND_REQUESTS_FILE = path.join(DATA_DIR, 'friend_requests.json');
const CLEAR_TIMESTAMPS_FILE = path.join(DATA_DIR, 'clear_timestamps.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('创建目录:', dir);
    }
}

function clearDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => {
        try {
            fs.unlinkSync(path.join(dir, f));
            console.log('删除:', path.join(dir, f));
        } catch (e) {
            console.warn('删除失败:', e.message);
        }
    });
}

function clearUploads() {
    if (!fs.existsSync(UPLOADS_DIR)) return;
    const files = fs.readdirSync(UPLOADS_DIR);
    files.forEach(f => {
        const full = path.join(UPLOADS_DIR, f);
        try {
            if (fs.statSync(full).isFile()) {
                fs.unlinkSync(full);
                console.log('删除上传文件:', f);
            }
        } catch (e) {
            console.warn('删除失败:', full, e.message);
        }
    });
}

async function main() {
    console.log('开始重置数据...');
    ensureDir(DATA_DIR);
    ensureDir(MESSAGES_DIR);
    ensureDir(DM_DIR);

    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const defaultUsers = [
        {
            id: 1,
            username: 'admin',
            password: hashedPassword,
            nickname: '管理员',
            email: 'admin@example.com',
            avatar: null,
            bio: '系统管理员',
            gender: 'male',
            created_at: new Date().toISOString()
        }
    ];

    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf8');
    console.log('已写入默认用户: users.json (admin / ' + DEFAULT_PASSWORD + ')');

    fs.writeFileSync(FRIENDS_FILE, JSON.stringify([], null, 2), 'utf8');
    fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify([], null, 2), 'utf8');
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify({}, null, 2), 'utf8');
    fs.writeFileSync(CLEAR_TIMESTAMPS_FILE, JSON.stringify({ channel: {}, dm: {} }, null, 2), 'utf8');
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify({}, null, 2), 'utf8');
    console.log('已清空: friends.json, friend_requests.json, channels.json, clear_timestamps.json, blacklist.json');

    clearDir(MESSAGES_DIR);
    clearDir(DM_DIR);
    const oldMessagesFile = path.join(DATA_DIR, 'messages.json');
    const oldDmFile = path.join(DATA_DIR, 'dm_messages.json');
    if (fs.existsSync(oldMessagesFile)) fs.unlinkSync(oldMessagesFile);
    if (fs.existsSync(oldDmFile)) fs.unlinkSync(oldDmFile);
    console.log('已清空频道消息与私聊消息');

    clearUploads();
    console.log('已清空上传目录 public/uploads');

    console.log('重置完成。请重启服务后使用默认账号登录：用户名 admin，密码 ' + DEFAULT_PASSWORD);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
