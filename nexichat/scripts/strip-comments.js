const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
    path.join(ROOT, 'scripts', 'reset-data.js'),
    path.join(ROOT, 'scripts', 'strip-comments.js'),
    path.join(ROOT, 'scripts', 'frontend-server.js'),
    path.join(ROOT, 'scripts', 'generate-cert.js'),
    path.join(ROOT, 'scripts', 'generate-cert-proper.js'),
    path.join(ROOT, 'scripts', 'final-cleanup.js'),
    path.join(ROOT, 'scripts', 'check-server.js'),
    path.join(ROOT, 'scripts', 'check-cert.js'),
    path.join(ROOT, 'scripts', 'check-cert-san.js'),
    path.join(ROOT, 'scripts', 'check-cert-modern.js'),
    path.join(ROOT, 'server', 'db.js'),
    path.join(ROOT, 'server', 'log.js'),
    path.join(ROOT, 'server', 'badwords.js'),
    path.join(ROOT, 'index.js'),
    path.join(ROOT, 'public', 'js', 'chat.js'),
    path.join(ROOT, 'public', 'js', 'admin-management.js'),
    path.join(ROOT, 'public', 'css', 'style.css'),
    path.join(ROOT, 'public', 'index.html'),
    path.join(ROOT, 'public', 'admin.html'),
    path.join(ROOT, 'public', 'toggle-slider-test.html')
];

function stripJs(content) {
    let s = content;
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.replace(/^\s*\/\/[^\n]*\n/gm, '\n');
    const lines = s.split('\n');
    const out = lines.map(line => {
        const idx = line.indexOf('//');
        if (idx === -1) return line;
        const before = line.slice(0, idx);
        const inString = (before.match(/'/g) || []).length % 2 === 1 || (before.match(/"/g) || []).length % 2 === 1;
        if (inString) return line;
        if (/^\s*$/.test(before)) return '';
        return before.replace(/\s+$/, '');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

function stripCss(content) {
    return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

function stripHtml(content) {
    return content.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

FILES.forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    const ext = path.extname(filePath);
    let content = fs.readFileSync(filePath, 'utf8');
    if (ext === '.js') content = stripJs(content);
    else if (ext === '.css') content = stripCss(content);
    else if (ext === '.html') content = stripHtml(content);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Stripped:', filePath);
});

console.log('Done.');
