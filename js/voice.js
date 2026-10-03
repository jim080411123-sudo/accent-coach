/* 统一语音输入入口：浏览器 Web Speech API 优先，不可用时自动切换 AI 录音转写。
 * 切换结果会记住（localStorage），下次直接走可用通道。 */
(function (root) {
  'use strict';

  var Engine = root.SpeechEngine, AI = root.AI;
  var MODE_KEY = 'accentCoach.asrRoute'; // 运行时记忆：browser / ai

  var SWITCHABLE = ['network', 'aborted', 'service-not-allowed'];

  function remembered() {
    try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; }
  }

  function remember(m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
  }

  /* begin({continuous, onUpdate, onStatus, onEnd, onError}) → {stop, abort} */
  function begin(opts) {
    opts = opts || {};
    var pref = (AI.load().asrMode) || 'auto';
    var route = pref === 'browser' ? 'browser'
      : pref === 'ai' ? 'ai'
        : (remembered() === 'ai' || !Engine.recognitionSupported) ? 'ai' : 'browser';

    if (route === 'ai') return beginAI(opts, false);
    return beginBrowser(opts);
  }

  function beginAI(opts, switched) {
    if (!root.ASR.supported()) {
      if (opts.onError) opts.onError(new Error('此浏览器不支持录音（MediaRecorder），无法使用 AI 转写'));
      return { stop: function () { }, abort: function () { } };
    }
    if (switched && opts.onStatus) opts.onStatus('浏览器识别不可用，已切换 AI 转写');
    return root.ASR.begin({
      onStatus: opts.onStatus,
      onResult: function (text) { if (opts.onEnd) opts.onEnd(text); },
      onError: opts.onError
    });
  }

  function beginBrowser(opts) {
    var session = null;
    var impl = new Engine.Recognition({
      continuous: opts.continuous,
      onUpdate: opts.onUpdate,
      onError: function (err) {
        var pref = (AI.load().asrMode) || 'auto';
        if (pref === 'auto' && SWITCHABLE.indexOf(err.code) >= 0) {
          remember('ai');
          var replacement = beginAI(opts, true);
          if (session) { session.stop = replacement.stop; session.abort = replacement.abort; }
          return; // 已无缝接管，不向上抛错
        }
        if (opts.onError) opts.onError(err);
      },
      onEnd: function (text) {
        if (!text) {
          var pref = (AI.load().asrMode) || 'auto';
          if (pref === 'auto' && remembered() !== 'ai') {
            remember('ai');
            var replacement = beginAI(opts, true);
            if (session) { session.stop = replacement.stop; session.abort = replacement.abort; }
            return; // 转入 AI 录音，不作为结束
          }
        }
        if (opts.onEnd) opts.onEnd(text);
      }
    });
    session = { stop: impl.stop, abort: impl.abort };
    impl.start();
    return session;
  }

  root.VoiceInput = { begin: begin };
})(typeof window !== 'undefined' ? window : globalThis);
