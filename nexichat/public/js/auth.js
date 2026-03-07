
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                
                localStorage.setItem('user', JSON.stringify({
                    id: data.userId,
                    username: data.username,
                    nickname: data.nickname,
                    avatar: data.avatar,
                    bio: data.bio,
                    gender: data.gender
                }));
                localStorage.setItem('token', data.token);
                
                
                window.location.href = 'index.html';
            } else {
                errorMessage.textContent = data.error || '登录失败，请重试';
            }
        } catch (error) {
            errorMessage.textContent = '网络错误，请检查连接';
        }
    });
}


if (document.getElementById('registerForm')) {
    var USERNAME_MIN = 2, USERNAME_MAX = 20, USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
    var PASSWORD_MIN = 8, PASSWORD_MAX = 128;

    document.getElementById('registerForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var usernameInput = document.getElementById('username');
        var passwordInput = document.getElementById('password');
        var username = (usernameInput && usernameInput.value) ? usernameInput.value.trim() : '';
        var password = (passwordInput && passwordInput.value) ? passwordInput.value : '';
        var errorMessage = document.getElementById('errorMessage');

        if (username.length < USERNAME_MIN) { errorMessage.textContent = '用户名至少 ' + USERNAME_MIN + ' 个字符'; return; }
        if (username.length > USERNAME_MAX) { errorMessage.textContent = '用户名最多 ' + USERNAME_MAX + ' 个字符'; return; }
        if (!USERNAME_REGEX.test(username)) { errorMessage.textContent = '用户名只能包含字母、数字和下划线'; return; }
        if (password.length < PASSWORD_MIN) { errorMessage.textContent = '密码至少 ' + PASSWORD_MIN + ' 位'; return; }
        if (password.length > PASSWORD_MAX) { errorMessage.textContent = '密码最多 ' + PASSWORD_MAX + ' 位'; return; }
        if (!/[a-zA-Z]/.test(password)) { errorMessage.textContent = '密码须包含字母'; return; }
        if (!/[0-9]/.test(password)) { errorMessage.textContent = '密码须包含数字'; return; }
        errorMessage.textContent = '';

        try {
            var response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            var data = await response.json();
            if (response.ok) {
                localStorage.setItem('user', JSON.stringify({
                    id: data.userId,
                    username: username,
                    nickname: username,
                    avatar: 'images/default.png',
                    bio: '',
                    gender: 'other'
                }));
                localStorage.setItem('token', data.token);
                if (typeof window.onRegisterSuccess === 'function') {
                    window.onRegisterSuccess();
                } else {
                    window.location.href = 'profile-setup.html';
                }
            } else {
                errorMessage.textContent = data.error || '注册失败，请重试';
            }
        } catch (error) {
            errorMessage.textContent = '网络错误，请检查连接';
        }
    });
}




function checkLogin() {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!user || !token) {
        
        window.location.href = 'login.html';
        return null;
    }
    
    return JSON.parse(user);
}


function getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}


function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}