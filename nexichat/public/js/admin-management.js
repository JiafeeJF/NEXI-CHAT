const logoutBtn = document.getElementById('logoutBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const adminPasswordForm = document.getElementById('adminPasswordForm');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmNewPassword = document.getElementById('confirmNewPassword');

let adminUserListCache = [];

window.addEventListener('DOMContentLoaded', async () => {
    const adminToken = localStorage.getItem('adminToken');
    const isAdmin = localStorage.getItem('isAdmin');
    if (!adminToken || !isAdmin) {
        window.location.href = '/admin-login.html';
        return;
    }
    adminPasswordForm.addEventListener('submit', handleAdminPasswordChange);
    loadAdminUsers();
    loadDeactivationRequests();
    var searchEl = document.getElementById('adminUserSearch');
    if (searchEl) searchEl.addEventListener('input', filterAdminUserList);
    var resetBtn = document.getElementById('adminResetMessagesBtn');
    if (resetBtn) resetBtn.addEventListener('click', handleResetMessages);
    var deactivationRefreshBtn = document.getElementById('adminDeactivationRefreshBtn');
    if (deactivationRefreshBtn) deactivationRefreshBtn.addEventListener('click', loadDeactivationRequests);
    var deactivationReasonModal = document.getElementById('deactivationReasonModal');
    var deactivationReasonModalClose = document.getElementById('deactivationReasonModalClose');
    function closeDeactivationReasonModal() {
        if (deactivationReasonModal) deactivationReasonModal.classList.remove('show');
    }
    if (deactivationReasonModalClose) deactivationReasonModalClose.addEventListener('click', closeDeactivationReasonModal);
    if (deactivationReasonModal) deactivationReasonModal.addEventListener('click', function(e) { if (e.target === deactivationReasonModal) closeDeactivationReasonModal(); });

    var socketOrigin = window.API_ORIGIN || (window.location.port === '3001' ? (window.location.protocol + '//' + window.location.hostname + ':3000') : window.location.origin);
    var adminSocket = io(socketOrigin, { reconnection: true, reconnectionAttempts: 5 });
    adminSocket.on('connect', function () {
        adminSocket.emit('adminJoin', adminToken, function (err) {
            if (err) return;
        });
    });
    adminSocket.on('deactivationRequestNew', function () {
        loadDeactivationRequests();
    });
    adminSocket.on('deactivationRequestUpdated', function () {
        loadDeactivationRequests();
    });
});

logoutBtn.addEventListener('click', () => {
    
    localStorage.removeItem('adminToken');
    localStorage.removeItem('isAdmin');
    
    
    window.location.href = '/admin-login.html';
});

async function fetchChannelMembers(channel, container) {
    try {
        const adminToken = localStorage.getItem('adminToken');
        
        const response = await fetch(`/api/channel/${channel}/members`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取成员列表失败');
        }
        
        const members = await response.json();
        if (container) renderMembers(members, container, channel);
        
    } catch (error) {
        showError(`获取${channel}成员列表失败: ${error.message}`);
    }
}

function renderMembers(members, container, channel) {
    if (!container) return;
    if (members.length === 0) {
        container.innerHTML = '<div class="no-members">当前频道暂无成员</div>';
        return;
    }
    
    container.innerHTML = members.map(member => `
        <div class="member-item" data-user-id="${member.id}">
            <div class="member-info">
                <div class="member-avatar">${member.username.charAt(0).toUpperCase()}</div>
                <span class="member-username">${member.username}</span>
            </div>
            <button class="remove-btn" onclick="removeMember(${member.id}, '${channel}')">移除</button>
        </div>
    `).join('');
}

async function removeMember(userId, channel) {
    if (!confirm('确定要将该用户从频道中移除吗？')) {
        return;
    }
    
    try {
        const adminToken = localStorage.getItem('adminToken');
        
        const response = await fetch(`/api/channel/${channel}/members/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '移除成员失败');
        }
        
        
        await fetchChannelMembers(channel, null);
        
        showSuccess('成员移除成功');
        
    } catch (error) {
        showError(`移除成员失败: ${error.message}`);
    }
}

async function loadAdminUsers() {
    const tbody = document.getElementById('adminUserListBody');
    if (!tbody) return;
    try {
        const adminToken = localStorage.getItem('adminToken');
        if (!adminToken) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc3545;">未登录或登录已过期，请重新登录管理后台</td></tr>';
            return;
        }
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!response.ok) {
            let msg = '获取用户列表失败';
            try {
                const data = await response.json();
                if (data && data.error) msg = data.error;
            } catch (_) {}
            if (response.status === 401 || response.status === 403) {
                msg = msg + '（请重新登录管理后台）';
            }
            throw new Error(msg);
        }
        const users = await response.json();
        adminUserListCache = users;
        filterAdminUserList();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc3545;">加载失败: ' + escapeHtml(e.message || '') + '</td></tr>';
    }
}

function filterAdminUserList() {
    var searchEl = document.getElementById('adminUserSearch');
    var tbody = document.getElementById('adminUserListBody');
    if (!tbody) return;
    var q = (searchEl && searchEl.value) ? searchEl.value.trim().toLowerCase() : '';
    var users = adminUserListCache;
    if (q) {
        users = users.filter(function(u) {
            var id = String(u.id || '');
            var username = String(u.username || '').toLowerCase();
            var nickname = String(u.nickname || '').toLowerCase();
            return id.indexOf(q) !== -1 || username.indexOf(q) !== -1 || nickname.indexOf(q) !== -1;
        });
    }
    renderAdminUserList(users, tbody);
}

function renderAdminUserList(users, tbody) {
    if (!tbody) return;
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--admin-text-secondary);">暂无用户</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.id}</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.nickname || '-')}</td>
            <td><span class="admin-badge ${u.banned ? 'admin-badge-banned' : 'admin-badge-normal'}">${u.banned ? '已封禁' : '正常'}</span></td>
            <td>
                ${u.banned
                    ? `<button type="button" class="admin-btn unban-btn" data-user-id="${u.id}" data-username="${escapeAttr(u.username)}">解封</button>`
                    : `<button type="button" class="admin-btn ban-btn" data-user-id="${u.id}" data-username="${escapeAttr(u.username)}">封禁</button>`
                }
                <button type="button" class="admin-btn delete-user-btn" data-user-id="${u.id}" data-username="${escapeAttr(u.username)}">删除</button>
            </td>
        </tr>
    `).join('');
    tbody.querySelectorAll('.ban-btn').forEach(btn => {
        btn.addEventListener('click', () => banUser(parseInt(btn.dataset.userId, 10)));
    });
    tbody.querySelectorAll('.unban-btn').forEach(btn => {
        btn.addEventListener('click', () => unbanUser(parseInt(btn.dataset.userId, 10)));
    });
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(parseInt(btn.dataset.userId, 10), btn.dataset.username || ''));
    });
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function banUser(userId) {
    if (!confirm('确定要封禁该用户吗？封禁后该用户将无法登录和发送消息。')) return;
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/users/' + userId + '/ban', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '封禁失败');
        showSuccess(data.message || '用户已封禁');
        loadAdminUsers();
    } catch (e) {
        showError('封禁失败: ' + (e.message || ''));
    }
}

