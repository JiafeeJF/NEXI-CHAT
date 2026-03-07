const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`服务器状态码: ${res.statusCode}`);
  console.log('服务器正在运行!');
  process.exit(0);
});

req.on('error', (e) => {
  console.error(`无法连接到服务器: ${e.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('连接超时，服务器可能未运行');
  req.destroy();
  process.exit(1);
});

req.end();
