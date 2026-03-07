const fs = require('fs');
const path = require('path');
const dmCrypto = require('./dm-crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const FRIEND_REQUESTS_FILE = path.join(DATA_DIR, 'friend_requests.json');
const DM_DIR = path.join(DATA_DIR, 'dm');

const CLEAR_TIMESTAMPS_FILE = path.join(DATA_DIR, 'clear_timestamps.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');
const DEACTIVATION_REQUESTS_FILE = path.join(DATA_DIR, 'deactivation_requests.json');
const DEACTIVATION_LOCKS_FILE = path.join(DATA_DIR, 'deactivation_locks.json');
const DEACTIVATION_MAX_PER_24H = 3;
const DEACTIVATION_LOCK_HOURS = 24;
const DEFAULT_AVATAR = 'images/default.png';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(MESSAGES_DIR)) {
    fs.mkdirSync(MESSAGES_DIR, { recursive: true });
}
if (!fs.existsSync(DM_DIR)) {
    fs.mkdirSync(DM_DIR, { recursive: true });
}

function safeChannelFilename(channelName) {
    return String(channelName).replace(/[/\\:*?"<>|]/g, '_') + '.json';
}

const defaultUsers = [
    {
        id: 1,
        username: 'admin',
        password: '$2b$10$E5aN3v8h3t5f8k9j1L2Q3R4T5Y6U7I8O9P0A1S2D3F4G5H6J7K8L9M0N',
        nickname: '管理员',
        email: 'admin@example.com',
        avatar: null,
        bio: '系统管理员',
        gender: 'male',
        created_at: new Date().toISOString()
    }
];

const defaultMessages = [];

const defaultChannels = {};

const defaultFriends = [];
const defaultFriendRequests = [];

function loadData() {
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    }
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    let messagesData = [];
    if (fs.existsSync(MESSAGES_DIR)) {
        const files = fs.readdirSync(MESSAGES_DIR).filter(f => f.endsWith('.json'));
        files.forEach(f => {
            try {
                const arr = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, f), 'utf8'));
                if (Array.isArray(arr)) messagesData.push(...arr);
            } catch (e) {  }
        });
    }
    const oldMessagesFile = path.join(DATA_DIR, 'messages.json');
    if (messagesData.length === 0 && fs.existsSync(oldMessagesFile)) {
        try {
            messagesData = JSON.parse(fs.readFileSync(oldMessagesFile, 'utf8'));
            if (!Array.isArray(messagesData)) messagesData = [];
        } catch (e) { messagesData = []; }
    }

    const numToPublicChannel = { '1': 'General', '2': 'Technology', '3': 'Gaming', '4': 'Music', '5': 'Random', '6': 'Channel6' };
    messagesData.forEach(m => { if (m.channel && numToPublicChannel[m.channel]) m.channel = numToPublicChannel[m.channel]; });
    if (!fs.existsSync(CHANNELS_FILE)) {
        fs.writeFileSync(CHANNELS_FILE, JSON.stringify(defaultChannels, null, 2));
    }
    const channelsData = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
    if (!fs.existsSync(FRIENDS_FILE)) {
        fs.writeFileSync(FRIENDS_FILE, JSON.stringify(defaultFriends, null, 2));
    }
    const friendsData = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf8'));
    if (!fs.existsSync(FRIEND_REQUESTS_FILE)) {
        fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(defaultFriendRequests, null, 2));
    }
    const friendRequestsData = JSON.parse(fs.readFileSync(FRIEND_REQUESTS_FILE, 'utf8'));
    if (!fs.existsSync(DEACTIVATION_REQUESTS_FILE)) {
        fs.writeFileSync(DEACTIVATION_REQUESTS_FILE, JSON.stringify([], null, 2));
    }
    let deactivationRequestsData = [];
    try {
        const raw = fs.readFileSync(DEACTIVATION_REQUESTS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) deactivationRequestsData = parsed;
    } catch (e) {
        console.warn('[db] deactivation_requests.json 读取失败，使用空列表:', e.message);
    }
    if (!fs.existsSync(DEACTIVATION_LOCKS_FILE)) {
        fs.writeFileSync(DEACTIVATION_LOCKS_FILE, JSON.stringify({}, null, 2));
    }
    return { usersData, messagesData, channelsData, friendsData, friendRequestsData, deactivationRequestsData };
}