async function unbanUser(userId) {
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/users/' + userId + '/unban', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '解封失败');
        showSuccess(data.message || '用户已解封');
        loadAdminUsers();
    } catch (e) {
        showError('解封失败: ' + (e.message || ''));
    }
}

async function deleteUser(userId, username) {
    if (!confirm('确定要删除用户「' + (username || userId) + '」吗？删除后该用户将从系统中移除，无法恢复。')) return;
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/users/' + userId, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '删除失败');
        showSuccess(data.message || '用户已删除');
        loadAdminUsers();
    } catch (e) {
        showError('删除失败: ' + (e.message || ''));
    }
}

async function loadDeactivationRequests() {
    const tbody = document.getElementById('adminDeactivationListBody');
    if (!tbody) return;
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/deactivation-requests', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || '获取注销申请列表失败');
        }
        const data = await response.json();
        const requests = data.requests || [];
        window._lastDeactivationRequests = requests;
        if (requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--admin-text-secondary);">暂无注销申请</td></tr>';
            return;
        }
        const statusText = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
        tbody.innerHTML = requests.map(r => {
            const userDisplay = (r.nickname || r.username || '-') + (r.username ? ' (@' + escapeHtml(r.username) + ')' : '');
            const actions = r.status === 'pending'
                ? `<button type="button" class="admin-btn admin-btn-primary admin-deactivation-approve" data-id="${r.id}">通过</button>
                   <button type="button" class="admin-btn admin-btn-ghost admin-deactivation-reject" data-id="${r.id}">拒绝</button>`
                : '-';
            return `<tr>
                <td>${r.id}</td>
                <td>${escapeHtml(userDisplay)} (ID: ${r.user_id})</td>
                <td><button type="button" class="admin-btn admin-btn-ghost admin-deactivation-view-reason" data-id="${r.id}">查看</button></td>
                <td>${statusText[r.status] || r.status}</td>
                <td>${r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '-'}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.admin-deactivation-approve').forEach(btn => {
            btn.addEventListener('click', () => respondDeactivationRequest(parseInt(btn.dataset.id, 10), 'approve'));
        });
        tbody.querySelectorAll('.admin-deactivation-reject').forEach(btn => {
            btn.addEventListener('click', () => respondDeactivationRequest(parseInt(btn.dataset.id, 10), 'reject'));
        });
        tbody.querySelectorAll('.admin-deactivation-view-reason').forEach(btn => {
            btn.addEventListener('click', () => {
                const list = window._lastDeactivationRequests || [];
                const req = list.find(x => x.id === parseInt(btn.dataset.id, 10));
                const body = document.getElementById('deactivationReasonModalBody');
                const modal = document.getElementById('deactivationReasonModal');
                if (body) body.textContent = req && req.reason ? req.reason : '无';
                if (modal) modal.classList.add('show');
            });
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #dc3545;">' + escapeHtml(e.message || '加载失败') + '</td></tr>';
    }
}

async function respondDeactivationRequest(id, action) {
    const msg = action === 'approve' ? '通过后将删除该用户账号，确定通过？' : '确定拒绝该注销申请？';
    if (!confirm(msg)) return;
    try {
        const adminToken = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/deactivation-requests/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ action })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '操作失败');
        showSuccess(data.message || (action === 'approve' ? '已通过并注销该用户' : '已拒绝'));
        loadDeactivationRequests();
        loadAdminUsers();
    } catch (e) {
        showError((e.message || '操作失败'));
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    successMessage.classList.remove('show');
    setTimeout(() => { errorMessage.classList.remove('show'); }, 3000);
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.add('show');
    errorMessage.classList.remove('show');
    setTimeout(() => { successMessage.classList.remove('show'); }, 3000);
}

async function handleResetMessages() {
    if (!confirm('确定要清空全部频道与私聊消息吗？此操作不可恢复。')) return;
    try {
        var token = localStorage.getItem('adminToken');
        var res = await fetch('/api/admin/reset-messages', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || '操作失败');
        showSuccess(data.message || '已清空全部消息');
    } catch (e) {
        showError('清空失败: ' + (e.message || ''));
    }
}

async function handleAdminPasswordChange(e) {
    e.preventDefault();
    
    
    if (newPassword.value !== confirmNewPassword.value) {
        showError('新密码和确认密码不匹配');
        return;
    }
    
    try {
        const adminToken = localStorage.getItem('adminToken');
        
        const response = await fetch('/api/admin/password', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword: currentPassword.value,
                newPassword: newPassword.value
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            const msg = data.error || '更改密码失败';
            const hint = data.hint ? ` ${data.hint}` : '';
            showError(msg + hint);
            return;
        }
        
        const result = await response.json();
        showSuccess(result.message);
        adminPasswordForm.reset();
        
    } catch (error) {
        showError(`更改密码失败: ${error.message}`);
    }
}

const logFileSelect = document.getElementById('logFileSelect');
const logSearchInput = document.getElementById('logSearchInput');
const logSearchBtn = document.getElementById('logSearchBtn');
const logList = document.getElementById('logList');
const logPrevPage = document.getElementById('logPrevPage');
const logNextPage = document.getElementById('logNextPage');
const logTotal = document.getElementById('logTotal');
const logCurrentPage = document.getElementById('logCurrentPage');
const logTotalPages = document.getElementById('logTotalPages');

let currentLogState = {
    filename: '',
    search: '',
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1
};

async function loadLogFiles() {
    try {
        const adminToken = localStorage.getItem('adminToken');
        
        const response = await fetch('/api/admin/logs/list', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '加载日志文件列表失败');
        }
        
        const result = await response.json();
        
        
        logFileSelect.innerHTML = '';
        
        if (result.logFiles.length === 0) {
            logFileSelect.innerHTML = '<option value="">暂无日志文件</option>';
            return;
        }
        
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '请选择日志文件';
        logFileSelect.appendChild(defaultOption);
        
        
        result.logFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file.filename;
            option.textContent = `${file.filename} (${formatFileSize(file.size)})`;
            logFileSelect.appendChild(option);
        });
        
    } catch (error) {
        showError(`加载日志文件列表失败: ${error.message}`);
        logFileSelect.innerHTML = '<option value="">加载失败，请刷新页面重试</option>';
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function searchLogs(resetPage) {
    const filename = logFileSelect.value;
    const search = (logSearchInput && logSearchInput.value) ? logSearchInput.value : '';
    const logTypeSelect = document.getElementById('logTypeSelect');
    const logLimitSelect = document.getElementById('logLimitSelect');
    const type = (logTypeSelect && logTypeSelect.value) ? logTypeSelect.value : '';
    const limit = (logLimitSelect && logLimitSelect.value) ? parseInt(logLimitSelect.value, 10) : 50;
    if (!filename) {
        showError('请选择日志文件');
        return;
    }
    currentLogState.filename = filename;
    currentLogState.search = search;
    if (resetPage !== false) currentLogState.page = 1;
    currentLogState.limit = limit;
    logList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--admin-text-secondary); font-size: 13px;">加载中...</div>';
    try {
        const adminToken = localStorage.getItem('adminToken');
        const params = new URLSearchParams({
            search: search,
            page: currentLogState.page,
            limit: limit
        });
        if (type) params.set('type', type);
        const response = await fetch(`/api/admin/logs/content/${filename}?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '查询日志失败');
        }
        
        const result = await response.json();
        
        
        currentLogState.total = result.total;
        currentLogState.totalPages = result.totalPages;
        currentLogState.page = result.page;
        
        
        renderLogList(result.logs);
        
        
        updatePagination();
        
    } catch (error) {
        showError(`查询日志失败: ${error.message}`);
        logList.innerHTML = `<div style="text-align: center; padding: 40px; color: #dc3545; font-style: italic;">${error.message}</div>`;
    }
}

