const currentUser = checkLogin();
if (!currentUser) {
    window.location.href = 'login.html';
}

const socketUrl = 'http://localhost:3000';

const socket = io(socketUrl, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

console.log('Socket.io连接配置:', {
    url: socketUrl
});

socket.on('connect', () => {
    console.log('Socket.io连接成功');
});

socket.on('disconnect', () => {
    console.log('Socket.io连接断开');
    showNotification('网络连接已断开，正在尝试重新连接...', 'warning');
});

socket.on('connect_error', (error) => {
    console.error('Socket.io连接错误:', error);
    showNotification('连接服务器时出错', 'error');
});

socket.on('reconnect', (attemptNumber) => {
    console.log(`Socket.io重新连接成功，尝试次数: ${attemptNumber}`);
    showNotification('网络连接已恢复', 'success');
});

socket.on('reconnect_failed', () => {
    console.error('Socket.io重新连接失败');
    showNotification('无法重新连接到服务器，请刷新页面', 'error');
});

let currentChannel = '';

let currentReplyTo = null;

let hasMicrophone = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let isRecordingTimeout = false;
const MAX_RECORDING_DURATION = 60;

async function checkMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        hasMicrophone = true;
        stream.getTracks().forEach(track => track.stop());
        console.log('麦克风检测成功');
    } catch (error) {
        hasMicrophone = false;
        console.log('麦克风检测失败:', error);
    }
    return hasMicrophone;
}

async function startRecording() {
    try {
        console.log('浏览器API支持情况:');
        console.log('navigator.mediaDevices:', navigator.mediaDevices);
        console.log('navigator.mediaDevices.getUserMedia:', navigator.mediaDevices ? navigator.mediaDevices.getUserMedia : '未定义');
        console.log('window.MediaRecorder:', window.MediaRecorder);

        if (!navigator.mediaDevices) {
            console.error('不支持 navigator.mediaDevices API');
            showNotification('您的浏览器不支持语音录制功能，请升级到最新版本', 'error');
            return;
        }

        if (!navigator.mediaDevices.getUserMedia) {
            console.error('不支持 navigator.mediaDevices.getUserMedia API');
            showNotification('您的浏览器不支持语音录制功能，请升级到最新版本', 'error');
            return;
        }

        if (!window.MediaRecorder) {
            console.error('不支持 window.MediaRecorder API');
            showNotification('您的浏览器不支持语音录制功能，请升级到最新版本', 'error');
            return;
        }

        if (typeof MediaRecorder.isTypeSupported !== 'function') {
            console.warn('浏览器不支持MediaRecorder.isTypeSupported方法，将使用默认MIME类型');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let mimeType = 'audio/webm;codecs=opus';
        const supportedMimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ];

        if (typeof MediaRecorder.isTypeSupported === 'function') {
            for (const type of supportedMimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    mimeType = type;
                    console.log('使用支持的MIME类型:', mimeType);
                    break;
                }
            }
        } else {
            console.log('使用默认MIME类型:', mimeType);
        }

        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (error) {
            console.warn('使用指定MIME类型失败，使用默认设置:', error);
            mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder._stream = stream;

        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('MediaRecorder stop event triggered');
            if (mediaRecorder._stream) {
                mediaRecorder._stream.getTracks().forEach(track => track.stop());
                console.log('释放麦克风资源');
            }
            const voiceBtn = document.getElementById('voiceBtn');
            voiceBtn.classList.remove('recording');
            voiceBtn.textContent = '🎤';
            if (isRecordingTimeout) {
                showNotification('录制已达最大时长60秒，已自动停止', 'info');
                isRecordingTimeout = false;
            }
            if (audioChunks.length > 0) {
                processRecordedAudio();
            }
        };

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder错误:', event.error);
            showNotification('录制过程中发生错误', 'error');
            stopRecording();
        };

        mediaRecorder.start();
        console.log('开始录制语音');

        recordingTimer = setTimeout(() => {
            console.log('录制时长已达60秒，自动停止');
            isRecordingTimeout = true;
            stopRecording();
        }, MAX_RECORDING_DURATION * 1000);

        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '⏺️';

    } catch (error) {
        console.error('录制语音失败:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('请允许访问麦克风', 'error');
        } else if (error.name === 'NotFoundError') {
            showNotification('未找到麦克风设备', 'error');
        } else if (error.name === 'NotReadableError') {
            showNotification('麦克风被占用', 'error');
        } else {
            showNotification('无法开始录制语音', 'error');
        }
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        console.log('停止录制语音');
    }
    if (recordingTimer) {
        clearTimeout(recordingTimer);
        recordingTimer = null;
    }
}

async function isAudioSilent(audioBlob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContext.decodeAudioData(e.target.result, (buffer) => {
                const channelData = buffer.getChannelData(0);

                let sum = 0;
                for (let i = 0; i < channelData.length; i++) {
                    sum += Math.abs(channelData[i]);
                }
                const average = sum / channelData.length;

                const silenceThreshold = 0.01;
                resolve(average < silenceThreshold);
            }, () => {
                resolve(false);
            });
        };
        reader.readAsArrayBuffer(audioBlob);
    });
}

async function processRecordedAudio() {
    try {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

        const isSilent = await isAudioSilent(audioBlob);
        if (isSilent) {
            showNotification('未检测到声音，请重新录制', 'warning');
            return;
        }

        await sendVoiceMessage(audioBlob);

    } catch (error) {
        console.error('处理音频失败:', error);
        showNotification('处理语音消息失败', 'error');
    }
}



async function sendVoiceMessage(audioBlob) {
    try {
        uploadProgress.textContent = '上传中...';

        let fileExtension = 'webm';
        if (audioBlob.type.includes('ogg')) {
            fileExtension = 'ogg';
        }

        const formData = new FormData();
        formData.append('voice', audioBlob, `voice.${fileExtension}`);
        formData.append('userId', currentUser.id);

        const response = await fetch('/api/upload/voice', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            socket.emit('sendMessage', {
                userId: currentUser.id,
                channel: currentChannel,
                content: null,
                voice: data.voice,
                reply_to: currentReplyTo
            });

            uploadProgress.textContent = '上传成功';
            setTimeout(() => {
                uploadProgress.textContent = '';
            }, 1000);

            cancelReply();
        } else {
            uploadProgress.textContent = '上传失败';
            setTimeout(() => {
                uploadProgress.textContent = '';
            }, 1000);
        }
    } catch (error) {
        console.error('发送语音消息失败:', error);
        showNotification('发送语音消息失败', 'error');
        uploadProgress.textContent = '上传失败';
        setTimeout(() => {
            uploadProgress.textContent = '';
        }, 1000);
    }
}

