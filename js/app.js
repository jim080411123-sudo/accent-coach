/* 应用外壳：标签页切换、设置弹窗、全局提示 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var AI = window.AI;

  /* ---------- Toast ---------- */

  var toastTimer = null;
  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
  }

  /* ---------- 标签页 ---------- */

  function switchTab(name) {
    ['practice', 'chat'].forEach(function (n) {
      $('view-' + n).classList.toggle('active', n === name);
      $('tab-' + n).classList.toggle('active', n === name);
    });
    window.SpeechEngine.TTS.stop();
  }

  /* ---------- 设置 ---------- */

  var settings;

  var MODEL_HINTS = {
    doubao: '豆包接口有跨域限制，需先部署项目里的 cloudflare-worker.js（见 README）'
  };

  function fillPresetOptions(selectedId) {
    var sel = $('set-preset');
    sel.innerHTML = '';
    AI.PRESETS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = selectedId;
  }

  function fillVoiceOptions(selectedName) {
    var sel = $('set-voice');
    var voices = window.SpeechEngine.TTS.listVoices();
    sel.innerHTML = '';
    var auto = document.createElement('option');
    auto.value = '';
    auto.textContent = '自动（英语优先）';
    sel.appendChild(auto);
    voices.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name + '（' + v.lang + '）' + (v.en ? '' : ' · 非英语');
      sel.appendChild(opt);
    });
    sel.value = selectedName || '';
    // 个别浏览器首次打开时音色列表尚未就绪，稍后重试一次
    if (!voices.length) {
      setTimeout(function () {
        if (document.getElementById('set-voice').options.length <= 1) {
          fillVoiceOptions((AI.load() || {}).voiceName);
        }
      }, 400);
    }
  }

  function currentModelHint() {
    return MODEL_HINTS[$('set-preset').value] || '';
  }

  function refreshModelHint() {
    $('model-hint').textContent = currentModelHint();
  }

  function openSettings() {
    settings = AI.load();
    fillPresetOptions(settings.preset);
    $('set-base').value = settings.baseUrl;
    $('set-key').value = settings.apiKey;
    $('set-model').value = settings.model;
    $('set-voice').innerHTML = '';
    fillVoiceOptions(settings.voiceName);
    $('set-rate').value = settings.rate || 0.95;
    $('rate-val').textContent = (settings.rate || 0.95) + 'x';
    refreshModelHint();
    $('set-autospeak').checked = !!settings.autoSpeak;
    $('modal-mask').classList.remove('hidden');
  }

  function closeSettings() {
    $('modal-mask').classList.add('hidden');
    refreshKeyBadge();
  }

  function onPresetChange() {
    var p = AI.presetById($('set-preset').value);
    $('set-base').value = p.baseUrl;
    $('set-model').value = p.model;
    refreshModelHint();
  }

  function saveSettings() {
    settings = {
      preset: $('set-preset').value,
      baseUrl: $('set-base').value.trim() || AI.presetById($('set-preset').value).baseUrl,
      apiKey: $('set-key').value.trim(),
      model: $('set-model').value.trim() || AI.presetById($('set-preset').value).model,
      voiceName: $('set-voice').value,
      rate: parseFloat($('set-rate').value) || 0.95,
      autoSpeak: $('set-autospeak').checked,
      level: settings.level || '中级'
    };
    AI.save(settings);
    closeSettings();
    toast('设置已保存', 'ok');
  }

  function testConnection() {
    var btn = $('set-test');
    var temp = {
      preset: $('set-preset').value,
      baseUrl: $('set-base').value.trim(),
      apiKey: $('set-key').value.trim(),
      model: $('set-model').value.trim()
    };
    if (!temp.apiKey) { toast('请先填写 API Key', 'error'); return; }
    btn.disabled = true;
    btn.textContent = '测试中……';
    AI.chat(temp, [{ role: 'user', content: 'Reply with exactly: OK' }], { maxTokens: 8, temperature: 0 })
      .then(function () { toast('连接成功，AI 已就绪 ✔', 'ok'); })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = '测试连接';
      });
  }

  function refreshKeyBadge() {
    var s = AI.load();
    $('settings-badge').classList.toggle('hidden', !!s.apiKey);
  }

  /* ---------- 一键安装到主屏幕 ---------- */

  var deferredPrompt = null;

  function initInstallBanner() {
    var banner = $('install-banner');
    var dismissed = false;
    try { dismissed = localStorage.getItem('accentCoach.installDismissed') === '1'; } catch (e) { }
    var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    function show(text) {
      $('install-text').textContent = text;
      if (!dismissed && !isStandalone) banner.classList.remove('hidden');
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      show('像 App 一样使用：安装到手机桌面');
    });
    if (isIOS) {
      $('btn-install').classList.add('hidden');
      if (!isStandalone) show('iPhone 安装：点浏览器分享 ⬆️ → 「添加到主屏幕」');
    }

    $('btn-install').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        banner.classList.add('hidden');
      });
    });
    window.addEventListener('appinstalled', function () {
      banner.classList.add('hidden');
      toast('安装成功，桌面图标见！', 'ok');
    });
    $('install-dismiss').addEventListener('click', function () {
      banner.classList.add('hidden');
      try { localStorage.setItem('accentCoach.installDismissed', '1'); } catch (e) { }
    });
  }

  /* ---------- 启动 ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    // 标签页
    $('tab-practice').addEventListener('click', function () { switchTab('practice'); });
    $('tab-chat').addEventListener('click', function () { switchTab('chat'); });

    // 设置
    $('btn-settings').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('modal-mask').addEventListener('click', function (e) {
      if (e.target === $('modal-mask')) closeSettings();
    });
    $('set-preset').addEventListener('change', onPresetChange);
    $('set-save').addEventListener('click', saveSettings);
    $('set-test').addEventListener('click', testConnection);
    $('set-voice-test').addEventListener('click', function () {
      window.SpeechEngine.TTS.speak("Hello! I'm your English coach. Let's practice together.", {
        voiceName: $('set-voice').value
      });
    });
    $('set-rate').addEventListener('input', function () {
      $('rate-val').textContent = parseFloat($('set-rate').value).toFixed(2).replace(/0$/, '') + 'x';
    });
    $('set-key-eye').addEventListener('mousedown', function () { $('set-key').type = 'text'; });
    $('set-key-eye').addEventListener('mouseup', function () { $('set-key').type = 'password'; });
    $('set-key-eye').addEventListener('mouseout', function () { $('set-key').type = 'password'; });

    window.App = {
      toast: toast,
      openSettings: openSettings
    };

    window.Practice.init();
    window.Chat.init();
    refreshKeyBadge();
    initInstallBanner();

    // PWA：注册 Service Worker（需 https 或 localhost/127.0.0.1）
    if ('serviceWorker' in navigator) {
      var secure = location.protocol === 'https:' ||
        ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0;
      if (secure) navigator.serviceWorker.register('sw.js').catch(function () { /* 不影响使用 */ });
    }
  });
})();
