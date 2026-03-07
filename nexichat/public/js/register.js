/**
 * 注册页逻辑：注册成功 → 遮罩过渡 → 完善资料（内嵌）
 * 依赖：auth.js（注册成功后调用 window.onRegisterSuccess）
 */
(function () {
    var registerPhase = document.getElementById('registerPhase');
    var setupPhase = document.getElementById('setupPhase');
    var mask = document.getElementById('revealMask');

    window.onRegisterSuccess = function () {
        if (!mask || !registerPhase || !setupPhase) return;
        var logoImg = document.getElementById('registerLogo');
        if (logoImg) {
            var rect = logoImg.getBoundingClientRect();
            var fly = logoImg.cloneNode(true);
            fly.className = 'register-fly-image';
            fly.style.left = rect.left + 'px';
            fly.style.top = rect.top + 'px';
            fly.style.width = rect.width + 'px';
            fly.style.height = rect.height + 'px';
            document.body.appendChild(fly);
            document.body.classList.add('register-fly-active');
        }
        mask.classList.add('visible');
        setTimeout(function () {
            mask.classList.add('covering');
            var coverDone = false;
            function doRevealAndDone() {
                if (coverDone) return;
                coverDone = true;
                registerPhase.classList.add('hidden');
                setupPhase.classList.add('visible');
                mask.classList.add('gone');
                mask.style.transition = 'clip-path 0.5s ease-out';
                requestAnimationFrame(function () {
                    mask.classList.add('shrink');
                });
                mask.addEventListener('transitionend', function onShrinkEnd(ev) {
                    if (ev.target !== mask || ev.propertyName !== 'clip-path') return;
                    mask.removeEventListener('transitionend', onShrinkEnd);
                    var flyEl = document.querySelector('.register-fly-image');
                    if (flyEl) flyEl.classList.add('fly-to-corner');
                    var firstStep = document.querySelector('.setup-step[data-step="0"]');
                    if (firstStep) firstStep.classList.add('avatar-enter-done');
                    mask.classList.remove('visible', 'covering', 'gone', 'shrink');
                    mask.style.transition = '';
                    initProfileSetup();
                });
            }
            mask.addEventListener('transitionend', function (e) {
                if (e.target !== mask) return;
                if (e.propertyName === '--mask-hole') doRevealAndDone();
            });
            setTimeout(doRevealAndDone, 650);
        }, 150);
    };

    function initProfileSetup() {
        var userStr = localStorage.getItem('user');
        var token = localStorage.getItem('token');
        if (!userStr || !token) return;
        var userObj = JSON.parse(userStr);

        var nicknameEl = document.getElementById('nickname');
        if (nicknameEl) nicknameEl.placeholder = '默认为 ' + (userObj.username || '');

        var TOTAL = 4;
        var current = 0;
        var steps = document.querySelectorAll('.setup-step');
        var progressDots = document.querySelectorAll('.setup-progress .dot');
        var btnBack = document.getElementById('btnBack');
        var btnNext = document.getElementById('btnNext');
        var errorEl = document.getElementById('setupErrorMessage');

        function showError(msg) {
            errorEl.textContent = msg || '';
            errorEl.classList.toggle('show', !!msg);
        }

        function goStep(index, direction) {
            if (index < 0 || index >= TOTAL) return;
            var prev = current;
            steps[prev].classList.remove('active');
            steps[prev].classList.add(direction === 'next' ? 'leave-prev' : 'enter-next');
            current = index;
            steps[current].classList.remove('leave-prev', 'enter-next');
            steps[current].classList.add('active', direction === 'next' ? 'enter-next' : 'leave-prev');
            setTimeout(function () {
                steps[current].classList.remove('enter-next', 'leave-prev');
            }, 460);
            progressDots.forEach(function (dot, i) {
                dot.classList.remove('active', 'done');
                if (i < current) dot.classList.add('done');
                if (i === current) dot.classList.add('active');
            });
            btnBack.disabled = current === 0;
            btnNext.textContent = current === TOTAL - 1 ? '完成并进入' : '下一步';
            showError('');
        }

        btnBack.addEventListener('click', function () { goStep(current - 1, 'prev'); });
        btnNext.addEventListener('click', function () {
            if (current === TOTAL - 1) submitProfile(); else goStep(current + 1, 'next');
        });

        document.getElementById('avatarInput').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file || !file.type.startsWith('image/')) return;
            var reader = new FileReader();
            reader.onload = function () {
                document.getElementById('avatarPreview').src = reader.result;
            };
            reader.readAsDataURL(file);
        });

        function submitProfile() {
            showError('');
            var nickname = document.getElementById('nickname').value.trim();
            var email = document.getElementById('email').value.trim() || null;
            var bio = document.getElementById('bio').value.trim() || '';
            var gender = document.querySelector('input[name="gender"]:checked').value;
            var avatarFile = document.getElementById('avatarInput').files[0];
            btnNext.disabled = true;
            btnNext.textContent = '保存中...';
            var avatarUrl = userObj.avatar || 'images/default.png';

            function done() {
                btnNext.disabled = false;
                btnNext.textContent = '完成并进入';
            }

            if (avatarFile) {
                var formData = new FormData();
                formData.append('avatar', avatarFile);
                formData.append('userId', String(userObj.id));
                fetch('/api/upload/avatar', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: formData
                })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (data.success && data.avatar) avatarUrl = data.avatar;
                        saveProfile(avatarUrl, done);
                    })
                    .catch(function () {
                        showError('头像上传失败，请重试');
                        done();
                    });
            } else {
                saveProfile(avatarUrl, done);
            }

            function saveProfile(avatarUrl, done) {
                fetch('/api/profile/' + userObj.id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        nickname: nickname || userObj.username,
                        email: email,
                        bio: bio,
                        gender: gender
                    })
                })
                    .then(function (res) {
                        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
                    })
                    .then(function (r) {
                        if (r.ok) {
                            localStorage.setItem('user', JSON.stringify({
                                id: userObj.id,
                                username: userObj.username,
                                nickname: nickname || userObj.username,
                                avatar: avatarUrl,
                                bio: bio,
                                gender: gender
                            }));
                            window.location.href = 'index.html';
                            return;
                        }
                        showError(r.data.error || '保存失败，请重试');
                        done();
                    })
                    .catch(function () {
                        showError('网络错误，请检查连接');
                        done();
                    });
            }
        }
    }

    fetch('/api/version')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var el = document.getElementById('versionInfo');
            if (el) el.textContent = data.version;
        })
        .catch(function () {});
})();