var logTypeLabels = {
    chat: '聊天',
    audit: '审计',
    user_login: '登录',
    user_register: '注册',
    user_connect: '连接',
    user_disconnect: '断开',
    message_recall: '撤回',
    dm_message_recall: '私聊撤回',
    message_blocked: '屏蔽'
};

function getLogTypeInfo(log) {
    if (log.channel != null) return { type: 'chat', label: '聊天', cls: 'log-type-chat' };
    var action = (log.action || '').toLowerCase();
    var cls = 'log-type-default';
    if (action in logTypeLabels) cls = 'log-type-' + action;
    return { type: action || 'audit', label: logTypeLabels[action] || action || '审计', cls: cls };
}

function formatLogTime(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    var now = Date.now();
    var diff = (now - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return d.toLocaleString('zh-CN');
}

function renderLogList(logs) {
    if (logs.length === 0) {
        logList.innerHTML = '<div style="text-align: center; padding: 48px 16px; color: var(--admin-text-secondary); font-size: 13px;">没有找到匹配的日志记录</div>';
        return;
    }
    window._lastLogDetails = logs.map(log => JSON.stringify(log, null, 2));
    logList.innerHTML = logs.map((log, i) => {
        var timeStr = log.timestamp ? new Date(log.timestamp).toLocaleString('zh-CN') : '-';
        var timeRel = log.timestamp ? formatLogTime(log.timestamp) : '-';
        var info = getLogTypeInfo(log);
        var userId = log.userId != null ? log.userId : '-';
        var channel = log.channel != null ? log.channel : '-';
        var content = '';
        if (info.type === 'chat') {
            content = log.content || '';
            if (log.messageType === 'image') content = '[图片] ' + content;
            else if (log.messageType === 'voice') content = '[语音] ' + content;
        } else {
            content = log.message || log.content || (log.details && typeof log.details === 'object' ? JSON.stringify(log.details) : '') || '';
        }
        var truncated = content.length > 80 ? content.substring(0, 80) + '…' : content;
        return `
            <div class="admin-log-row" data-log-index="${i}">
                <div style="width:14%;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;" title="${escapeAttr(timeStr)}">${escapeHtml(timeRel)}</div>
                <div style="width:10%;flex-shrink:0;"><span class="log-type-badge ${info.cls}">${info.label}</span></div>
                <div style="width:10%;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(userId))}</div>
                <div style="width:10%;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(String(channel))}</div>
                <div style="width:41%;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;word-break:break-all;">${escapeHtml(truncated)}</div>
                <div style="width:15%;flex-shrink:0;text-align:center;">
                    <button type="button" class="admin-btn admin-btn-ghost log-detail-btn" style="padding:4px 10px;font-size:12px;">详情</button>
                </div>
            </div>
        `;
    }).join('');
    logList.querySelectorAll('.log-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            var row = btn.closest('.admin-log-row');
            var idx = parseInt(row && row.dataset.logIndex, 10);
            if (!isNaN(idx) && window._lastLogDetails && window._lastLogDetails[idx]) showLogDetails(window._lastLogDetails[idx]);
        });
    });
}

