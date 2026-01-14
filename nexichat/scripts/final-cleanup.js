const fs = require('fs');
const path = require('path');


const tempFiles = [
    'check-port.js',
    'cleanup.js'
];


function deleteFile(fileName) {
    try {
        const filePath = path.join(__dirname, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`✅ 已删除临时文件: ${fileName}`);
        } else {
            console.log(`⚠️ 临时文件不存在: ${fileName}`);
        }
    } catch (error) {
        console.error(`❌ 删除临时文件失败 ${fileName}: ${error.message}`);
    }
}


console.log('清理临时文件...');
tempFiles.forEach(deleteFile);
console.log('临时文件清理完成！');