let notificationSettings = {
    soundEnabled: true,
    selectedChannels: ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel105']
};


function loadNotificationSettings() {
    console.log('=== loadNotificationSettings 函数被调用 ===');
    console.log('当前时间:', new Date().toISOString());

    const savedSettings = localStorage.getItem('notificationSettings');
    console.log('从本地存储获取的设置:', savedSettings);

    if (savedSettings) {
        try {
            notificationSettings = JSON.parse(savedSettings);
            console.log('成功从本地存储加载设置:', JSON.stringify(notificationSettings));

            if (notificationSettings.soundEnabled === undefined) {
                console.log('soundEnabled 未定义，设置默认值为 true');
                notificationSettings.soundEnabled = true;
            }

            if (!Array.isArray(notificationSettings.selectedChannels)) {
                console.log('selectedChannels 不是数组，设置默认值');
                notificationSettings.selectedChannels = ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel105'];
            }

            saveNotificationSettings();
        } catch (error) {
            console.error('加载通知设置失败:', error);
            console.log('使用默认设置');
            notificationSettings = {
                soundEnabled: true,
                selectedChannels: ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel105']
            };
            saveNotificationSettings();
        }
    } else {
        console.log('本地存储中没有设置，使用默认值并保存');
        notificationSettings = {
            soundEnabled: true,
            selectedChannels: ['General', 'Technology', 'Gaming', 'Music', 'Random', 'Channel105']
        };
        saveNotificationSettings();
    }

    updateNotificationSettingsUI();

    console.log('当前 notificationSettings:', JSON.stringify(notificationSettings));
}


let notificationAudio = null;

function initNotificationAudio() {
    try {
        const audioPath = 'aud/ts.mp3';
        notificationAudio = new Audio(audioPath);
        notificationAudio.volume = 1.0;
        notificationAudio.preload = 'auto';

        notificationAudio.loop = false;

        notificationAudio.addEventListener('loadeddata', () => {
            console.log('提示音音频加载完成');
        });

        notificationAudio.addEventListener('error', (e) => {
            console.error('提示音音频加载错误:', e);
            console.error('错误代码:', e.target.error.code);
            notificationAudio = null;
        });

        console.log('提示音音频对象初始化成功');
    } catch (error) {
        console.error('初始化提示音音频对象失败:', error);
        notificationAudio = null;
    }
}

function playNotificationSound() {
    console.log('=== playNotificationSound 函数被调用 ===');
    console.log('当前时间:', new Date().toISOString());
    console.log('notificationSettings 对象:', JSON.stringify(notificationSettings));
    console.log('soundEnabled 状态:', notificationSettings.soundEnabled);

    if (!notificationSettings.soundEnabled) {
        console.log('提示音未启用，不播放');
        return;
    }

    try {
        if (!notificationAudio) {
            console.log('音频对象不存在，立即初始化');
            initNotificationAudio();
        }

        if (notificationAudio) {
            notificationAudio.currentTime = 0;

            console.log('正在尝试播放音频');
            notificationAudio.play().then(() => {
                console.log('音频播放成功！');
            }).catch(error => {
                console.error('播放提示音失败:', error);
                console.error('错误类型:', error.name);
                console.error('错误消息:', error.message);

                if (error.name === 'NotAllowedError' || error.name === 'NotSupportedError') {
                    console.log('浏览器阻止了自动播放，请求用户交互');
                    showNotification('请先与页面交互以启用通知声音', 'info');
                } else if (error.name === 'NetworkError') {
                    console.error('网络错误导致音频无法加载');
                    showNotification('音频文件加载失败，请检查网络连接', 'error');
                    notificationAudio = null;
                } else if (error.name === 'AbortError') {
                    console.error('音频播放被中止');
                }
            });
        }
    } catch (error) {
        console.error('播放提示音时发生错误:', error);
        notificationAudio = null;
    }
}

function preloadAudioAndRequestPermission() {
    try {
        initNotificationAudio();

        if (notificationAudio) {
            notificationAudio.volume = 0;

            notificationAudio.play().then(() => {
                console.log('获得音频播放权限');
                notificationAudio.pause();
                notificationAudio.currentTime = 0;
                notificationAudio.volume = 1.0;
            }).catch(error => {
                console.log('需要用户交互来获得音频播放权限:', error.message);
                notificationAudio.volume = 1.0;
            });
        }

        console.log('音频预加载完成');
    } catch (error) {
        console.error('预加载音频失败:', error);
    }
}

function showBrowserNotification(title, message) {
    if (!('Notification' in window)) {
        console.log('浏览器不支持通知功能');
        return;
    }

    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: 'images/logo.png',
            requireInteraction: false,
            tag: 'chat-notification'
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, {
                    body: message,
                    icon: 'images/icon.png',
                    requireInteraction: false,
                    tag: 'chat-notification'
                });
            }
        });
    }
}

function saveNotificationSettings() {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
}

function updateNotificationSettingsUI() {
    const notificationSoundCheckbox = document.getElementById('notificationSound');
    if (notificationSoundCheckbox) {
        notificationSoundCheckbox.checked = notificationSettings.soundEnabled;
    }



    const channelCheckboxes = document.querySelectorAll('.channel-notification-item input[type="checkbox"]');
    channelCheckboxes.forEach(checkbox => {
        checkbox.checked = notificationSettings.selectedChannels.includes(checkbox.value);
    });
}



