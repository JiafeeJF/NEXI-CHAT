const BAD_WORDS = require('./badwords.json');

function containsBadWords(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    
    const lowerText = text.toLowerCase();
    return BAD_WORDS.some(word => lowerText.includes(word.toLowerCase()));
}
function filterBadWords(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    
    let filteredText = text;
    BAD_WORDS.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredText = filteredText.replace(regex, '*'.repeat(word.length));
    });
    
    return filteredText;
}
module.exports = {
    containsBadWords,
    filterBadWords
};