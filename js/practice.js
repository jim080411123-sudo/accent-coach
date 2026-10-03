/* 朗读纠音模式：短文展示 → 麦克风朗读 → 逐词对比标色 → AI 深度分析 */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var Engine = root.SpeechEngine, AI = root.AI, Diff = root.WordDiff;

  var state = {
    passage: null,      // {title, level, text}
    tokens: [],         // 目标文本 token
    rec: null,          // 当前识别会话
    lastCmp: null,      // 最近一次对比结果
    lastSpoken: ''
  };

  function init() {
    var sel = $('passage-select');
    Passages.list.forEach(function (p, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = p.title + ' · ' + p.level;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { loadBuiltIn(parseInt(sel.value, 10)); });

    $('btn-demo').addEventListener('click', demoRead);
    $('btn-record').addEventListener('click', toggleRecord);
    $('btn-stop').addEventListener('click', stopRecord);
    $('btn-analyze').addEventListener('click', analyze);
    $('btn-gen').addEventListener('click', function () { toggleForm('gen-form'); });
    $('btn-custom').addEventListener('click', function () { toggleForm('custom-form'); });
    $('gen-submit').addEventListener('click', genPassage);
    $('custom-submit').addEventListener('click', useCustomText);

    loadBuiltIn(0);
  }

  function toggleForm(id) {
    var el = $(id);
    var show = el.classList.contains('hidden');
    ['gen-form', 'custom-form'].forEach(function (f) { $(f).classList.add('hidden'); });
    if (show) el.classList.remove('hidden');
  }

  function loadBuiltIn(idx) {
    setPassage(Passages.list[idx]);
  }

  function setPassage(p) {
    stopIfActive();
    state.passage = p;
    $('passage-title').textContent = p.title;
    $('passage-level').textContent = p.level || '';
    renderWords(p.text);
    resetResult();
  }

  // 把目标文本渲染成可标色的词 span（支持多段落）
  function renderWords(text) {
    var box = $('passage-text');
    box.innerHTML = '';
    state.tokens = [];
    var paras = String(text).split(/\n+/);
    paras.forEach(function (para) {
      if (!para.trim()) return;
      var pEl = document.createElement('p');
      var idx = state.tokens.length;
      Diff.tokenize(para).forEach(function (tok) {
        var span = document.createElement('span');
        span.className = 'w';
        span.textContent = tok.raw;
        span.dataset.ti = idx;
        pEl.appendChild(span);
        pEl.appendChild(document.createTextNode(' '));
        state.tokens.push(tok);
        idx++;
      });
      box.appendChild(pEl);
    });
  }

  function resetResult() {
    state.lastCmp = null;
    state.lastSpoken = '';
    $('result-panel').classList.add('hidden');
    $('analysis').innerHTML = '';
  }

  /* ---------- 识别 ---------- */

  function toggleRecord() {
    if (state.rec) { stopRecord(); return; }
    startRecord();
  }

  function startRecord() {
    var settings = AI.load();
    if (!Engine.recognitionSupported && !settings.apiKey) {
      App.toast('当前浏览器不支持语音识别；若要使用 AI 转写，请先在 ⚙ 设置中配置 API Key', 'error');
      return;
    }
    Engine.TTS.stop();
    resetResult();
    // 清除上次的标色
    Array.prototype.forEach.call(document.querySelectorAll('#passage-text .w'), function (el) {
      el.className = 'w';
    });

    var bar = $('listen-bar');
    bar.classList.remove('hidden');
    $('btn-record').disabled = true;
    $('listen-label').innerHTML = '正在聆听……<em id="interim"></em>';
    $('interim').textContent = '';

    state.rec = root.VoiceInput.begin({
      continuous: true,
      onUpdate: function (r) {
        $('interim').textContent = r.interim ? '…' + r.interim : '';
      },
      onStatus: function (t) {
        // AI 转写模式没有实时文本，用状态行代替
        $('listen-label').textContent = t;
      },
      onError: function (err) {
        App.toast(err.message, 'error');
        finishRecordUI();
        state.rec = null;
      },
      onEnd: function (text) {
        finishRecordUI();
        state.rec = null;
        if (text) handleTranscript(text);
        else App.toast('没有识别到内容，请靠近麦克风重试', 'error');
      }
    });
    state.rec.start && state.rec.start();
  }

  function stopRecord() {
    if (state.rec) state.rec.stop();
  }

  function stopIfActive() {
    if (state.rec) { state.rec.abort(); state.rec = null; finishRecordUI(); }
  }

  function finishRecordUI() {
    $('listen-bar').classList.add('hidden');
    $('btn-record').disabled = false;
  }

  /* ---------- 对比与展示 ---------- */

  function handleTranscript(spoken) {
    var cmp = Diff.compare(state.passage.text, spoken);
    state.lastCmp = cmp;
    state.lastSpoken = spoken;

    cmp.ops.forEach(function (op) {
      if (op.ti == null) return;
      var el = document.querySelector('#passage-text .w[data-ti="' + op.ti + '"]');
      if (el) el.className = 'w w-' + op.type;
    });

    var panel = $('result-panel');
    panel.classList.remove('hidden');
    drawRing(cmp.score);
    $('score-num').textContent = cmp.score;
    $('result-stat').textContent =
      '共 ' + cmp.target.length + ' 词：正确 ' + cmp.matched +
      (cmp.wrong.length ? '，读错 ' + cmp.wrong.length : '') +
      (cmp.missing.length ? '，漏读 ' + cmp.missing.length : '');
    $('btn-analyze').classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function drawRing(score) {
    var C = 2 * Math.PI * 26;
    var ring = $('score-ring-fg');
    ring.style.strokeDasharray = (C * Math.max(0, Math.min(100, score)) / 100) + ' ' + C;
  }

  /* ---------- AI 深度分析 ---------- */

  var analyzing = false;

  function analyze() {
    if (!state.lastCmp || analyzing) return;
    if (!AI.load().apiKey) {
      App.toast('深度分析需要 AI：请点击右上角 ⚙ 配置 API Key', 'error');
      App.openSettings();
      return;
    }
    analyzing = true;
    var btn = $('btn-analyze');
    btn.disabled = true;
    btn.textContent = 'AI 正在分析……';
    $('analysis').innerHTML = '';

    AI.analyzeReading(AI.load(), state.passage.text, state.lastSpoken, state.lastCmp)
      .then(function (r) {
        renderAnalysis(r);
      })
      .catch(function (err) {
        App.toast(err.message, 'error');
      })
      .finally(function () {
        analyzing = false;
        btn.disabled = false;
        btn.textContent = '🧠 AI 深度分析（重音 / 连读）';
      });
  }

  function renderAnalysis(r) {
    var box = $('analysis');
    var html = '';
    if (r.overall) html += '<p class="analysis-overall">' + esc(r.overall) + '</p>';
    if (Array.isArray(r.issues) && r.issues.length) {
      html += '<div class="issue-list">';
      r.issues.forEach(function (it) {
        html += '<div class="issue-item">' +
          '<div class="issue-head"><span class="issue-word">' + esc(it.word || '') + '</span>' +
          '<span class="issue-type">' + esc(it.type || '发音') + '</span></div>' +
          '<p>' + esc(it.advice || '') + '</p></div>';
      });
      html += '</div>';
    }
    if (Array.isArray(r.drills) && r.drills.length) {
      html += '<div class="drills"><h3>练习句</h3><ul>';
      r.drills.forEach(function (d) {
        html += '<li>' + esc(d) + ' <button class="tts-mini" data-tts="' + esc(d) + '">🔊</button></li>';
      });
      html += '</ul></div>';
    }
    box.innerHTML = html || '<p class="muted">AI 没有返回分析内容，请重试。</p>';
    Array.prototype.forEach.call(box.querySelectorAll('.tts-mini'), function (b) {
      b.addEventListener('click', function () { Engine.TTS.speak(b.dataset.tts, { rate: 0.85 }); });
    });
  }

  /* ---------- 短文来源：AI 生成 / 自定义 ---------- */

  function genPassage() {
    var settings = AI.load();
    if (!settings.apiKey) {
      App.toast('AI 生成需要先配置 API Key（右上角 ⚙）', 'error');
      App.openSettings();
      return;
    }
    var topic = $('gen-topic').value.trim() || '日常生活';
    var level = $('gen-level').value;
    var btn = $('gen-submit');
    btn.disabled = true;
    btn.textContent = '生成中……';
    AI.generatePassage(settings, topic, level)
      .then(function (p) {
        if (!p || !p.text) throw new Error('生成结果为空，请重试');
        setPassage({ title: p.title || topic, level: level, text: String(p.text).trim() });
        $('gen-form').classList.add('hidden');
        App.toast('短文已生成，开始朗读吧！', 'ok');
      })
      .catch(function (err) {
        App.toast(err.message, 'error');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = '生成';
      });
  }

  function useCustomText() {
    var text = $('custom-text').value.trim();
    var words = Diff.tokenize(text).length;
    if (words < 5) { App.toast('请输入至少 5 个单词的英文文本', 'error'); return; }
    if (words > 300) { App.toast('文本太长，请控制在 300 词以内', 'error'); return; }
    setPassage({ title: '自定义文本', level: '自选', text: text });
    $('custom-form').classList.add('hidden');
    App.toast('已加载自定义文本', 'ok');
  }

  function demoRead() {
    if (!state.passage) return;
    Engine.TTS.speak(state.passage.text, { rate: 0.9 });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  root.Practice = {
    init: init,
    // 调试/自动化测试用：把一段文本当作识别结果走完整流程
    simulateTranscript: handleTranscript
  };
})(typeof window !== 'undefined' ? window : globalThis);
