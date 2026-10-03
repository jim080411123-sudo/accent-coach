/* AI 对话模式：选场景生成开场 → 语音/文字对话 → AI 每轮纠错 */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var Engine = root.SpeechEngine, AI = root.AI;

  var SCENARIOS = [
    { id: 'daily',    label: '☕ 日常闲聊',   prompt: '朋友之间的日常闲聊，聊近况、爱好、天气等' },
    { id: 'coffee',   label: '🧋 咖啡店点单', prompt: '在咖啡店点单：顾客点饮料和食物，店员推荐并确认订单' },
    { id: 'travel',   label: '✈️ 旅行出行',   prompt: '在机场/酒店：办理入住、问路、改签航班等' },
    { id: 'food',     label: '🍽️ 餐厅用餐',   prompt: '在餐厅：订位、点菜、询问推荐菜品、结账' },
    { id: 'interview',label: '💼 求职面试',   prompt: '求职面试：面试官提问自我介绍、项目经验、职业规划' },
    { id: 'business', label: '📊 商务会议',   prompt: '商务场景：和同事讨论项目进度、开会发言、电话沟通' },
    { id: 'custom',   label: '✏️ 自定义主题', prompt: '' }
  ];

  var state = {
    history: [],        // {role, content}
    scenario: null,
    busy: false,
    rec: null
  };

  function init() {
    renderScenarios();
    $('btn-start-chat').addEventListener('click', startChat);
    $('btn-chat-send').addEventListener('click', sendFromInput);
    $('btn-chat-mic').addEventListener('click', micInput);
    $('btn-chat-new').addEventListener('click', resetChat);
    $('chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromInput(); }
    });
    $('chat-input').addEventListener('input', autoGrow);
  }

  function renderScenarios() {
    var grid = $('scenario-grid');
    grid.innerHTML = '';
    SCENARIOS.forEach(function (s, i) {
      var chip = document.createElement('button');
      chip.className = 'chip-btn' + (i === 0 ? ' active' : '');
      chip.textContent = s.label;
      chip.addEventListener('click', function () {
        Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        state.scenario = s;
        $('custom-scenario-row').classList.toggle('hidden', s.id !== 'custom');
      });
      grid.appendChild(chip);
    });
    state.scenario = SCENARIOS[0];
  }

  function currentScenarioPrompt() {
    if (state.scenario.id === 'custom') {
      var t = $('custom-scenario').value.trim() || '自由闲聊';
      return '自定义场景：' + t;
    }
    return state.scenario.prompt;
  }

  function resetChat() {
    stopRec();
    state.history = [];
    state.scenario = null;
    $('chat-log').innerHTML = '';
    $('chat-area').classList.add('hidden');
    $('chat-setup').classList.remove('hidden');
  }

  function startChat() {
    var settings = AI.load();
    if (!settings.apiKey) {
      App.toast('对话功能需要 AI：请点击右上角 ⚙ 配置 API Key', 'error');
      App.openSettings();
      return;
    }
    var level = $('chat-level').value;
    state.history = [
      { role: 'system', content: AI.chatSystemPrompt(currentScenarioPrompt(), level) },
      { role: 'user', content: '[开始] 请用英文自然地开启这个场景的对话，先简单设定情境并向学员提问。' }
    ];
    $('chat-setup').classList.add('hidden');
    $('chat-area').classList.remove('hidden');
    state.pendingOpening = true;
    requestAI();
  }

  function sendFromInput() {
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text || state.busy) return;
    input.value = '';
    autoGrow();
    pushUser(text);
    renderUser(text);
    requestAI();
  }

  function micInput() {
    if (state.rec) { stopRec(); return; }
    var settings = AI.load();
    var needsIndependentAsr = settings.asrMode === 'ai' || !Engine.recognitionSupported;
    if (needsIndependentAsr && !root.ASR.isConfigured(settings)) {
      App.toast('当前转写方式需要独立配置。请打开 ⚙ 设置 → 语音转写，或选择免 Key 的浏览器内置转写', 'error');
      App.openSettings();
      return;
    }
    var btn = $('btn-chat-mic');
    btn.classList.add('recording');
    $('chat-interim').classList.remove('hidden');
    $('chat-interim').textContent = '正在聆听……';

    function cleanup() {
      state.rec = null;
      btn.classList.remove('recording');
      $('chat-interim').classList.add('hidden');
    }

    state.rec = root.VoiceInput.begin({
      continuous: false,
      onUpdate: function (r) {
        $('chat-interim').textContent = '正在聆听……' + (r.interim || r.final || '');
      },
      onStatus: function (t) {
        $('chat-interim').textContent = t;
      },
      onError: function (err) {
        App.toast(err.message, 'error');
        cleanup();
      },
      onEnd: function (text) {
        cleanup();
        if (text && !state.busy) {
          pushUser(text);
          renderUser(text);
          requestAI();
        }
      }
    });
  }

  function stopRec() {
    if (state.rec) state.rec.abort();
  }

  /* ---------- 请求 AI ---------- */

  function requestAI() {
    var settings = AI.load();
    state.busy = true;
    setBusy(true);
    var trimmed = state.history.slice();
    // 只携带系统提示 + 最近 12 条
    if (trimmed.length > 13) {
      trimmed = [trimmed[0]].concat(trimmed.slice(-12));
    }
    AI.chatJSON(settings, trimmed, { temperature: 0.7, maxTokens: 800 })
      .then(function (r) {
        var reply = (r && r.reply) || '';
        var corr = Array.isArray(r && r.corrections) ? r.corrections : [];
        var trans = (r && r.translate) || '';
        if (!reply) throw new Error('AI 返回内容为空，请重试');
        state.history.push({ role: 'assistant', content: JSON.stringify({ reply: reply, corrections: corr }) });
        renderAssistant(reply, trans, corr);
        if (AI.load().autoSpeak) Engine.TTS.speak(reply, { rate: 0.95 });
      })
      .catch(function (err) {
        App.toast(err.message, 'error');
        if (state.pendingOpening) resetChat();
      })
      .finally(function () {
        state.busy = false;
        state.pendingOpening = false;
        setBusy(false);
        scrollLog();
      });
  }

  function pushUser(text) {
    state.history.push({ role: 'user', content: text });
  }

  function setBusy(b) {
    $('chat-loading').classList.toggle('hidden', !b);
    $('btn-chat-send').disabled = b;
    $('btn-chat-mic').disabled = b;
    if (b) scrollLog();
  }

  /* ---------- 渲染 ---------- */

  function renderUser(text) {
    var div = document.createElement('div');
    div.className = 'bubble user';
    div.textContent = text;
    $('chat-log').appendChild(div);
    scrollLog();
  }

  function renderAssistant(reply, trans, corrections) {
    var wrap = document.createElement('div');
    wrap.className = 'ai-turn';
    var bubble = document.createElement('div');
    bubble.className = 'bubble ai';
    bubble.textContent = reply;
    wrap.appendChild(bubble);

    if (trans) {
      var tEl = document.createElement('div');
      tEl.className = 'bubble-translate';
      tEl.textContent = trans;
      wrap.appendChild(tEl);
    }

    var actions = document.createElement('div');
    actions.className = 'bubble-actions';
    var spk = document.createElement('button');
    spk.className = 'tts-mini';
    spk.textContent = '🔊 朗读';
    spk.addEventListener('click', function () { Engine.TTS.speak(reply, { rate: 0.9 }); });
    actions.appendChild(spk);
    wrap.appendChild(actions);

    if (corrections.length) {
      var card = document.createElement('div');
      card.className = 'correction-card';
      var head = document.createElement('div');
      head.className = 'correction-head';
      head.textContent = '📝 纠错 ' + corrections.length;
      card.appendChild(head);
      corrections.forEach(function (c) {
        var item = document.createElement('div');
        item.className = 'correction-item';
        var a = document.createElement('div');
        a.innerHTML = '<s></s>';
        a.querySelector('s').textContent = c.original || '';
        var b = document.createElement('div');
        b.className = 'corr-improved';
        b.textContent = c.improved || '';
        var n = document.createElement('div');
        n.className = 'corr-note';
        n.textContent = c.note || '';
        item.appendChild(a); item.appendChild(b); item.appendChild(n);
        card.appendChild(item);
      });
      wrap.appendChild(card);
    }
    $('chat-log').appendChild(wrap);
    scrollLog();
  }

  function scrollLog() {
    var log = $('chat-log');
    log.scrollTop = log.scrollHeight;
  }

  function autoGrow() {
    var el = $('chat-input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  root.Chat = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