function saveData() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    const byChannel = {};
    messages.forEach(m => {
        const ch = m.channel;
        if (!byChannel[ch]) byChannel[ch] = [];
        byChannel[ch].push(m);
    });
    Object.keys(byChannel).forEach(ch => {
        fs.writeFileSync(path.join(MESSAGES_DIR, safeChannelFilename(ch)), JSON.stringify(byChannel[ch], null, 2));
    });
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
    fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2));
    fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(friendRequests, null, 2));
    fs.writeFileSync(DEACTIVATION_REQUESTS_FILE, JSON.stringify(deactivationRequests, null, 2));
}

let users, messages, channels, friends, friendRequests, deactivationRequests;
let { usersData, messagesData, channelsData, friendsData, friendRequestsData, deactivationRequestsData } = loadData();
users = usersData;
messages = messagesData;
channels = channelsData;
friends = friendsData;
friendRequests = friendRequestsData;
deactivationRequests = Array.isArray(deactivationRequestsData) ? deactivationRequestsData : [];

function loadClearTimestamps() {
    if (!fs.existsSync(CLEAR_TIMESTAMPS_FILE)) return { channel: {}, dm: {} };
    try {
        const raw = fs.readFileSync(CLEAR_TIMESTAMPS_FILE, 'utf8');
        const o = JSON.parse(raw);
        return { channel: o.channel || {}, dm: o.dm || {} };
    } catch (e) {
        return { channel: {}, dm: {} };
    }
}

function saveClearTimestamps(data) {
    try {
        fs.writeFileSync(CLEAR_TIMESTAMPS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('saveClearTimestamps failed:', e);
    }
}

let clearTimestamps = loadClearTimestamps();

function getChannelClearTime(userId, channel) {
    const uid = String(parseInt(userId, 10));
    if (!clearTimestamps.channel[channel]) return null;
    return clearTimestamps.channel[channel][uid] || null;
}

function setChannelClearTime(userId, channel) {
    const uid = String(parseInt(userId, 10));
    if (!clearTimestamps.channel[channel]) clearTimestamps.channel[channel] = {};
    clearTimestamps.channel[channel][uid] = new Date().toISOString();
    saveClearTimestamps(clearTimestamps);
    return clearTimestamps.channel[channel][uid];
}

function getDmClearTime(userId, dmKey) {
    const uid = String(parseInt(userId, 10));
    if (!clearTimestamps.dm[dmKey]) return null;
    return clearTimestamps.dm[dmKey][uid] || null;
}

function setDmClearTime(userId, dmKey) {
    const uid = String(parseInt(userId, 10));
    if (!clearTimestamps.dm[dmKey]) clearTimestamps.dm[dmKey] = {};
    clearTimestamps.dm[dmKey][uid] = new Date().toISOString();
    saveClearTimestamps(clearTimestamps);
    return clearTimestamps.dm[dmKey][uid];
}

function loadBlacklist() {
    if (!fs.existsSync(BLACKLIST_FILE)) return {};
    try {
        const raw = fs.readFileSync(BLACKLIST_FILE, 'utf8');
        const o = JSON.parse(raw);
        return typeof o === 'object' && o !== null ? o : {};
    } catch (e) {
        return {};
    }
}

function saveBlacklist(data) {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('saveBlacklist failed:', e);
    }
}

let blacklist = loadBlacklist();

function isBlocked(blockerUserId, blockedUserId) {
    const uid = String(parseInt(blockerUserId, 10));
    const list = blacklist[uid];
    if (!Array.isArray(list)) return false;
    return list.some(function (id) { return parseInt(id, 10) === parseInt(blockedUserId, 10); });
}

