


const loginForm = document.querySelector('.login-container');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMessage = document.getElementById('errorMessage');


loginBtn.addEventListener('click', async () => {
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    
    if (!username || !password) {
        showError('请输入用户名和密码');
        return;
    }
    
    try {
        
        loginBtn.disabled = true;
        loginBtn.textContent = '登录中...';
        
        
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.token) {
            
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('isAdmin', 'true');
            
            
            window.location.href = '/admin.html';
        } else {
            
            showError(data.error || '登录失败，请检查用户名和密码');
        }
        
    } catch (error) {
        console.error('登录错误:', error);
        showError('登录失败，请稍后重试');
    } finally {
        
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
    }
});


function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}


function hideError() {
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
}


usernameInput.addEventListener('input', hideError);
passwordInput.addEventListener('input', hideError);


usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        passwordInput.focus();
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});