const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageUpload = document.getElementById('imageUpload');
const uploadProgress = document.getElementById('uploadProgress');
const channelItems = document.querySelectorAll('.channel-item');
const currentChannelName = document.getElementById('currentChannelName');
const currentChannelIcon = document.getElementById('currentChannelIcon');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');
const settingsPanel = document.getElementById('settingsPanel');
const userAvatar = document.getElementById('userAvatar');
const userAvatarMobile = document.getElementById('userAvatarMobile')
const username = document.getElementById('username');
const usernameMobile = document.getElementById('usernameMobile')
const userBio = document.getElementById('userBio');
const userBioMobile = document.getElementById('userBioMobile');
const logoutBtn = document.getElementById('logoutBtn');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const settingsUsername = document.getElementById('settingsUsername');
const settingsNickname = document.getElementById('settingsNickname');
const settingsBio = document.getElementById('settingsBio');
const settingsGender = document.getElementById('settingsGender');
const settingsEmail = document.getElementById('settingsEmail');
const saveSettings = document.getElementById('saveSettings');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const emojiGrid = document.querySelector('.emoji-grid');
const nav = document.getElementById('mobileNav');

const changePasswordBtn = document.getElementById('changePasswordBtn');
const passwordChangePanel = document.getElementById('passwordChangePanel');
const closePasswordPanel = document.getElementById('closePasswordPanel');
const cancelPasswordChange = document.getElementById('cancelPasswordChange');
const passwordChangeForm = document.getElementById('passwordChangeForm');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');

console.log('密码更改相关DOM元素获取结果:');
console.log('changePasswordBtn:', changePasswordBtn);
console.log('passwordChangePanel:', passwordChangePanel);
console.log('closePasswordPanel:', closePasswordPanel);
console.log('cancelPasswordChange:', cancelPasswordChange);
console.log('passwordChangeForm:', passwordChangeForm);

console.log('DOM元素获取结果:');
console.log('settingsPanel:', settingsPanel);
console.log('closeSettings:', closeSettings);
console.log('settingsBtn:', settingsBtn);