function addBlock(blockerUserId, blockedUserId) {
    const uid = String(parseInt(blockerUserId, 10));
    const bid = parseInt(blockedUserId, 10);
    if (Number.isNaN(bid) || uid === String(bid)) return false;
    blacklist = loadBlacklist();
    if (!Array.isArray(blacklist[uid])) blacklist[uid] = [];
    if (blacklist[uid].some(function (x) { return parseInt(x, 10) === bid; })) return true;
    blacklist[uid].push(bid);
    saveBlacklist(blacklist);
    return true;
}

function removeBlock(blockerUserId, blockedUserId) {
    const uid = String(parseInt(blockerUserId, 10));
    const bid = parseInt(blockedUserId, 10);
    blacklist = loadBlacklist();
    if (!Array.isArray(blacklist[uid])) return false;
    const idx = blacklist[uid].findIndex(function (x) { return parseInt(x, 10) === bid; });
    if (idx < 0) return false;
    blacklist[uid].splice(idx, 1);
    saveBlacklist(blacklist);
    return true;
}

function getBlockedUserIds(blockerUserId) {
    const fresh = loadBlacklist();
    const uid = String(parseInt(blockerUserId, 10));
    const list = fresh[uid];
    return Array.isArray(list) ? list.slice() : [];
}

function getDmConversationPath(userIdA, userIdB) {
    const pair = normalizePair(userIdA, userIdB);
    if (!pair) return null;
    return path.join(DM_DIR, pair[0] + '_' + pair[1] + '.json');
}

function dmDecryptMessage(m) {
    if (!m || m.content == null) return m;
    return { ...m, content: dmCrypto.decrypt(m.content) };
}

function loadDmConversation(userIdA, userIdB) {
    const p = getDmConversationPath(userIdA, userIdB);
    if (!p) return [];
    if (!fs.existsSync(p)) return [];
    try {
        const raw = fs.readFileSync(p, 'utf8');
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.map(dmDecryptMessage);
    } catch (e) {
        return [];
    }
}

function saveDmConversation(userIdA, userIdB, arr) {
    const p = getDmConversationPath(userIdA, userIdB);
    if (!p) return;
    const toWrite = arr.map(m => {
        if (!m || m.content == null) return m;
        const content = String(m.content);
        return { ...m, content: content === '' ? '' : dmCrypto.encrypt(content) };
    });
    fs.writeFileSync(p, JSON.stringify(toWrite, null, 2), 'utf8');
}

function getUsers() {
    return users || [];
}

function getUserById(id) {
    return users.find(user => user.id === parseInt(id));
}

function getUserByUsername(username) {
    return users.find(user => user.username === username);
}

function getUserByEmail(email) {
    return users.find(user => user.email === email);
}

function getUserByIdentifier(identifier) {
    if (identifier === null || identifier === undefined) return null;
    const raw = String(identifier).trim();
    if (!raw) return null;
    return getUserByUsername(raw);
}

function insertUser(userData) {
    const newUser = {
        id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
        username: userData.username,
        password: userData.password,
        email: userData.email || null,
        nickname: userData.nickname || userData.username,
        avatar: null,
        bio: null,
        gender: null,
        banned: false,
        allow_add_friend_from_profile: userData.allow_add_friend_from_profile !== false,
        created_at: new Date().toISOString()
    };
    users.push(newUser);
    saveData();
    return newUser;
}

function updateUser(id, userData) {
    const userId = parseInt(id);
    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex === -1) return null;

    users[userIndex] = { ...users[userIndex], ...userData };
    saveData();
    return users[userIndex];
}