function showLogDetails(detailsJson) {
    var modal = document.getElementById('logDetailModal');
    var pre = document.getElementById('logDetailPre');
    if (pre) pre.textContent = detailsJson;
    if (modal) modal.classList.add('show');
}

function closeLogDetailModal() {
    var modal = document.getElementById('logDetailModal');
    if (modal) modal.classList.remove('show');
}

function copyLogDetail() {
    var pre = document.getElementById('logDetailPre');
    if (!pre || !pre.textContent) return;
    navigator.clipboard.writeText(pre.textContent).then(function() {
        if (typeof showSuccess === 'function') showSuccess('已复制到剪贴板');
    }).catch(function() {
        if (typeof showError === 'function') showError('复制失败');
    });
}

function updatePagination() {
    logTotal.textContent = currentLogState.total;
    logCurrentPage.textContent = currentLogState.page;
    logTotalPages.textContent = currentLogState.totalPages;

    logPrevPage.disabled = currentLogState.page === 1;
    logNextPage.disabled = currentLogState.page === currentLogState.totalPages;
}

function goToPrevPage() {
    if (currentLogState.page > 1) {
        currentLogState.page--;
        searchLogs(false);
    }
}

function goToNextPage() {
    if (currentLogState.page < currentLogState.totalPages) {
        currentLogState.page++;
        searchLogs(false);
    }
}

function initLogManagement() {
    loadLogFiles();
    if (logSearchBtn) logSearchBtn.addEventListener('click', searchLogs);
    if (logPrevPage) logPrevPage.addEventListener('click', goToPrevPage);
    if (logNextPage) logNextPage.addEventListener('click', goToNextPage);
    if (logSearchInput) logSearchInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchLogs(); });
    if (logFileSelect) logFileSelect.addEventListener('change', function() { currentLogState.page = 1; if (logFileSelect.value) searchLogs(); });
    var logDetailModal = document.getElementById('logDetailModal');
    var logDetailCloseBtn = document.getElementById('logDetailCloseBtn');
    var logDetailCopyBtn = document.getElementById('logDetailCopyBtn');
    if (logDetailCloseBtn) logDetailCloseBtn.addEventListener('click', closeLogDetailModal);
    if (logDetailCopyBtn) logDetailCopyBtn.addEventListener('click', copyLogDetail);
    if (logDetailModal) logDetailModal.addEventListener('click', function(e) { if (e.target === logDetailModal) closeLogDetailModal(); });
}

window.addEventListener('DOMContentLoaded', () => {
    initLogManagement();
});