function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<p class="message">${message}</p>`;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

function initPage() {
    settingsPanel.classList.remove('open');

    updateUserInfo();

    preloadAudioAndRequestPermission();

    messagesContainer.innerHTML = `
        <div style="
            text-align: center;
            padding: 80px 30px;
            color: #6e6e73;
            font-size: 24px;
            font-weight: 600;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 10px;
            background: linear-gradient(135deg, rgba(240,242,245,0.5) 0%, rgba(255,255,255,1) 100%);
        ">
            <div style="
                position: relative;
                display: inline-block;
            ">
                <img id="emptyPageImage" 
                    src="images/logo2.png" 
                    alt="NEXI CHAT Logo" 
                    style="
                        width: 300px;
                        height: 300px;
                        object-fit: contain;
                        display: block;
                        visibility: visible;
                        opacity: 1;
                        border: none;
                        outline: none;
                        box-shadow: none;
                        background: transparent;
                    "
                >
                <div style="
                    content: '';
                    position: absolute;
                    top: 40%;
                    left: 0;
                    width: 100%;
                    height: 80%;
                    background-image: url('images/logo2.png');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    transform: scaleY(-1);
                    opacity: 0.8;
                    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
                    -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0));
                    animation: reflectionFadeIn 1.5s ease-out forwards;
                "></div>
            </div>
            <style>
                @keyframes reflectionFadeIn {
                    0% {
                        top: 0%;
                        height: 100%;
                        opacity: 0;
                    }
                    100% {
                        top: 40%;
                        height: 80%;
                        opacity: 0.8;
                    }
                }
            </style>
            <div style="
                max-width: 400px;
                line-height: 1.6;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="font-size: 34px; color: #333; font-weight: 700; letter-spacing: -0.5px;">欢迎使用 NEXI CHAT</div>
                <div style="margin-top: 10px; font-size: 18px; color: #8e8e93; font-weight: 400;">请从左侧选择一个频道开始聊天</div>
            </div>
        </div>
    `;



    currentChannelName.textContent = '请选择频道';
    currentChannelIcon.textContent = '';

    const messageInputContainer = document.querySelector('.message-input-container');
    messageInputContainer.style.display = 'none';

    loadNotificationSettings();

    setupNotificationEventListeners();

    setupVoiceButtonEventListeners();

}

function setupNotificationEventListeners() {
    const notificationSoundCheckbox = document.getElementById('notificationSound');
    if (notificationSoundCheckbox) {
        notificationSoundCheckbox.addEventListener('change', (e) => {
            notificationSettings.soundEnabled = e.target.checked;
            saveNotificationSettings();
        });
    }



    const channelCheckboxes = document.querySelectorAll('.channel-notification-item input[type="checkbox"]');
    channelCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const channel = e.target.value;
            if (e.target.checked) {
                if (!notificationSettings.selectedChannels.includes(channel)) {
                    notificationSettings.selectedChannels.push(channel);
                }
            } else {
                notificationSettings.selectedChannels = notificationSettings.selectedChannels.filter(c => c !== channel);
            }
            saveNotificationSettings();
        });
    });
}

function setupVoiceButtonEventListeners() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;

    voiceBtn.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        try {
            await startRecording();
        } catch (error) {
            console.error('录制失败:', error);
            showNotification('无法开始录制，请检查麦克风权限', 'error');
        }
    });

    voiceBtn.addEventListener('mouseup', () => {
        stopRecording();
    });

    voiceBtn.addEventListener('mouseleave', () => {
        stopRecording();
    });

    voiceBtn.addEventListener('touchstart', async (e) => {
        e.preventDefault();
        try {
            await startRecording();
        } catch (error) {
            console.error('录制失败:', error);
            showNotification('无法开始录制，请检查麦克风权限', 'error');
        }
    });

    voiceBtn.addEventListener('touchend', () => {
        stopRecording();
    });
}

function updateUserInfo() {
    if (!currentUser) {
        console.error('currentUser is not defined');
        return;
    }

    if (username) {
        username.textContent = currentUser.nickname || currentUser.username;
    }

    if (usernameMobile) {
        usernameMobile.textContent = currentUser.nickname || currentUser.username;
    }

    if (userBio) {
        userBio.textContent = currentUser.bio ? currentUser.bio : '这个人很懒，什么也没留下';
    }

    if (userBioMobile) {
        userBioMobile.textContent = currentUser.bio ? currentUser.bio : '这个人很懒，什么也没留下';
    }

    if (userAvatar) {
        const avatarUrl = currentUser.avatar || 'images/default.png';
        userAvatar.src = avatarUrl;
    }

    if (userAvatarMobile) {
        const avatarUrl = currentUser.avatar || 'images/default.png';
        userAvatarMobile.src = avatarUrl;
    }

    if (settingsUsername) {
        settingsUsername.value = currentUser.username;
    }
    if (settingsNickname) {
        settingsNickname.value = currentUser.nickname || currentUser.username;
    }
    if (settingsBio) {
        settingsBio.value = currentUser.bio || '';
    }
    if (settingsGender) {
        settingsGender.value = currentUser.gender || 'other';
    }
    if (settingsEmail) {
        settingsEmail.value = currentUser.email || '';
    }
    if (avatarPreview) {
        const avatarUrl = currentUser.avatar || 'images/default.png';
        avatarPreview.src = avatarUrl;
    }

    console.log('User info updated:', {
        username: currentUser.username,
        bio: currentUser.bio,
        avatar: currentUser.avatar,
        gender: currentUser.gender
    });
}

function addMessageToDOM(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.user_id === currentUser.id ? 'sent' : 'received'}`;
    messageElement.dataset.messageId = message.id;

    const isCurrentUser = message.user_id === currentUser.id;
    const now = new Date();
    const messageTime = new Date(message.created_at);
    const timeDiff = (now - messageTime) / (1000 * 60);

    console.log('撤回按钮条件检查:', {
        messageId: message.id,
        isCurrentUser,
        timeDiff: timeDiff.toFixed(2),
        isRecalled: message.is_recalled,
        shouldShowRecallBtn: isCurrentUser && timeDiff <= 2 && !message.is_recalled
    });

    const messageAvatar = message.avatar || 'images/default.png';
    let messageContent = `
        <div class="avatar-container">
            <img src="${messageAvatar.includes('http') ? messageAvatar : messageAvatar}" alt="Avatar" class="avatar" onclick="openUserProfile(${message.user_id})">
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username">${message.nickname || message.username}</span>
            </div>
    `;



    if (message.reply_info) {
        const repliedContent = message.reply_info.content || '图片消息';
        messageContent += `<div class="message-reply" style="
            background-color: rgba(0, 113, 227, 0.05);
            border-left: 3px solid #0071e3;
            padding: 6px 10px;
            border-radius: 8px;
            margin-bottom: 6px;
            font-size: 13px;
        ">
            <span style="font-weight: bold; color: #0071e3;">@${message.reply_info.nickname || message.reply_info.username}</span>: ${repliedContent.length > 30 ? repliedContent.substring(0, 30) + '...' : repliedContent}
        </div>`;
    }

    if (message.content) {
        messageContent += `<div class="message-text">${message.content}</div>`;
    }

    if (message.image && !message.is_recalled) {
        messageContent += `<img src="${message.image}" alt="Chat image" class="message-image" onclick="viewImage(this)">`;
    }



    if (message.voice && !message.is_recalled) {
        const audioType = message.voice.endsWith('.ogg') ? 'audio/ogg' : 'audio/webm;codecs=opus';
        messageContent += `<div class="message-voice bubble">
            <div class="custom-audio-player" data-message-id="${message.id}">
                <audio id="audio-${message.id}" class="voice-player" preload="metadata">
                    <source src="${message.voice}" type="${audioType}">
                    您的浏览器不支持音频播放
                </audio>
                <div class="audio-controls">
                    <button class="play-btn" data-audio-id="${message.id}">
                        <span class="play-icon">▶</span>
                        <span class="pause-icon">⏸</span>
                    </button>
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                    </div>
                    <div class="time-display">
                        <span class="current-time">0:00</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    const actionButtons = [];

    actionButtons.push(`<button class="reply-btn" data-message-id="${message.id}" style="
        background: none;
        border: none;
        color: #0071e3;
        font-size: 14px;
        cursor: pointer;
        margin-top: 5px;
        padding: 2px 6px;
        border-radius: 10px;
        transition: all 0.3s ease;
        opacity: 0.7;
    ">💬</button>`);

    if (isCurrentUser && timeDiff <= 2 && !message.is_recalled) {
        actionButtons.push(`<button class="recall-btn" data-message-id="${message.id}" data-channel="${message.channel}" style="
            background: none;
            border: none;
            color: #ff3b30;
            font-size: 14px;
            cursor: pointer;
            margin-top: 5px;
            padding: 2px 6px;
            border-radius: 10px;
            transition: all 0.3s ease;
            opacity: 0.7;
            margin-left: 5px;
        ">🗑️</button>`);
    }

    if (actionButtons.length > 0) {
        messageContent += `<div class="message-actions">${actionButtons.join('')}</div>`;
    }


    messageContent += '</div>';
    messageElement.innerHTML = messageContent;

    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(10px)';

    messagesContainer.appendChild(messageElement);

    // 自动渲染 B 站链接，如果消息包含 BV 号或 bilibili 链接，渲染在气泡内（.message-text）
    try {
        const content = message.content;
        const bvid = window.BiliRenderer?.extractBV(content);

        if (content && !message.is_recalled && bvid) {
            // 提取链接中的参数
            let params = {};
            const urlMatch = content.match(/https?:\/\/[^\s]+/i); // 简单的非空白符匹配
            if (urlMatch) {
                try {
                    // 清理链接末尾可能的中文符号
                    const cleanUrl = urlMatch[0].replace(/[）〉】]$/g, '');
                    const urlObj = new URL(cleanUrl);

                    // 映射 B 站特有参数
                    urlObj.searchParams.forEach((v, k) => {
                        // 只有官方文档支持的参数才转换并传入
                        const supported = ['p', 't', 'autoplay', 'danmaku', 'muted'];
                        if (supported.includes(k)) {
                            params[k] = isNaN(Number(v)) ? v : Number(v);
                        }
                    });
                } catch (e) { /* 忽略无效 URL */ }
            }

            // 查找或创建容器
            const contentEl = messageElement.querySelector('.message-content');
            if (contentEl) {
                let textEl = contentEl.querySelector('.message-text') || (() => {
                    const div = document.createElement('div');
                    div.className = 'message-text';
                    const actions = contentEl.querySelector('.message-actions');
                    actions ? contentEl.insertBefore(div, actions) : contentEl.appendChild(div);
                    return div;
                })();

                // 渲染
                const biliContainer = document.createElement('div');
                biliContainer.className = 'bili-video';
                biliContainer.style.marginTop = '8px'; // 增加一点顶部间距

                const element = window.BiliRenderer.getElement(bvid, params);
                if (element) {
                    biliContainer.appendChild(element);
                    textEl.appendChild(biliContainer);
                }
            }
        }
    } catch (e) {
        console.error('B站渲染插件异常:', e);
    }

    setTimeout(() => {
        messageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        messageElement.style.opacity = '1';
        messageElement.style.transform = 'translateY(0)';
    }, 10);

    scrollToBottom();
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}



