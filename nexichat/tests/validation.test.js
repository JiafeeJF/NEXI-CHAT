/**
 * 校验逻辑单元测试（用户名、密码、添加理由）
 * 运行: npm test 或 node --test tests/validation.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    validateUsername,
    validatePassword,
    validateFriendReason,
    USERNAME_MIN_LENGTH,
    USERNAME_MAX_LENGTH,
    FRIEND_REASON_MAX_LENGTH
} = require('../server/validation');

describe('validateUsername', () => {
    it('通过：合法用户名', () => {
        assert.strictEqual(validateUsername('alice').ok, true);
        assert.strictEqual(validateUsername('alice').value, 'alice');
        assert.strictEqual(validateUsername('user_1').value, 'user_1');
        assert.strictEqual(validateUsername('  bob  ').value, 'bob');
    });

    it('拒绝：过短', () => {
        const r = validateUsername('a');
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('至少'));
    });

    it('拒绝：过长', () => {
        const long = 'a'.repeat(USERNAME_MAX_LENGTH + 1);
        const r = validateUsername(long);
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('最多'));
    });

    it('拒绝：非法字符', () => {
        assert.strictEqual(validateUsername('user-name').ok, false);
        assert.strictEqual(validateUsername('用户').ok, false);
        assert.strictEqual(validateUsername('a b').ok, false);
    });
});

describe('validatePassword', () => {
    it('通过：含字母和数字且长度>=8', () => {
        assert.strictEqual(validatePassword('password1').ok, true);
        assert.strictEqual(validatePassword('Abc12345').ok, true);
    });

    it('拒绝：过短', () => {
        const r = validatePassword('Abc1234');
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('至少'));
    });

    it('拒绝：无字母', () => {
        const r = validatePassword('12345678');
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('字母'));
    });

    it('拒绝：无数字', () => {
        const r = validatePassword('abcdefgh');
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('数字'));
    });
});

describe('validateFriendReason', () => {
    it('通过：空或 null', () => {
        assert.strictEqual(validateFriendReason(null).ok, true);
        assert.strictEqual(validateFriendReason('').ok, true);
        assert.strictEqual(validateFriendReason('  ').value, null);
    });

    it('通过：200 字以内', () => {
        const r = validateFriendReason('你好，想加个好友');
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.value, '你好，想加个好友');
        const max = 'x'.repeat(FRIEND_REASON_MAX_LENGTH);
        assert.strictEqual(validateFriendReason(max).ok, true);
    });

    it('拒绝：超过 200 字', () => {
        const over = 'x'.repeat(FRIEND_REASON_MAX_LENGTH + 1);
        const r = validateFriendReason(over);
        assert.strictEqual(r.ok, false);
        assert.ok(r.error.includes('200'));
    });
});