function deleteUser(id) {
    const userId = parseInt(id);
    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex === -1) return false;
    users.splice(userIndex, 1);
    friends = friends.filter(f => f.user1 !== userId && f.user2 !== userId);
    friendRequests = friendRequests.filter(r => r.from_user_id !== userId && r.to_user_id !== userId);
    deactivationRequests = deactivationRequests.filter(r => r.user_id !== userId);
    const locks = loadDeactivationLocks();
    const key = String(userId);
    if (locks[key]) {
        delete locks[key];
        saveDeactivationLocks(locks);
    }
    blacklist = loadBlacklist();
    Object.keys(blacklist).forEach(uid => {
        blacklist[uid] = (blacklist[uid] || []).filter(bid => parseInt(bid, 10) !== userId);
        if (uid === String(userId)) delete blacklist[uid];
    });
    saveBlacklist(blacklist);
    Object.keys(channels).forEach(ch => {
        if (Array.isArray(channels[ch].members)) {
            channels[ch].members = channels[ch].members.filter(m => m !== userId);
        }
    });
    saveData();
    return true;
}

function loadDeactivationLocks() {
    if (!fs.existsSync(DEACTIVATION_LOCKS_FILE)) return {};
    try {
        const raw = fs.readFileSync(DEACTIVATION_LOCKS_FILE, 'utf8');
        const o = JSON.parse(raw);
        return typeof o === 'object' && o !== null ? o : {};
    } catch (e) { return {}; }
}

function saveDeactivationLocks(locks) {
    fs.writeFileSync(DEACTIVATION_LOCKS_FILE, JSON.stringify(locks, null, 2));
}

function getDeactivationLock(userId) {
    const locks = loadDeactivationLocks();
    const key = String(userId);
    const until = locks[key];
    if (!until) return null;
    const t = new Date(until).getTime();
    if (Date.now() >= t) {
        delete locks[key];
        saveDeactivationLocks(locks);
        return null;
    }
    return until;
}

function setDeactivationLock(userId, lockUntilIso) {
    const locks = loadDeactivationLocks();
    locks[String(userId)] = lockUntilIso;
    saveDeactivationLocks(locks);
}

function addDeactivationRequest(userId, reason) {
    const uid = parseInt(userId, 10);
    const lockUntil = getDeactivationLock(uid);
    if (lockUntil) return { locked: true, lock_until: lockUntil };

    const now = Date.now();
    const ms24h = DEACTIVATION_LOCK_HOURS * 60 * 60 * 1000;
    const count24h = deactivationRequests.filter(r => r.user_id === uid && (now - new Date(r.created_at).getTime()) < ms24h).length;
    if (count24h >= DEACTIVATION_MAX_PER_24H) {
        const until = new Date(now + ms24h).toISOString();
        setDeactivationLock(uid, until);
        return { locked: true, lock_until: until };
    }

    const existing = deactivationRequests.find(r => r.user_id === uid && r.status === 'pending');
    if (existing) return null;
    const id = deactivationRequests.length > 0 ? Math.max(...deactivationRequests.map(r => r.id)) + 1 : 1;
    const req = {
        id,
        user_id: uid,
        reason: String(reason).trim(),
        status: 'pending',
        created_at: new Date().toISOString()
    };
    deactivationRequests.push(req);
    saveData();
    return req;
}

function getDeactivationRequestByUserId(userId) {
    const uid = parseInt(userId, 10);
    const user = getUserById(uid);
    if (!user) return null;
    const pending = deactivationRequests.find(r => r.user_id === uid && r.status === 'pending');
    if (pending) return pending;
    const last = deactivationRequests.filter(r => r.user_id === uid).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!last) return null;
    if (last.status === 'approved' || last.status === 'rejected') {
        const requestTime = last.updated_at || last.created_at;
        const userCreated = user.created_at ? new Date(user.created_at).getTime() : 0;
        const reqTime = requestTime ? new Date(requestTime).getTime() : 0;
        if (userCreated > reqTime) return null;
    }
    return last;
}

function getDeactivationRequestById(id) {
    return deactivationRequests.find(r => r.id === parseInt(id, 10)) || null;
}