function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

function replyToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const username = messageElement.querySelector('.message-username').textContent;
    const content = messageElement.querySelector('.message-text')?.textContent || '图片消息';

    currentReplyTo = messageId;

    let replyIndicator = document.getElementById('replyIndicator');
    if (!replyIndicator) {
        replyIndicator = document.createElement('div');
        replyIndicator.id = 'replyIndicator';
        replyIndicator.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background-color: #f0f0f0;
            border-radius: 8px 8px 0 0;
            font-size: 14px;
            color: #666;
            margin-bottom: -10px;
        `;

        messageInput.parentElement.insertBefore(replyIndicator, messageInput);
    }

    replyIndicator.innerHTML = `
        <span>回复 <strong>${username}</strong>: ${content.length > 20 ? content.substring(0, 20) + '...' : content}</span>
        <button id="cancelReply" style="
            background: none;
            border: none;
            color: #0071e3;
            font-size: 14px;
            cursor: pointer;
            padding: 2px 6px;
        ">取消</button>
    `;

    document.getElementById('cancelReply').addEventListener('click', cancelReply);

    messageInput.focus();
}

function cancelReply() {
    currentReplyTo = null;
    const replyIndicator = document.getElementById('replyIndicator');
    if (replyIndicator) {
        replyIndicator.remove();
    }
}

async function sendMessage() {
    const content = messageInput.value.trim();

    if (!content) {
        console.log('消息内容为空，不发送');
        return;
    }

    console.log('发送消息:', content);
    console.log('当前用户:', currentUser);
    console.log('当前用户ID:', currentUser?.id);
    console.log('当前频道:', currentChannel);
    console.log('当前回复的消息ID:', currentReplyTo);

    console.log('Socket连接状态:', socket.connected);

    if (!socket.connected) {
        console.error('Socket连接已断开，无法发送消息');
        showNotification('网络连接已断开，请刷新页面重试', 'error');
        return;
    }

    if (!currentUser?.id) {
        console.error('用户信息缺失，无法发送消息');
        showNotification('用户信息异常，请重新登录', 'error');
        return;
    }

    socket.emit('sendMessage', {
        userId: currentUser.id,
        channel: currentChannel,
        content: content,
        image: null,
        reply_to: currentReplyTo
    });

    console.log('消息已发送到服务器');


    messageInput.value = '';
    adjustTextareaHeight();

    cancelReply();

}

async function uploadImage(file) {
    uploadProgress.textContent = '上传中...';

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            socket.emit('sendMessage', {
                userId: currentUser.id,
                channel: currentChannel,
                content: null,
                image: data.image,
                reply_to: currentReplyTo
            });

            uploadProgress.textContent = '上传成功';
            setTimeout(() => {
                uploadProgress.textContent = '';
            }, 1000);

            cancelReply();
        } else {
            uploadProgress.textContent = '上传失败';
        }
    } catch (error) {
        uploadProgress.textContent = '上传失败';
    }
}



function showCustomConfirm(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        backdrop-filter: blur(2px);
    `;

    const popup = document.createElement('div');
    popup.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        animation: popupFadeIn 0.3s ease;
    `;

    const messageText = document.createElement('p');
    messageText.textContent = message;
    messageText.style.cssText = `
        font-size: 16px;
        color: #333;
        margin: 0 0 20px 0;
        line-height: 1.5;
        text-align: center;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        border: 1px solid #ccc;
        background: white;
        color: #666;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        border: none;
        background: #0071e3;
        color: white;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;

    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#f2f2f7';
    });

    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'white';
    });

    confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#0057b7';
        confirmBtn.style.transform = 'translateY(-1px)';
        confirmBtn.style.boxShadow = '0 4px 12px rgba(0, 113, 227, 0.4)';
    });

    confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#0071e3';
        confirmBtn.style.transform = 'translateY(0)';
        confirmBtn.style.boxShadow = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onCancel) onCancel();
    });

    confirmBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        if (onConfirm) onConfirm();
    });

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        }
    };

    overlay.addEventListener('keydown', handleKeyDown);
    cancelBtn.focus();

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    popup.appendChild(messageText);
    popup.appendChild(buttonContainer);
    overlay.appendChild(popup);

    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes popupFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        document.head.removeChild(style);
    }, 300);
}

function recallMessage(messageId, channel) {
    showCustomConfirm('确定要撤回这条消息吗？撤回后无法恢复。', () => {
        socket.emit('recallMessage', { messageId, channel });
    });
}

function viewImage(img) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        cursor: pointer;
    `;

    const modalImg = document.createElement('img');
    modalImg.src = img.src;
    modalImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 10px;
    `;

    modal.appendChild(modalImg);
    document.body.appendChild(modal);

    modal.onclick = () => {
        document.body.removeChild(modal);
    };
}



function updateCurrentUser(updates) {
    Object.assign(currentUser, updates);
    localStorage.setItem('user', JSON.stringify(currentUser));
}

async function openUserProfile(userId) {
    try {
        const response = await fetch(`/api/profile/${userId}`);
        const user = await response.json();

        if (user) {
            document.getElementById('profileAvatar').src = user.avatar || 'images/default.png';

            const profileUsername = document.getElementById('profileUsername');
            if (user.username === "jiafee") {
                profileUsername.innerHTML = `${user.nickname || user.username} <img src="images/blue.png" class="user-badge">`;
            } else {
                profileUsername.textContent = user.nickname || user.username;
            }

            document.getElementById('profileBio').textContent = user.bio || '该用户未设置个性签名';
            document.getElementById('profileGender').textContent = `性别: ${user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '其他'}`;
            document.getElementById('profileEmail').textContent = `邮箱: ${user.email || '该用户未设置邮箱'}`;
            document.getElementById('profileJoined').textContent = `加入时间: ${formatDate(user.created_at)}`;

            document.getElementById('userProfileModal').classList.add('show');
        }
    } catch (error) {
        console.error('获取用户资料失败:', error);
    }
}

