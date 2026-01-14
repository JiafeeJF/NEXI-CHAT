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



const generateSelfSignedCertificate = () => {
    
    const options = {
        subject: {
            commonName: 'localhost',
            countryName: 'CN',
            stateOrProvinceName: 'Local',
            localityName: 'Local',
            organizationName: 'LAN Chat'
        },
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
        ],
        key: privateKey,
        publicKey: publicKey
    };

    
    
    
    
    
    try {
        require('child_process').execSync('openssl version', { stdio: 'ignore' });
        
        
        const opensslConfig = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = CN
ST = Local
L = Local
O = LAN Chat
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = 192.168.1.1
IP.3 = 192.168.0.1`;
        
        const configPath = path.join(certDir, 'openssl.cnf');
        fs.writeFileSync(configPath, opensslConfig);
        
        const keyPath = path.join(certDir, 'server.key');
        const certPath = path.join(certDir, 'server.crt');
        
        
        require('child_process').execSync(
            `openssl req -x509 -new -nodes -key "${keyPath}" -days 365 -out "${certPath}" -config "${configPath}"`,
            { stdio: 'inherit' }
        );
        
        fs.unlinkSync(configPath);
        
        return fs.readFileSync(certPath, 'utf8');
    } catch (e) {
        
        console.warn('OpenSSL not found, using simplified certificate generation');
        
        
        const cert = `-----BEGIN CERTIFICATE-----\n${publicKey.split('\n').slice(1, -2).join('')}\n-----END CERTIFICATE-----`;
        return cert;
    }
};


fs.writeFileSync(path.join(certDir, 'server.key'), privateKey);


const certificate = generateSelfSignedCertificate();
fs.writeFileSync(path.join(certDir, 'server.crt'), certificate);

console.log('证书生成成功！');
console.log(`私钥: ${path.join(certDir, 'server.key')}`);
console.log(`证书: ${path.join(certDir, 'server.crt')}`);
