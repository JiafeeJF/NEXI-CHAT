/**
 * 供接口与测试共用的校验逻辑
 */
const FRIEND_REASON_MAX_LENGTH = 200;
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function validateUsername(username) {
    const s = typeof username === 'string' ? username.trim() : '';
    if (s.length < USERNAME_MIN_LENGTH) return { ok: false, error: '用户名至少 ' + USERNAME_MIN_LENGTH + ' 个字符' };
    if (s.length > USERNAME_MAX_LENGTH) return { ok: false, error: '用户名最多 ' + USERNAME_MAX_LENGTH + ' 个字符' };
    if (!USERNAME_REGEX.test(s)) return { ok: false, error: '用户名只能包含字母、数字和下划线' };
    return { ok: true, value: s };
}

function validatePassword(password) {
    const s = typeof password === 'string' ? password : '';
    if (s.length < PASSWORD_MIN_LENGTH) return { ok: false, error: '密码至少 ' + PASSWORD_MIN_LENGTH + ' 位' };
    if (s.length > PASSWORD_MAX_LENGTH) return { ok: false, error: '密码最多 ' + PASSWORD_MAX_LENGTH + ' 位' };
    if (!/[a-zA-Z]/.test(s)) return { ok: false, error: '密码须包含字母' };
    if (!/[0-9]/.test(s)) return { ok: false, error: '密码须包含数字' };
    return { ok: true };
}

function validateFriendReason(message) {
    if (message == null || message === '') return { ok: true, value: null };
    const s = String(message).trim();
    if (s.length > FRIEND_REASON_MAX_LENGTH) return { ok: false, error: '添加理由最多 ' + FRIEND_REASON_MAX_LENGTH + ' 字' };
    return { ok: true, value: s || null };
}

function validateDeactivationReason(reason) {
    const s = reason == null ? '' : String(reason).trim();
    if (!s) return { ok: false, error: '请填写注销理由' };
    if (s.length > FRIEND_REASON_MAX_LENGTH) return { ok: false, error: '注销理由最多 ' + FRIEND_REASON_MAX_LENGTH + ' 字' };
    return { ok: true, value: s };
}

module.exports = {
    validateUsername,
    validatePassword,
    validateFriendReason,
    validateDeactivationReason,
    FRIEND_REASON_MAX_LENGTH,
    USERNAME_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH
};