function closeUserProfile() {
    document.getElementById('userProfileModal').classList.remove('show');
}



function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}


sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function adjustTextareaHeight(textarea = null) {
    const targetTextarea = textarea || messageInput;
    targetTextarea.style.height = 'auto';
    targetTextarea.style.height = Math.min(targetTextarea.scrollHeight, 150) + 'px';
}

messageInput.addEventListener('input', () => adjustTextareaHeight(messageInput));

if (settingsBio) {
    settingsBio.addEventListener('input', () => adjustTextareaHeight(settingsBio));
}

imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await uploadImage(file);
        imageUpload.value = '';
    }
});

adjustTextareaHeight();

messagesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('recall-btn')) {
        const messageId = parseInt(e.target.dataset.messageId);
        const channel = e.target.dataset.channel;
        recallMessage(messageId, channel);
    } else if (e.target.classList.contains('reply-btn')) {
        const messageId = parseInt(e.target.dataset.messageId);
        replyToMessage(messageId);
    }
});

messageInput.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            await uploadImage(file);
        }
    }

    setTimeout(adjustTextareaHeight, 0);
});



function showPasswordPrompt(channelName, channelId, onSuccess) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        backdrop-filter: blur(2px);
    `;

    const popup = document.createElement('div');
    popup.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        animation: popupFadeIn 0.3s ease;
    `;

    const title = document.createElement('h3');
    title.textContent = `进入 ${channelName}`;
    title.style.cssText = `
        font-size: 18px;
        color: #333;
        margin: 0 0 16px 0;
        text-align: center;
    `;

    const messageText = document.createElement('p');
    messageText.textContent = '该频道需要密码才能进入，请输入密码：';
    messageText.style.cssText = `
        font-size: 14px;
        color: #666;
        margin: 0 0 20px 0;
        line-height: 1.5;
        text-align: center;
    `;

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = '请输入频道密码';
    passwordInput.style.cssText = `
        width: 100%;
        padding: 12px;
        border: 1px solid #ccc;
        border-radius: 8px;
        font-size: 16px;
        margin-bottom: 16px;
        box-sizing: border-box;
    `;

    const errorMessage = document.createElement('div');
    errorMessage.style.cssText = `
        color: #ff3b30;
        font-size: 14px;
        margin-bottom: 16px;
        text-align: center;
        min-height: 20px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        border: 1px solid #ccc;
        background: white;
        color: #666;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '进入频道';
    confirmBtn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        border: none;
        background: #0071e3;
        color: white;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
    `;

    cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#f2f2f7';
    });

    cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'white';
    });

    confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#0057b7';
        confirmBtn.style.transform = 'translateY(-1px)';
        confirmBtn.style.boxShadow = '0 4px 12px rgba(0, 113, 227, 0.4)';
    });

    confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#0071e3';
        confirmBtn.style.transform = 'translateY(0)';
        confirmBtn.style.boxShadow = 'none';
    });

    async function verifyPassword() {
        const password = passwordInput.value.trim();
        if (!password) {
            errorMessage.textContent = '请输入密码';
            return;
        }

        try {
            const response = await fetch('/api/channel/verify-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    channel: channelId,
                    password: password,
                    userId: currentUser.id
                })
            });

            const data = await response.json();

            if (data.success) {
                document.body.removeChild(overlay);
                if (onSuccess) onSuccess();
            } else {
                errorMessage.textContent = '密码错误，请重试';
            }
        } catch (error) {
            errorMessage.textContent = '验证失败，请稍后重试';
        }
    }

    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    confirmBtn.addEventListener('click', verifyPassword);

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyPassword();
        }
    });

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
        }
    };

    overlay.addEventListener('keydown', handleKeyDown);
    passwordInput.focus();

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    popup.appendChild(title);
    popup.appendChild(messageText);
    popup.appendChild(passwordInput);
    popup.appendChild(errorMessage);
    popup.appendChild(buttonContainer);
    overlay.appendChild(popup);

    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes popupFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        document.head.removeChild(style);
    }, 300);
}

async function checkChannelAccess(channel) {
    try {
        const response = await fetch(`/api/channel/${channel}/access/${currentUser.id}`);
        const data = await response.json();
        return data.hasAccess;
    } catch (error) {
        return false;
    }
}

channelItems.forEach(item => {
    item.addEventListener('click', async () => {
        const channel = item.dataset.channel;
        const channelName = item.querySelector('.channel-name').textContent;

        if (channel === 'Channel105') {
            const hasAccess = await checkChannelAccess(channel);

            if (!hasAccess) {
                showPasswordPrompt(channelName, channel, () => {
                    switchChannel(item);
                });
                return;
            }
        }

        switchChannel(item);
    });
});

function switchChannel(item) {
    const activeChannel = document.querySelector('.channel-item.active');
    if (activeChannel) {
        activeChannel.classList.remove('active');
    }

    item.classList.add('active');

    currentChannel = item.dataset.channel;

    currentChannelName.textContent = item.querySelector('.channel-name').textContent;
    currentChannelIcon.textContent = item.querySelector('.channel-icon').textContent;

    socket.emit('joinChannel', currentChannel, currentUser.id);

    messagesContainer.innerHTML = '';

    const messageInputContainer = document.querySelector('.message-input-container');

    messageInputContainer.style.display = 'flex';

    loadMessages(currentChannel);


}

settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('open');
});

if (closeSettings) {
    closeSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.remove('open');
    });
}

window.addEventListener('click', (e) => {
    if (e.target === settingsPanel) {
        settingsPanel.classList.remove('open');
    }

    const profileModal = document.getElementById('userProfileModal');
    if (e.target === profileModal) {
        closeUserProfile();
    }


});

const closeProfileModal = document.getElementById('closeProfileModal');
if (closeProfileModal) {
    closeProfileModal.addEventListener('click', closeUserProfile);
}

if (userAvatar) {
    userAvatar.addEventListener('click', () => {
        if (currentUser) {
            openUserProfile(currentUser.id);
        }
    });
}



if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('open');
        passwordChangePanel.classList.add('open');
    });
}

