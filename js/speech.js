/* 语音引擎封装：
 * - 识别：Web Speech API（webkitSpeechRecognition），Chrome/Edge/安卓 Chrome 支持最好
 * - 合成：speechSynthesis 朗读短文 / AI 回复 */
(function (root) {
  'use strict';

  var SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  var Recognition = function (opts) {
    opts = opts || {};
    if (!SR) throw new Error('当前浏览器不支持语音识别，请使用 Chrome / Edge（手机端推荐安卓 Chrome）。');

    var rec = new SR();
    rec.lang = opts.lang || 'en-US';
    rec.continuous = opts.continuous !== false;
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
        'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问后重试。',
        'service-not-allowed': '语音识别服务不可用，请检查系统麦克风权限或换用 Chrome。',
        'no-speech': '没有听到声音，请靠近麦克风再试。',
        'audio-capture': '未检测到麦克风设备。',
        'network': '语音识别服务网络异常，请检查网络（该功能依赖系统在线识别）。'
      };
      if (event.error === 'no-speech' && !stopped && restarts < 3) return; // 交给 onend 自动重启
      if (opts.onError) opts.onError(new Error(map[event.error] || ('识别出错：' + event.error)));
    };

    rec.onend = function () {
      if (stopped) {
        if (opts.onEnd) opts.onEnd(finalText.trim());
        return;
      }
      // Chrome 常在停顿几秒后自动断开；未主动停止则重启，最长累计 90 秒
      restarts++;
      if (restarts <= 30) {
        try { rec.start(); } catch (e) { /* start() 竞态，忽略 */ }
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
    Recognition: Recognition,
    TTS: TTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