function getDeactivationRequests() {
    return deactivationRequests.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateDeactivationRequestStatus(id, status) {
    const req = deactivationRequests.find(r => r.id === parseInt(id, 10));
    if (!req || !['approved', 'rejected'].includes(status)) return null;
    req.status = status;
    req.updated_at = new Date().toISOString();
    saveData();
    return req;
}

function getMessagesByChannel(channel) {
    return messages.filter(msg => msg.channel === channel);
}

function getMessageById(id) {
    return messages.find(msg => msg.id === parseInt(id));
}

function insertMessage(messageData) {
    const newMessage = {
        id: messages.length > 0 ? Math.max(...messages.map(m => m.id)) + 1 : 1,
        user_id: messageData.user_id,
        channel: messageData.channel,
        content: messageData.content || '',
        image: messageData.image || null,
        voice: messageData.voice || null,
        reply_to: messageData.reply_to || null,
        is_blocked: messageData.is_blocked || false,
        blocked_at: messageData.is_blocked ? new Date().toISOString() : null,
        is_recalled: false,
        recalled_at: null,
        created_at: new Date().toISOString()
    };
    messages.push(newMessage);
    saveData();
    return newMessage;
}

function updateMessage(id, messageData) {
    const messageId = parseInt(id);
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return null;
    
    if (messageData.is_recalled) {
        messageData.image = null;
        messageData.voice = null;
    }
    
    messages[messageIndex] = { ...messages[messageIndex], ...messageData };
    saveData();
    return messages[messageIndex];
}

function deleteMessage(id) {
    const messageId = parseInt(id);
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return false;

    messages.splice(messageIndex, 1);
    saveData();
    return true;
}

/** 删除超过指定时间的已撤回频道消息，返回被删消息 [{ id, channel }] */
function purgeRecalledChannelMessagesOlderThan(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const toDelete = messages.filter(m =>
        m.is_recalled && m.recalled_at && new Date(m.recalled_at).getTime() < cutoff
    );
    const result = toDelete.map(m => ({ id: m.id, channel: m.channel }));
    toDelete.forEach(m => deleteMessage(m.id));
    return result;
}

/** 删除超过指定时间的已撤回私聊消息，返回被删 [{ messageId, fromId, toId }] */
function purgeRecalledDmMessagesOlderThan(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const removed = [];
    if (!fs.existsSync(DM_DIR)) return removed;
    const files = fs.readdirSync(DM_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
        const match = f.match(/^(\d+)_(\d+)\.json$/);
        if (!match) continue;
        const userIdA = parseInt(match[1], 10);
        const userIdB = parseInt(match[2], 10);
        const list = loadDmConversation(userIdA, userIdB);
        const toRemove = list.filter(m =>
            m.is_recalled && m.recalled_at && new Date(m.recalled_at).getTime() < cutoff
        );
        if (toRemove.length === 0) continue;
        const kept = list.filter(m =>
            !m.is_recalled || !m.recalled_at || new Date(m.recalled_at).getTime() >= cutoff
        );
        saveDmConversation(userIdA, userIdB, kept);
        toRemove.forEach(m => removed.push({ messageId: Number(m.id), fromId: userIdA, toId: userIdB }));
    }
    return removed;
}

function normalizePair(a, b) {
    const x = parseInt(a);
    const y = parseInt(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;
    return x < y ? [x, y] : [y, x];
}

function getConversationKey(a, b) {
    const pair = normalizePair(a, b);
    if (!pair) return null;
    return `${pair[0]}:${pair[1]}`;
}

function areFriends(userIdA, userIdB) {
    const key = getConversationKey(userIdA, userIdB);
    if (!key) return false;
    return friends.some(f => f.key === key);
}

function getFriends(userId) {
    const uid = parseInt(userId);
    if (Number.isNaN(uid)) return [];
    const friendIds = new Set();
    friends.forEach(f => {
        if (f.user1 === uid) friendIds.add(f.user2);
        if (f.user2 === uid) friendIds.add(f.user1);
    });
    return Array.from(friendIds)
        .map(id => getUserById(id))
        .filter(Boolean)
        .map(u => ({
            id: u.id,
            username: u.username,
            nickname: u.nickname || u.username,
            avatar: u.avatar || DEFAULT_AVATAR
        }));
}

function addFriendship(userIdA, userIdB) {
    const pair = normalizePair(userIdA, userIdB);
    if (!pair) return null;
    if (pair[0] === pair[1]) return null;
    const key = `${pair[0]}:${pair[1]}`;
    if (friends.some(f => f.key === key)) return key;
    friends.push({
        key,
        user1: pair[0],
        user2: pair[1],
        created_at: new Date().toISOString()
    });
    saveData();
    return key;
}

function clearDmDataBetween(userIdA, userIdB) {
    const pair = normalizePair(userIdA, userIdB);
    if (!pair) return;
    const dmKey = pair[0] + '_' + pair[1];
    const dmPath = getDmConversationPath(userIdA, userIdB);
    if (dmPath && fs.existsSync(dmPath)) {
        try {
            fs.unlinkSync(dmPath);
        } catch (e) {
            console.error('删除好友会话库失败:', dmPath, e);
        }
    }
    if (clearTimestamps.dm[dmKey]) {
        delete clearTimestamps.dm[dmKey];
        saveClearTimestamps(clearTimestamps);
    }
}

function removeFriendship(userIdA, userIdB) {
    const key = getConversationKey(userIdA, userIdB);
    if (!key) return false;
    const idx = friends.findIndex(f => f.key === key);
    if (idx === -1) return false;
    friends.splice(idx, 1);
    saveData();
    return true;
}

function createFriendRequest(fromUserId, toUserId, message) {
    const fromId = parseInt(fromUserId);
    const toId = parseInt(toUserId);
    if (Number.isNaN(fromId) || Number.isNaN(toId)) return { ok: false, error: 'invalid_user' };
    if (fromId === toId) return { ok: false, error: 'cannot_add_self' };
    if (!getUserById(toId)) return { ok: false, error: 'target_not_found' };
    if (areFriends(fromId, toId)) return { ok: false, error: 'already_friends' };

    const existingPending = friendRequests.find(r =>
        r.status === 'pending' &&
        ((r.from_user_id === fromId && r.to_user_id === toId) || (r.from_user_id === toId && r.to_user_id === fromId))
    );
    if (existingPending) return { ok: false, error: 'request_already_pending', request: existingPending };

    const newReq = {
        id: friendRequests.length > 0 ? Math.max(...friendRequests.map(r => r.id)) + 1 : 1,
        from_user_id: fromId,
        to_user_id: toId,
        status: 'pending',
        message: message && String(message).trim() ? String(message).trim() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    friendRequests.push(newReq);
    saveData();
    return { ok: true, request: newReq };
}

function getIncomingFriendRequests(userId) {
    const uid = parseInt(userId);
    if (Number.isNaN(uid)) return [];
    return friendRequests
        .filter(r => r.to_user_id === uid && r.status === 'pending')
        .map(r => {
            const fromUser = getUserById(r.from_user_id);
            return {
                id: r.id,
                from_user: fromUser ? {
                    id: fromUser.id,
                    username: fromUser.username,
                    nickname: fromUser.nickname || fromUser.username,
                    avatar: fromUser.avatar || DEFAULT_AVATAR
                } : { id: r.from_user_id, username: '该账户已注销', nickname: '该账户已注销', avatar: DEFAULT_AVATAR },
                message: r.message || null,
                created_at: r.created_at
            };
        });
}

function respondFriendRequest(requestId, responderUserId, action) {
    const rid = parseInt(requestId);
    const responderId = parseInt(responderUserId);
    if (Number.isNaN(rid) || Number.isNaN(responderId)) return { ok: false, error: 'invalid_request' };
    const reqIdx = friendRequests.findIndex(r => r.id === rid);
    if (reqIdx === -1) return { ok: false, error: 'not_found' };
    const req = friendRequests[reqIdx];
    if (req.to_user_id !== responderId) return { ok: false, error: 'not_authorized' };
    if (req.status !== 'pending') return { ok: false, error: 'already_resolved' };
    if (action !== 'accept' && action !== 'reject') return { ok: false, error: 'invalid_action' };

    req.status = action === 'accept' ? 'accepted' : 'rejected';
    req.updated_at = new Date().toISOString();
    friendRequests[reqIdx] = req;

    if (action === 'accept') {
        addFriendship(req.from_user_id, req.to_user_id);
    }
    saveData();
    return { ok: true, request: req };
}

function getDmMessagesBetween(userIdA, userIdB, viewerUserId) {
    const viewerId = parseInt(viewerUserId);
    if (Number.isNaN(viewerId)) return [];
    const list = loadDmConversation(userIdA, userIdB);
    return list
        .filter(m => !(Array.isArray(m.deleted_for) && m.deleted_for.includes(viewerId)))
        .map(m => {
            const fromUser = getUserById(m.from_user_id);
            return {
                ...m,
                username: fromUser?.username || '该账户已注销',
                nickname: fromUser?.nickname || fromUser?.username || '该账户已注销',
                avatar: fromUser?.avatar || DEFAULT_AVATAR
            };
        });
}

function getDmMessageById(id) {
    const mid = parseInt(id);
    if (Number.isNaN(mid)) return null;
    if (!fs.existsSync(DM_DIR)) return null;
    const files = fs.readdirSync(DM_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
        const p = path.join(DM_DIR, f);
        try {
            const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (!Array.isArray(arr)) continue;
            const msg = arr.find(m => Number(m.id) === mid);
            if (msg) return dmDecryptMessage(msg);
        } catch (e) {  }
    }
    return null;
}

function updateDmMessage(id, updates) {
    const msg = getDmMessageById(id);
    if (!msg) return null;
    const fromId = Number(msg.from_user_id);
    const toId = Number(msg.to_user_id);
    const list = loadDmConversation(fromId, toId);
    const idx = list.findIndex(m => Number(m.id) === Number(id));
    if (idx === -1) return null;
    Object.assign(list[idx], updates);
    try {
        saveDmConversation(fromId, toId, list);
    } catch (err) {
        console.error('saveDmConversation failed:', err);
        return null;
    }
    return list[idx];
}

function insertDmMessage({ from_user_id, to_user_id, content, image, voice, reply_to }) {
    const fromId = parseInt(from_user_id);
    const toId = parseInt(to_user_id);
    if (!normalizePair(fromId, toId)) return null;
    const list = loadDmConversation(fromId, toId);
    const nextId = list.length > 0 ? Math.max(...list.map(m => Number(m.id))) + 1 : 1;
    const newMessage = {
        id: nextId,
        from_user_id: fromId,
        to_user_id: toId,
        content: content || '',
        image: image || null,
        voice: voice || null,
        reply_to: reply_to != null ? parseInt(reply_to) : null,
        is_recalled: false,
        recalled_at: null,
        deleted_for: [],
        created_at: new Date().toISOString()
    };
    list.push(newMessage);
    saveDmConversation(fromId, toId, list);
    return newMessage;
}

function deleteDmMessage(messageId, requestedByUserId) {
    const msg = getDmMessageById(messageId);
    if (!msg) return false;
    const uid = parseInt(requestedByUserId);
    if (Number(msg.from_user_id) !== uid) return false;
    const created = new Date(msg.created_at).getTime();
    if (Number.isNaN(created) || (Date.now() - created) / (1000 * 60) > 2) return false;
    const fromId = Number(msg.from_user_id);
    const toId = Number(msg.to_user_id);
    const list = loadDmConversation(fromId, toId).filter(m => Number(m.id) !== Number(messageId));
    saveDmConversation(fromId, toId, list);
    return true;
}

/** 永久删除已撤回的私聊消息（供 5 分钟后定时清理，无需校验用户与时间） */
function removeRecalledDmMessageById(messageId) {
    const msg = getDmMessageById(messageId);
    if (!msg || !msg.is_recalled) return false;
    const fromId = Number(msg.from_user_id);
    const toId = Number(msg.to_user_id);
    const list = loadDmConversation(fromId, toId).filter(m => Number(m.id) !== Number(messageId));
    saveDmConversation(fromId, toId, list);
    return true;
}

function deleteDmMessageForUser(messageId, userId) {
    const msg = getDmMessageById(messageId);
    if (!msg) return { ok: false };
    const uid = parseInt(userId);
    if (Number(msg.from_user_id) !== uid && Number(msg.to_user_id) !== uid) return { ok: false };
    const fromId = Number(msg.from_user_id);
    const toId = Number(msg.to_user_id);
    const list = loadDmConversation(fromId, toId);
    const idx = list.findIndex(m => Number(m.id) === Number(messageId));
    if (idx === -1) return { ok: false };
    const m = list[idx];
    if (!Array.isArray(m.deleted_for)) m.deleted_for = [];
    if (!m.deleted_for.includes(uid)) m.deleted_for.push(uid);
    list[idx] = m;
    saveDmConversation(fromId, toId, list);
    return { ok: true, conversation_key: getConversationKey(fromId, toId) };
}

function clearDmConversationForUser(userIdA, userIdB, userId) {
    const uid = parseInt(userId);
    if (Number.isNaN(uid)) return { ok: false };
    const list = loadDmConversation(userIdA, userIdB);
    for (let i = 0; i < list.length; i++) {
        if (!Array.isArray(list[i].deleted_for)) list[i].deleted_for = [];
        if (!list[i].deleted_for.includes(uid)) list[i].deleted_for.push(uid);
    }
    saveDmConversation(userIdA, userIdB, list);
    return { ok: true, conversation_key: getConversationKey(userIdA, userIdB) };
}

function resetAllMessages() {
    messages.length = 0;
    if (fs.existsSync(MESSAGES_DIR)) {
        fs.readdirSync(MESSAGES_DIR).filter(f => f.endsWith('.json')).forEach(f => {
            try { fs.unlinkSync(path.join(MESSAGES_DIR, f)); } catch (e) { }
        });
    }
    const oldMessagesFile = path.join(DATA_DIR, 'messages.json');
    if (fs.existsSync(oldMessagesFile)) {
        try { fs.unlinkSync(oldMessagesFile); } catch (e) { }
    }
    const oldDmFile = path.join(DATA_DIR, 'dm_messages.json');
    if (fs.existsSync(oldDmFile)) fs.unlinkSync(oldDmFile);
    if (fs.existsSync(DM_DIR)) {
        fs.readdirSync(DM_DIR).filter(f => f.endsWith('.json')).forEach(f => {
            try { fs.unlinkSync(path.join(DM_DIR, f)); } catch (e) { }
        });
    }
    clearTimestamps = { channel: {}, dm: {} };
    saveClearTimestamps(clearTimestamps);
    saveData();
}

module.exports = {
    users,
    messages,
    channels,
    friends,
    friendRequests,
    getUsers,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    getUserByIdentifier,
    insertUser,
    updateUser,
    deleteUser,
    addDeactivationRequest,
    getDeactivationLock,
    getDeactivationRequestByUserId,
    getDeactivationRequestById,
    getDeactivationRequests,
    updateDeactivationRequestStatus,
    getMessagesByChannel,
    getMessageById,
    insertMessage,
    updateMessage,
    deleteMessage,
    purgeRecalledChannelMessagesOlderThan,
    purgeRecalledDmMessagesOlderThan,
    areFriends,
    getFriends,
    addFriendship,
    removeFriendship,
    createFriendRequest,
    getIncomingFriendRequests,
    respondFriendRequest,
    getDmMessagesBetween,
    getDmMessageById,
    updateDmMessage,
    insertDmMessage,
    deleteDmMessage,
    removeRecalledDmMessageById,
    deleteDmMessageForUser,
    clearDmConversationForUser,
    getConversationKey,
    saveData,
    resetAllMessages,
    getChannelClearTime,
    setChannelClearTime,
    getDmClearTime,
    setDmClearTime,
    clearDmDataBetween,
    isBlocked,
    addBlock,
    removeBlock,
    getBlockedUserIds
};