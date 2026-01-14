const fs = require('fs');
const { execSync } = require('child_process');


const certPath = './cert/cert.crt';
const keyPath = './cert/cert.key';

console.log('检查证书文件是否存在:');
console.log('证书文件存在:', fs.existsSync(certPath));
console.log('密钥文件存在:', fs.existsSync(keyPath));

if (fs.existsSync(certPath)) {
    console.log('\n证书文件大小:', fs.statSync(certPath).size, 'bytes');
    const certContent = fs.readFileSync(certPath, 'utf8');
    console.log('证书格式检查:');
    console.log('包含BEGIN CERTIFICATE:', certContent.includes('-----BEGIN CERTIFICATE-----'));
    console.log('包含END CERTIFICATE:', certContent.includes('-----END CERTIFICATE-----'));
    
    
    const certCount = (certContent.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
    console.log('证书链中的证书数量:', certCount);
}

if (fs.existsSync(keyPath)) {
    console.log('\n密钥文件大小:', fs.statSync(keyPath).size, 'bytes');
    const keyContent = fs.readFileSync(keyPath, 'utf8');
    console.log('密钥格式检查:');
    console.log('包含BEGIN RSA PRIVATE KEY:', keyContent.includes('-----BEGIN RSA PRIVATE KEY-----'));
    console.log('包含END RSA PRIVATE KEY:', keyContent.includes('-----END RSA PRIVATE KEY-----'));
}


console.log('\n测试证书和密钥是否可以正常加载:');
try {
    const https = require('https');
    const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
    
    
    const server = https.createServer(options, (req, res) => {
        res.writeHead(200);
        res.end('HTTPS测试成功!');
    });
    
    
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        console.log(`证书加载成功! 可以在端口 ${address.port} 上使用HTTPS`);
        server.close();
    });
    
} catch (error) {
    console.log('证书加载失败:', error.message);
    if (error.code === 'ERR_OSSL_X509_INVALID_PEM_ENCODING') {
        console.log('可能的原因: PEM格式错误或证书/密钥损坏');
    } else if (error.code === 'ERR_OSSL_PEM_NO_START_LINE') {
        console.log('可能的原因: 证书/密钥文件缺少BEGIN标记或格式错误');
    }
}
