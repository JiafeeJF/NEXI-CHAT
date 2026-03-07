const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        try {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        } catch (e) {
            console.error('[log] 无法创建日志目录:', e.message);
        }
    }
}

function getDateSuffix() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getAuditLogPath() {
    return path.join(LOG_DIR, `audit-${getDateSuffix()}.log`);
}

function getChatLogPath() {
    return path.join(LOG_DIR, `chat-${getDateSuffix()}.log`);
}

function getErrorLogPath() {
    return path.join(LOG_DIR, `error-${getDateSuffix()}.log`);
}

function writeLog(filePath, logData) {
    ensureLogDir();
    const logLine = JSON.stringify(logData) + '\n';
    try {
        fs.appendFileSync(filePath, logLine, 'utf8');
    } catch (err) {
        console.error('[log] 写入失败:', filePath, err.message);
    }
}

function auditLog(action, userId, details = {}) {
    const logData = {
        timestamp: new Date().toISOString(),
        action,
        userId,
        details
    };
    writeLog(getAuditLogPath(), logData);
}

function chatLog(channel, userId, content, messageType, details = {}) {
    const logData = {
        timestamp: new Date().toISOString(),
        channel,
        userId,
        content,
        messageType,
        details
    };
    writeLog(getChatLogPath(), logData);
}

function errorLog(error, context = {}) {
    const logData = {
        timestamp: new Date().toISOString(),
        error: {
            message: error.message,
            stack: error.stack
        },
        context
    };
    writeLog(getErrorLogPath(), logData);
    console.error('Error:', error);
    console.error('Context:', context);
}

module.exports = {
    auditLog,
    chatLog,
    errorLog,
    getDateSuffix,
    getAuditLogPath,
    getChatLogPath,
    getErrorLogPath
};
