/* 语音引擎封装：
 * - 识别：Web Speech API（webkitSpeechRecognition），Chrome/Edge/安卓 Chrome 支持最好
 * - 合成：speechSynthesis 朗读短文 / AI 回复 */
(function (root) {
  'use strict';

  var SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // iPadOS 13+ 的 navigator.platform 是 MacIntel，用触点数辅助判断
  var IS_IOS = typeof navigator !== 'undefined' && (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  var IOS_HINT = 'iPhone/iPad 语音识别受限：请用 Safari 打开本页（不要从主屏幕图标进入），允许麦克风权限，并在 设置→通用→键盘 打开「启用听写」。';

  // 安卓"主屏幕安装版"(WebAPK) 无法调用谷歌语音服务，是已知系统限制；浏览器标签页里正常
  var IS_STANDALONE = typeof window !== 'undefined' && !!(
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );

  var PWA_VOICE_HINT = '主屏幕安装版受安卓限制，无法语音识别：请在 Chrome 浏览器里直接打开本网址使用语音（对话打字、AI、朗读不受影响）。';

  var Recognition = function (opts) {
    opts = opts || {};
    if (!SR) throw new Error('当前浏览器不支持语音识别，请使用 Chrome / Edge（手机端推荐安卓 Chrome）。');

    var rec = new SR();
    rec.lang = opts.lang || 'en-US';
    // iOS 对连续识别支持差，改为短句模式 + 自动重启拼接
    rec.continuous = opts.continuous !== false && !IS_IOS;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    var stopped = false;      // 用户主动停止
    var restarts = 0;         // 防止无限自动重启
    var finalText = '';

    rec.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var r = event.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript + ' ';
        } else {
          interim += r[0].transcript;
        }
      }
      if (opts.onUpdate) opts.onUpdate({ final: finalText.trim(), interim: interim.trim() });
    };

    rec.onerror = function (event) {
      var map = {
        'not-allowed': (!IS_IOS && IS_STANDALONE) ? PWA_VOICE_HINT
          : '麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问后重试。',
        'service-not-allowed': (!IS_IOS && IS_STANDALONE) ? PWA_VOICE_HINT
          : '语音识别服务不可用，请检查系统麦克风权限或换用 Chrome。',
        'no-speech': '没有听到声音，请靠近麦克风再试。',
        'audio-capture': '未检测到麦克风设备。',
        'aborted': IS_IOS ? IOS_HINT : ((!IS_IOS && IS_STANDALONE) ? PWA_VOICE_HINT : '语音识别被中断，请重试。'),
        'network': '语音识别服务网络异常，请检查网络（该功能依赖系统在线识别）。'
      };
      if (event.error === 'no-speech' && !stopped && restarts < 3) return; // 交给 onend 自动重启
      if (event.error === 'aborted' && IS_IOS && !stopped && restarts < 3) return; // iOS 首次启动失败，重启一次试试
      if (opts.onError) {
        var e = new Error(map[event.error] || ('识别出错：' + event.error));
        e.code = event.error; // 供上层决定是否切换识别通道
        opts.onError(e);
      }
    };

    rec.onend = function () {
      if (stopped) {
        if (opts.onEnd) opts.onEnd(finalText.trim());
        return;
      }
      // Chrome 常在停顿几秒后自动断开；iOS 短句模式也靠重启续听
      restarts++;
      if (restarts <= 30) {
        setTimeout(function () {
          if (!stopped) { try { rec.start(); } catch (e) { /* start() 竞态，忽略 */ } }
        }, IS_IOS ? 250 : 0);
      } else {
        if (opts.onEnd) opts.onEnd(finalText.trim());
      }
    };

    this.start = function () {
      stopped = false;
      try { rec.start(); } catch (e) { /* already started */ }
    };
    this.stop = function () {
      stopped = true;
      try { rec.stop(); } catch (e) { if (opts.onEnd) opts.onEnd(finalText.trim()); }
    };
    this.abort = function () {
      stopped = true;
      try { rec.abort(); } catch (e) { if (opts.onEnd) opts.onEnd(finalText.trim()); }
    };
    this.getText = function () { return finalText.trim(); };
  };

  // 读用户设置（音色名 / 语速），避免与 ai.js 循环依赖只在运行时读取
  function userSettings() {
    try {
      return (root.AI && root.AI.load()) || {};
    } catch (e) { return {}; }
  }

  var TTS = {
    voice: null,
    pickVoice: function () {
      if (!('speechSynthesis' in window)) return null;
      var voices = window.speechSynthesis.getVoices() || [];
      var prefer = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Karen'];
      for (var p = 0; p < prefer.length; p++) {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].name.indexOf(prefer[p]) >= 0 && /^en/i.test(voices[i].lang)) return voices[i];
        }
      }
      for (var j = 0; j < voices.length; j++) {
        if (/^en([-_]|$)/i.test(voices[j].lang)) return voices[j];
      }
      return null;
    },
    // 供设置面板展示的音色列表：英语优先，按名称排序
    listVoices: function () {
      if (!('speechSynthesis' in window)) return [];
      var voices = window.speechSynthesis.getVoices() || [];
      return voices.map(function (v) {
        return { name: v.name, lang: v.lang, en: /^en/i.test(v.lang) };
      }).sort(function (a, b) {
        return (b.en ? 1 : 0) - (a.en ? 1 : 0) || a.name.localeCompare(b.name);
      });
    },
    speak: function (text, opts) {
      opts = opts || {};
      if (!('speechSynthesis' in window)) {
        if (opts.onError) opts.onError(new Error('当前浏览器不支持语音合成'));
        return;
      }
      var st = userSettings();
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);

      // 音色优先级：调用方指定 > 用户设置 > 自动挑选
      var voices = window.speechSynthesis.getVoices() || [];
      var voice = null;
      var wantName = opts.voiceName || st.voiceName;
      if (wantName) {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].name === wantName) { voice = voices[i]; break; }
        }
      }
      if (!voice) {
        if (!TTS.voice) TTS.voice = TTS.pickVoice();
        voice = TTS.voice;
      }
      if (voice) u.voice = voice;
      u.lang = (voice && voice.lang) || 'en-US';
      u.rate = st.rate || opts.rate || 0.95;
      u.pitch = 1;
      if (opts.onEnd) u.onend = opts.onEnd;
      if (opts.onError) u.onerror = opts.onError;
      window.speechSynthesis.speak(u);
    },
    stop: function () {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  if (typeof window !== 'undefined') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = function () { TTS.voice = null; };
    }
  }

  root.SpeechEngine = {
    recognitionSupported: !!SR,
    ttsSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    isIOS: IS_IOS,
    iosHint: IOS_HINT,
    Recognition: Recognition,
    TTS: TTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
