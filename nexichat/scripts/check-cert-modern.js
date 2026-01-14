const fs = require('fs');
const crypto = require('crypto');


const certPath = './cert/cert.crt';
const certBuffer = fs.readFileSync(certPath);


const certificate = new crypto.X509Certificate(certBuffer);


function getSAN(certificate) {
    try {
        
        if (certificate.subjectAltName) {
            return certificate.subjectAltName;
        }
        
        
        const pem = certificate.toString('pem');
        const sanMatch = pem.match(/X509v3 Subject Alternative Name:([\s\S]*?)(?=X509v3|-----END)/i);
        
        if (sanMatch && sanMatch[1]) {
            return sanMatch[1].trim();
        }
        
        return '未找到Subject Alternative Name扩展';
    } catch (error) {
        console.error('解析证书扩展时出错:', error.message);
        return '解析失败';
    }
}


function checkSANInclusion(sanValue, domains) {
    console.log('\n检查证书是否包含以下域名/IP:');
    
    for (const domain of domains) {
        
        if (sanValue.includes(domain)) {
            console.log(`✓ ${domain} - 包含`);
        } else {
            console.log(`✗ ${domain} - 不包含`);
        }
    }
}

console.log('===== 证书Subject Alternative Name (SAN)检查 =====');
console.log('证书版本:', certificate.version);
console.log('证书序列号:', certificate.serialNumber);
console.log('证书颁发者:', certificate.issuer);
console.log('证书主体:', certificate.subject);


const san = getSAN(certificate);
console.log('Subject Alternative Name (SAN):', san);


const commonLocalAddresses = [
    'localhost',
    '127.0.0.1',
    '192.168.1.1',
    '192.168.0.1',
    '192.168.10.18'
];

checkSANInclusion(san, commonLocalAddresses);

console.log('\n===== 证书有效期 =====');
console.log('有效期开始:', certificate.validFrom);
console.log('有效期结束:', certificate.validTo);
console.log('证书是否过期:', certificate.expired);