function closePasswordChangePanel() {
    passwordChangePanel.classList.remove('open');
    settingsPanel.classList.add('open');
}

if (closePasswordPanel) {
    closePasswordPanel.addEventListener('click', (e) => {
        e.stopPropagation();
        closePasswordChangePanel();
    });
}

if (cancelPasswordChange) {
    cancelPasswordChange.addEventListener('click', () => {
        closePasswordChangePanel();
    });
}

window.addEventListener('click', (e) => {
    if (e.target === passwordChangePanel) {
        closePasswordChangePanel();
    }
});

if (passwordChangeForm) {
    passwordChangeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPass = currentPassword.value.trim();
        const newPass = newPassword.value.trim();
        const confirmPass = confirmPassword.value.trim();

        if (!currentPass) {
            showNotification('请输入当前密码', 'error');
            return;
        }

        if (!newPass) {
            showNotification('请输入新密码', 'error');
            return;
        }

        if (newPass !== confirmPass) {
            showNotification('新密码和确认密码不一致', 'error');
            return;
        }

        showCustomConfirm('确定要更改密码吗？', async () => {
            try {
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        currentPassword: currentPass,
                        newPassword: newPass
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showNotification('密码更改成功', 'success');

                    passwordChangeForm.reset();

                    closePasswordChangePanel();
                } else {
                    showNotification(data.message || '密码更改失败，请检查当前密码是否正确', 'error');
                }
            } catch (error) {
                console.error('密码更改失败:', error);
                showNotification('网络错误，请稍后重试', 'error');
            }
        });
    });
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

logoutBtn.addEventListener('click', () => {
    showCustomConfirm('确定要退出登录吗？', () => {
        logout();
    });
});

avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            avatarPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

saveSettings.addEventListener('click', async () => {
    const bio = settingsBio.value.trim();
    const gender = settingsGender.value;
    const email = settingsEmail.value.trim() || null;
    const nickname = settingsNickname.value.trim();

    const avatarFile = avatarInput.files[0];
    let avatarUrl = currentUser.avatar;

    if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        formData.append('userId', currentUser.id);

        try {
            const response = await fetch('/api/upload/avatar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                avatarUrl = data.avatar;
            }
        } catch (error) {
            console.error('上传头像失败:', error);
        }
    }

    try {
        const response = await fetch(`/api/profile/${currentUser.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bio, gender, email, nickname })
        });

        if (response.ok) {
            updateCurrentUser({ bio, gender, email, nickname, avatar: avatarUrl });
            updateUserInfo();

            const saveMsg = document.createElement('div');
            saveMsg.textContent = '设置已保存';
            saveMsg.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #34c759;
                color: white;
                padding: 12px 20px;
                border-radius: 10px;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
                z-index: 10000;
            `;
            document.body.appendChild(saveMsg);

            setTimeout(() => {
                document.body.removeChild(saveMsg);
            }, 2000);
        }
    } catch (error) {
        console.error('保存设置失败:', error);
    }
});


socket.on('messageReceived', (message) => {
    console.log('=== messageReceived 事件被触发 ===');
    console.log('当前时间:', new Date().toISOString());
    console.log('收到的消息:', JSON.stringify(message));
    console.log('当前频道:', currentChannel);
    console.log('是否为当前频道:', message.channel === currentChannel);

    if (message.is_blocked) {
        console.log('消息包含屏蔽词，准备存储到本地');
        if (parseInt(message.user_id) === parseInt(currentUser.id)) {
            saveBlockedMessage(message);
        }
    }

    if (message.channel === currentChannel) {
        console.log('消息在当前频道，添加到DOM');
        addMessageToDOM(message);

        setTimeout(reinitAudioPlayers, 100);
    } else {
        console.log('消息不在当前频道，检查是否需要通知');
    }

    const shouldNotify = message.channel !== currentChannel && notificationSettings.selectedChannels.includes(message.channel);
    console.log('是否需要发送浏览器通知:', shouldNotify);
    console.log('notificationSettings.selectedChannels:', notificationSettings.selectedChannels);
    console.log('message.channel 是否在 selectedChannels 中:', notificationSettings.selectedChannels.includes(message.channel));

    if (parseInt(message.user_id) !== parseInt(currentUser.id)) {
        console.log('调用 playNotificationSound 函数');
        playNotificationSound();
    } else {
        console.log('自己发送的消息，不播放提示音');
    }

    if (shouldNotify) {
        console.log('满足浏览器通知条件，准备发送通知');
        const title = `${message.nickname || message.username} 在 ${message.channel}`;
        const content = message.content || (message.image ? '发送了一张图片' : '发送了一条消息');
        console.log('通知内容:', { title, content });

        console.log('调用 showBrowserNotification 函数');
        showBrowserNotification(title, content);
    }

    console.log('消息接收事件详情:', {
        channel: message.channel,
        currentChannel: currentChannel,
        isCurrentChannel: message.channel === currentChannel,
        isSelectedChannel: notificationSettings.selectedChannels.includes(message.channel),
        notificationSettings: { ...notificationSettings }
    });
});

socket.on('messageBlocked', (data) => {
    console.log('=== messageBlocked 事件被触发 ===');
    console.log('收到的屏蔽消息数据:', data);
});

function saveBlockedMessage(message) {
    try {
        const blockedMessagesJson = localStorage.getItem('blockedMessages');
        const blockedMessages = blockedMessagesJson ? JSON.parse(blockedMessagesJson) : [];

        const blockedMessageWithExpiry = {
            ...message,
            storedAt: new Date().toISOString()
        };

        blockedMessages.push(blockedMessageWithExpiry);

        localStorage.setItem('blockedMessages', JSON.stringify(blockedMessages));

        console.log('被屏蔽消息已存储到本地:', blockedMessageWithExpiry);

        scheduleBlockedMessageDeletion(message.id, 24 * 60 * 60 * 1000);

    } catch (error) {
        console.error('存储被屏蔽消息失败:', error);
    }
}

function scheduleBlockedMessageDeletion(messageId, delay) {
    setTimeout(() => {
        try {
            const blockedMessagesJson = localStorage.getItem('blockedMessages');
            if (!blockedMessagesJson) return;

            let blockedMessages = JSON.parse(blockedMessagesJson);

            blockedMessages = blockedMessages.filter(msg => msg.id !== messageId);

            localStorage.setItem('blockedMessages', JSON.stringify(blockedMessages));

            console.log(`被屏蔽消息 ${messageId} 已自动删除`);

        } catch (error) {
            console.error('自动删除被屏蔽消息失败:', error);
        }
    }, delay);
}

