const crypto = require('crypto');
const fs = require('fs');
const path = require('path');


const certDir = path.join(__dirname, 'cert');
if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir);
}


const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});


const createSelfSignedCert = () => {
    
    const cert = {
        version: 3,
        serial: crypto.randomBytes(16).toString('hex'),
        issuer: {
            C: 'CN',
            ST: 'Local',
            L: 'Local',
            O: 'LAN Chat',
            CN: 'localhost'
        },
        subject: {
            C: 'CN',
            ST: 'Local',
            L: 'Local',
            O: 'LAN Chat',
            CN: 'localhost'
        },
        notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        extensions: [
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },
                    { type: 7, ip: '127.0.0.1' },
                    { type: 7, ip: '192.168.1.1' },
                    { type: 7, ip: '192.168.0.1' }
                ]
            }
        ]
    };

    
    
    
    const certContent = `-----BEGIN CERTIFICATE-----
${publicKey.split('\n').slice(1, -2).join('')}
-----END CERTIFICATE-----`;

    return certContent;
};


const certificate = createSelfSignedCert();


fs.writeFileSync(path.join(certDir, 'server.key'), privateKey);
fs.writeFileSync(path.join(certDir, 'server.crt'), certificate);

console.log('证书生成成功！');
console.log(`私钥: ${path.join(certDir, 'server.key')}`);
console.log(`证书: ${path.join(certDir, 'server.crt')}`);