const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const app = express();
const proxy = require('express-http-proxy');
const apiProxy = proxy('http://localhost:3000', {
    proxyReqPathResolver: (req) => {
        const path = req.originalUrl;
        console.log('Proxying API request to:', path);
        return path;
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy error: ' + err.message);
    },
    filter: (req, res) => {
        return req.path.startsWith('/api');
    }
});

const PORT = process.env.FRONTEND_PORT || 3001;

console.log('Current working directory:', __dirname);

const publicDir = path.join(__dirname, '..', 'public');
console.log('Public directory:', publicDir);

if (!fs.existsSync(publicDir)) {
    console.error('Public directory does not exist:', publicDir);
} else {
    console.log('Public directory exists, containing files:', fs.readdirSync(publicDir).slice(0, 10).join(', '));
}

app.use(apiProxy);

app.use(express.static(publicDir));

app.get('/', (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    console.log('Serving index.html at:', indexPath);
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

app.get('/login', (req, res) => {
    const loginPath = path.join(publicDir, 'login.html');
    console.log('Serving login.html at:', loginPath);
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        res.status(404).send('login.html not found');
    }
});

app.get('/register', (req, res) => {
    const registerPath = path.join(publicDir, 'register.html');
    console.log('Serving register.html at:', registerPath);
    if (fs.existsSync(registerPath)) {
        res.sendFile(registerPath);
    } else {
        res.status(404).send('register.html not found');
    }
});

app.get('*', (req, res) => {
    const filePath = path.join(publicDir, req.path);

    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
        console.log('Serving static file:', filePath);
        res.sendFile(filePath);
    } else {
        console.log('Resource not found:', filePath);
        res.status(404).send('Not found');
    }
});

const httpServer = http.createServer(app);
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let lanIp = null;

for (const ifaceName in networkInterfaces) {
    const interfaces = networkInterfaces[ifaceName];
    for (const iface of interfaces) {
        if (!iface.internal && iface.family === 'IPv4') {
            lanIp = iface.address;
            break;
        }
    }
    if (lanIp) break;
}

httpServer.listen(PORT, '0.0.0.0', () => {
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
});

process.on('SIGINT', () => {
    console.log('Frontend server shutting down...');
    process.exit(0);
});
