const fs = require('fs');


const certPath = './cert/cert.crt';
const cert = fs.readFileSync(certPath, 'utf8');


function extractSAN(cert) {
    
    const sanRegex = /X509v3 Subject Alternative Name:/g;
    const matches = cert.match(sanRegex);
    
    if (matches && matches.length > 0) {
        
        const sanStartIndex = cert.indexOf('X509v3 Subject Alternative Name:');
        if (sanStartIndex !== -1) {
            
            let sanContent = '';
            const lines = cert.substring(sanStartIndex).split('\n');
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line && !line.startsWith(' ')) {
                    break;
                }
                sanContent += line;
            }
            
            return sanContent;
        }
    }
    
    
    console.log('未找到X509v3 Subject Alternative Name字段，尝试从主体中提取...');
    
    
    const subjectRegex = /Subject:.*$/m;
    const subjectMatch = cert.match(subjectRegex);
    
    if (subjectMatch) {
        return subjectMatch[0];
    }
    
    return '未找到SAN信息';
}


function checkSANInclusion(cert, domains) {
    console.log('\n检查证书是否包含以下域名/IP:');
    
    for (const domain of domains) {
        if (cert.includes(domain)) {
            console.log(`✓ ${domain} - 包含`);
        } else {
            console.log(`✗ ${domain} - 不包含`);
        }
    }
}

console.log('===== 证书Subject Alternative Name (SAN)检查 =====');
const san = extractSAN(cert);
console.log('提取到的SAN信息:');
console.log(san);


const commonLocalAddresses = [
    'localhost',
    '127.0.0.1',
    '192.168.1.1',
    '192.168.0.1',
    '192.168.10.18'  
];

checkSANInclusion(cert, commonLocalAddresses);

console.log('\n===== 证书完整信息（前500字符）=====');
console.log(cert.substring(0, 500) + '...');
