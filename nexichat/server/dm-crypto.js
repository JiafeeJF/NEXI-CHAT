/**
 * 私聊内容存储加密：使用 AES-256-GCM 对落库的 content 加密，保护隐私。
 * 密钥通过环境变量 DM_ENCRYPTION_KEY（32 字节 hex 或 32 字符字符串）配置，未设置时使用开发默认（勿用于生产）。
 */
const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const PREFIX = 'enc:';

function getKey() {
    const raw = process.env.DM_ENCRYPTION_KEY;
    if (raw && raw.length >= KEY_LEN) {
        if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_LEN * 2) {
            return Buffer.from(raw, 'hex');
        }
        return crypto.createHash('sha256').update(raw).digest();
    }
    return crypto.createHash('sha256').update('nexichat-dm-default-dev-key').digest();
}

const key = getKey();

function encrypt(plainText) {
    if (plainText == null || String(plainText) === '') return '';
    const text = String(plainText);
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, enc, tag]);
    return PREFIX + combined.toString('base64');
}

function decrypt(cipherText) {
    if (cipherText == null || String(cipherText) === '') return '';
    const s = String(cipherText);
    if (!s.startsWith(PREFIX)) return s;
    try {
        const buf = Buffer.from(s.slice(PREFIX.length), 'base64');
        if (buf.length < IV_LEN + TAG_LEN) return s;
        const iv = buf.subarray(0, IV_LEN);
        const tag = buf.subarray(buf.length - TAG_LEN);
        const data = buf.subarray(IV_LEN, buf.length - TAG_LEN);
        const decipher = crypto.createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN });
        decipher.setAuthTag(tag);
        return decipher.update(data) + decipher.final('utf8');
    } catch (e) {
        return s;
    }
}

module.exports = { encrypt, decrypt };