function cleanupExpiredBlockedMessages() {
    try {
        const blockedMessagesJson = localStorage.getItem('blockedMessages');
        if (!blockedMessagesJson) return;

        let blockedMessages = JSON.parse(blockedMessagesJson);
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const unexpiredMessages = blockedMessages.filter(msg => {
            if (!msg.storedAt) return false;
            const storedTime = new Date(msg.storedAt);
            return storedTime > oneDayAgo;
        });

        if (unexpiredMessages.length !== blockedMessages.length) {
            localStorage.setItem('blockedMessages', JSON.stringify(unexpiredMessages));
            console.log(`已清理 ${blockedMessages.length - unexpiredMessages.length} 条过期的被屏蔽消息`);
        }

    } catch (error) {
        console.error('清理过期被屏蔽消息失败:', error);
    }
}

cleanupExpiredBlockedMessages();




socket.on('messageRecalled', (data) => {
    if (data.channel === currentChannel) {
        const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (messageElement) {
            let messageText = messageElement.querySelector('.message-text');
            if (!messageText) {
                messageText = document.createElement('div');
                messageText.className = 'message-text';
                const messageContent = messageElement.querySelector('.message-content');
                if (messageContent) {
                    const messageHeader = messageContent.querySelector('.message-header');
                    if (messageHeader) {
                        messageHeader.insertAdjacentElement('afterend', messageText);
                    } else {
                        messageContent.appendChild(messageText);
                    }
                }
            }

            messageText.textContent = '[此消息已撤回]';
            messageText.style.color = '#8e8e93';
            messageText.style.fontStyle = 'italic';

            const messageImage = messageElement.querySelector('.message-image');
            if (messageImage) {
                messageImage.remove();
            }

            const messageVoice = messageElement.querySelector('.message-voice');
            if (messageVoice) {
                messageVoice.remove();
            }

            const messageFile = messageElement.querySelector('.message-file');
            if (messageFile) {
                messageFile.remove();
            }

            const recallBtn = messageElement.querySelector('.recall-btn');
            if (recallBtn) {
                recallBtn.remove();
            }
        }
    }
});

socket.on('messageDeleted', (data) => {
    if (currentChannel) {
        const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (messageElement) {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(10px)';
            messageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            setTimeout(() => {
                messageElement.remove();
            }, 300);
        }
    }
});



function initCustomAudioPlayers() {
    document.querySelectorAll('.custom-audio-player').forEach(player => {
        const audioId = player.dataset.messageId;
        const audio = document.getElementById(`audio-${audioId}`);
        const playBtn = player.querySelector('.play-btn');
        const progressBar = player.querySelector('.progress-bar');
        const progressFill = player.querySelector('.progress-fill');
        const currentTimeDisplay = player.querySelector('.current-time');

        audio.addEventListener('loadedmetadata', () => {
        });

        audio.addEventListener('timeupdate', () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${progress}%`;

            const currentSeconds = Math.floor(audio.currentTime);
            const minutes = Math.floor(currentSeconds / 60);
            const seconds = currentSeconds % 60;
            currentTimeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        });

        playBtn.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
                playBtn.classList.add('playing');
            } else {
                audio.pause();
                playBtn.classList.remove('playing');
            }
        });

        audio.addEventListener('ended', () => {
            playBtn.classList.remove('playing');
            progressFill.style.width = '0%';
            audio.currentTime = 0;
        });

        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            const progress = clickX / width;
            audio.currentTime = progress * audio.duration;
        });
    });
}

function initEmojiPicker() {
    const emojis = [
        '😊', '😂', '❤️', '👍', '🔥', '🎉', '🤔', '😢',
        '😉', '😆', '😍', '👏', '🤣', '🤯', '😎', '😏',
        '😀', '😃', '😄', '😁', '😅', '😆', '😇', '🙂',
        '🙃', '😉', '😊', '😋', '😎', '😍', '😘', '🥰',
        '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
        '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒',
        '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖',
        '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡'
    ];

    emojis.forEach(emoji => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        emojiSpan.title = emoji;
        emojiSpan.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        emojiGrid.appendChild(emojiSpan);
    });

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('show');
    });

    window.addEventListener('click', () => {
        emojiPicker.classList.remove('show');
    });

    emojiPicker.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function insertEmoji(emoji) {
    const startPos = messageInput.selectionStart;
    const endPos = messageInput.selectionEnd;
    const textBefore = messageInput.value.substring(0, startPos);
    const textAfter = messageInput.value.substring(endPos);

    messageInput.value = textBefore + emoji + textAfter;

    messageInput.focus();
    messageInput.setSelectionRange(startPos + emoji.length, startPos + emoji.length);

    adjustTextareaHeight();

    emojiPicker.classList.remove('show');
}

initPage();

initEmojiPicker();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomAudioPlayers);
} else {
    initCustomAudioPlayers();
}

function reinitAudioPlayers() {
    document.querySelectorAll('.play-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    initCustomAudioPlayers();
}

async function loadMessages(channel) {
    messagesContainer.innerHTML = '<div style="text-align: center; padding: 50px; color: #6e6e73;"><span class="loading-messages">加载消息中...</span></div>';

    try {
        const response = await fetch(`/api/messages/${channel}`);
        const messages = await response.json();

        messagesContainer.innerHTML = '';

        messages.forEach(message => {
            if (message.is_blocked && parseInt(message.user_id) !== parseInt(currentUser.id)) {
                return;
            }
            addMessageToDOM(message);
        });

        reinitAudioPlayers();

        scrollToBottom();
    } catch (error) {
        messagesContainer.innerHTML = '<div style="text-align: center; padding: 50px; color: #ff3b30;">加载消息失败</div>';
    }
}

function showMore() {
    if (nav) {
        nav.getAttribute('hidden') != undefined ? nav.removeAttribute('hidden') : nav.setAttribute('hidden', 'hidden');
    }
}

window.viewImage = viewImage;
window.recallMessage = recallMessage;
window.showCustomConfirm = showCustomConfirm;