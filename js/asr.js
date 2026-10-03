/* AI 语音转写引擎：录音 → 转码 16kHz WAV → 上传 OpenAI 兼容 /audio/transcriptions。
 * 用于浏览器 Web Speech API 不可用的环境（国内安卓：谷歌语音服务不可达；iOS 安装版等）。 */
(function (root) {
  'use strict';

  // 注意：本文件在 ai.js 之前加载，运行时再取 root.AI

  var supported = function () {
    return typeof navigator !== 'undefined' &&
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      typeof window.MediaRecorder !== 'undefined';
  };

  var PRESETS = [
    { id: 'siliconflow', name: '硅基流动 SenseVoice（国内直连）', baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/SenseVoiceSmall', models: ['FunAudioLLM/SenseVoiceSmall'] },
    { id: 'zhipu', name: '智谱语音转写', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-asr-2512', models: ['glm-asr-2512', 'glm-4-asr'] },
    { id: 'openai', name: 'OpenAI Whisper', baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', models: ['whisper-1', 'gpt-4o-mini-transcribe'] },
    { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', model: '', models: [] }
  ];

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  function profileFor(settings, id) {
    settings = settings || {};
    var preset = presetById(id);
    var profile = (settings.asrProfiles || {})[preset.id] || {};
    return {
      preset: preset.id,
      baseUrl: String(profile.baseUrl || preset.baseUrl || '').trim(),
      apiKey: String(profile.apiKey || '').replace(/\s+/g, ''),
      model: String(profile.model || preset.model || '').trim()
    };
  }

  function isConfigured(settings) {
    var profile = profileFor(settings, (settings && settings.asrPreset) || 'siliconflow');
    return !!(profile.apiKey && profile.baseUrl && profile.model);
  }

  // 任意浏览器录音格式 → 16kHz 单声道 16bit WAV（线性重采样）
  function toWav(blob) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    return blob.arrayBuffer().then(function (buf) {
      return ctx.decodeAudioData(buf);
    }).then(function (audio) {
      var rate = 16000;
      var src = audio.getChannelData(0);
      var ratio = audio.sampleRate / rate;
      var len = Math.max(1, Math.floor(src.length / ratio));
      var out = new Float32Array(len);
      for (var i = 0; i < len; i++) out[i] = src[Math.floor(i * ratio)];

      var ab = new ArrayBuffer(44 + len * 2);
      var v = new DataView(ab);
      function wstr(off, s) { for (var j = 0; j < s.length; j++) v.setUint8(off + j, s.charCodeAt(j)); }
      wstr(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); wstr(8, 'WAVE');
      wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      wstr(36, 'data'); v.setUint32(40, len * 2, true);
      for (var k = 0; k < len; k++) {
        var sm = Math.max(-1, Math.min(1, out[k]));
        v.setInt16(44 + k * 2, sm < 0 ? sm * 0x8000 : sm * 0x7FFF, true);
      }
      ctx.close();
      return new Blob([ab], { type: 'audio/wav' });
    });
  }

  function transcribe(wavBlob, modelIdx) {
    modelIdx = modelIdx || 0;
    var settings = root.AI.load();
    var profile = profileFor(settings, settings.asrPreset || 'siliconflow');
    var preset = presetById(profile.preset);
    if (!profile.apiKey) {
      return Promise.reject(new Error('语音转写尚未配置。请在 ⚙ 设置 → 语音转写 中填写独立的 API Key'));
    }
    if (!profile.baseUrl) {
      return Promise.reject(new Error('请在 ⚙ 设置 → 语音转写 中填写转写接口地址'));
    }
    var models = [profile.model].concat(preset.models || []).filter(function (m, i, arr) {
      return !!m && arr.indexOf(m) === i;
    });
    if (!models.length) {
      return Promise.reject(new Error('请在 ⚙ 设置 → 语音转写 中填写转写模型名称'));
    }
    var model = models[Math.min(modelIdx, models.length - 1)];
    var fd = new FormData();
    fd.append('file', wavBlob, 'speech.wav');
    fd.append('model', model);
    var url = profile.baseUrl.replace(/\/+$/, '') + '/audio/transcriptions';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 45000);

    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + profile.apiKey },
      body: fd,
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (t) {
          var detail = '';
          try {
            var j = JSON.parse(t);
            if (j.error && j.error.message) detail = j.error.message;
          } catch (e) { /* keep empty */ }
          // 模型名不被该服务商支持时，换下一个模型名重试
          if (modelIdx < models.length - 1 && /model|模型|not found|不存在/i.test(detail)) {
            return transcribe(wavBlob, modelIdx + 1);
          }
          var err = new Error('AI 转写失败（HTTP ' + res.status + '）' + (detail ? '：' + detail : ''));
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    }).then(function (data) {
      // 模型回退时，内层已解析成字符串直接透传
      if (typeof data === 'string') return data.trim();
      var text = data && (data.text ||
        (data.segments && data.segments.map(function (s) { return s.text || ''; }).join(''))) || '';
      return text.trim();
    }).catch(function (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('AI 转写超时，请重试');
      throw err;
    });
  }

  /* 录音会话：begin({onStatus, onResult, onError}) → {stop, abort}
   * stop/abort 都会结束录音并转写。 */
  function begin(opts) {
    opts = opts || {};
    var stream = null, recorder = null, chunks = [];
    var done = false, timer = null;

    function cleanup() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (stream) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
        stream = null;
      }
    }

    function fail(err) {
      if (done) return;
      done = true;
      cleanup();
      if (opts.onError) opts.onError(err instanceof Error ? err : new Error(String(err)));
    }

    function finalize() {
      if (done) return;
      if (!recorder || recorder.state === 'inactive') { fail(new Error('录音未开始')); return; }
      recorder.stop(); // onstop 里完成转写
    }

    function processAudio() {
      cleanup();
      var blob = new Blob(chunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
      chunks = [];
      if (!blob.size) { fail(new Error('没有录到声音，请靠近麦克风重试')); return; }
      if (opts.onStatus) opts.onStatus('AI 转写中……');
      toWav(blob).then(function (wav) { return transcribe(wav, 0); })
        .then(function (text) {
          if (done) return;
          done = true;
          if (opts.onResult) opts.onResult(text);
        })
        .catch(fail);
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      if (done) { cleanup(); return; }
      stream = s;
      try {
        recorder = new MediaRecorder(s);
      } catch (e) {
        fail(new Error('录音初始化失败：' + e.message));
        return;
      }
      chunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onerror = function () { fail(new Error('录音出错，请重试')); };
      recorder.onstop = processAudio;
      recorder.start();
      if (opts.onStatus) opts.onStatus('正在录音…… 说完点「完成」');
      // 最长 90 秒自动结束
      timer = setTimeout(finalize, 90000);
    }).catch(function (err) {
      var msg = err && err.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器设置中允许后重试'
        : '无法访问麦克风：' + ((err && (err.message || err.name)) || '未知错误');
      fail(new Error(msg));
    });

    return {
      stop: function () { finalize(); },
      abort: function () { finalize(); }
    };
  }

  root.ASR = {
    PRESETS: PRESETS,
    presetById: presetById,
    profileFor: profileFor,
    isConfigured: isConfigured,
    supported: supported,
    begin: begin,
    transcribe: transcribe // 调试/测试用
  };
})(typeof window !== 'undefined' ? window : globalThis);
