/* AI 客户端：OpenAI 兼容 /chat/completions，多厂商预设，设置存 localStorage */
(function (root) {
  'use strict';

  var STORE_KEY = 'accentCoach.settings.v1';

  var PRESETS = [
    { id: 'zhipu',      name: '智谱 GLM（有免费模型）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',       model: 'glm-4-flash' },
    { id: 'siliconflow', name: '硅基流动（国内直连）',  baseUrl: 'https://api.siliconflow.cn/v1',              model: 'deepseek-ai/DeepSeek-V3' },
    { id: 'doubao',     name: '豆包（火山方舟）',         baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',   model: 'doubao-seed-1.6-flash' },
    { id: 'deepseek',   name: 'DeepSeek',               baseUrl: 'https://api.deepseek.com/v1',                model: 'deepseek-chat' },
    { id: 'moonshot',   name: '月之暗面 Kimi',           baseUrl: 'https://api.moonshot.cn/v1',                 model: 'moonshot-v1-8k' },
    { id: 'qwen',       name: '阿里通义千问',             baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'openai',     name: 'OpenAI',                 baseUrl: 'https://api.openai.com/v1',                  model: 'gpt-4o-mini' },
    { id: 'custom',     name: '自定义（OpenAI 兼容）',    baseUrl: '',                                           model: '' }
  ];

  var DEFAULTS = {
    preset: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4-flash',
    autoSpeak: true,
    level: '中级',
    voiceName: '',
    rate: 0.95,
    theme: 'auto',
    glass: true,
    asrMode: 'auto',
    asrPreset: 'siliconflow',
    providerProfiles: {},
    asrProfiles: {}
  };

  function cleanProfile(profile, preset) {
    profile = profile || {};
    preset = preset || PRESETS[0];
    return {
      baseUrl: String(profile.baseUrl || preset.baseUrl || '').trim(),
      apiKey: String(profile.apiKey || '').replace(/\s+/g, ''),
      model: String(profile.model || preset.model || '').trim()
    };
  }

  function profileFor(settings, id) {
    settings = settings || {};
    var preset = presetById(id);
    var profiles = settings.providerProfiles || {};
    return cleanProfile(profiles[id], preset);
  }

  function normalize(raw) {
    raw = raw || {};
    var settings = Object.assign({}, DEFAULTS, raw);
    settings.preset = presetById(settings.preset).id;
    settings.providerProfiles = Object.assign({}, raw.providerProfiles || {});
    settings.asrProfiles = Object.assign({}, raw.asrProfiles || {});

    // 旧版本只有一组扁平配置；首次升级时迁移到当时选中的服务商。
    if (!settings.providerProfiles[settings.preset]) {
      var legacy = !raw.providerProfiles && raw.preset === settings.preset;
      settings.providerProfiles[settings.preset] = cleanProfile(legacy ? {
        baseUrl: raw.baseUrl,
        apiKey: raw.apiKey,
        model: raw.model
      } : null, presetById(settings.preset));
    }

    // 对外仍暴露当前服务商的扁平字段，兼容现有业务模块。
    var active = profileFor(settings, settings.preset);
    settings.baseUrl = active.baseUrl;
    settings.apiKey = active.apiKey;
    settings.model = active.model;
    return settings;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return normalize(raw ? JSON.parse(raw) : {});
    } catch (e) {
      return normalize({});
    }
  }

  function save(settings) {
    localStorage.setItem(STORE_KEY, JSON.stringify(normalize(settings)));
  }

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  // 从模型输出里稳健地取 JSON（容忍代码块、前后缀文本）
  function extractJSON(text) {
    if (!text) return null;
    var cleaned = text.replace(/```json/gi, '```').trim();
    try { return JSON.parse(cleaned); } catch (e) { /* continue */ }
    var start = cleaned.indexOf('{');
    var end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e2) { /* continue */ }
    }
    return null;
  }

  // 核心请求：messages 数组 → 文本回复
  function chat(settings, messages, opts) {
    opts = opts || {};
    if (!settings.apiKey) {
      return Promise.reject(new Error('尚未配置 AI。请点击右上角 ⚙ 填写 API Key（朗读对比无需 AI，深度分析和对话需要）。'));
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, opts.timeout || 60000);
    var url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey
      },
      body: JSON.stringify({
        model: settings.model,
        messages: messages,
        temperature: opts.temperature != null ? opts.temperature : 0.6,
        max_tokens: opts.maxTokens || 1024
      }),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
    if (!res.ok) {
      return res.text().then(function (body) {
        var msg = 'AI 请求失败（HTTP ' + res.status + '）';
        try {
          var j = JSON.parse(body);
          if (j.error && j.error.message) msg += '：' + j.error.message;
        } catch (e) {
          if (res.status === 401) msg += '：API Key 无效或未授权';
          if (res.status === 404) msg += '：接口地址或模型名可能不对';
        }
        if (res.status === 429) msg += '：调用频率/额度超限';
        if (res.status === 401) {
          msg += ' ｜ 请点右上角 ⚙ 重新复制粘贴完整的 API Key，并确认 Key 与所选服务商匹配';
        }
        throw new Error(msg);
      });
    }
      return res.json();
    }).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      if (!text) throw new Error('AI 返回了空内容');
      return text.trim();
    }).catch(function (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('AI 请求超时，请重试或换更快的模型');
      if (err instanceof TypeError) {
        throw new Error('无法连接 AI 接口（网络错误或跨域限制）。请检查接口地址与网络；个别厂商不允许浏览器直连，可换用其他预设。');
      }
      throw err;
    });
  }

  // 要求模型输出 JSON 的封装：解析失败时把原文放进 err.parseText
  function chatJSON(settings, messages, opts) {
    return chat(settings, messages, opts).then(function (text) {
      var obj = extractJSON(text);
      if (obj) return obj;
      var err = new Error('AI 未按要求返回 JSON，请重试或更换模型');
      err.parseText = text;
      throw err;
    });
  }

  /* ---------- 提示词 ---------- */

  var LEVEL_DESC = {
    '初级': 'CEFR A2 左右：短句、高频词、语速慢',
    '中级': 'CEFR B1-B2：日常流利表达，可用常见习语',
    '高级': 'CEFR C1：接近母语者，自然、有细节'
  };

  // 朗读纠音：让 AI 分析重音/连读/弱读等问题
  function analyzeReading(settings, targetText, spokenText, cmp) {
    function words(list) {
      return list.slice(0, 40).map(function (op) {
        if (op.type === 'wrong') return op.target.raw + '（识别成了 ' + op.spoken.raw + '）';
        return op.target.raw;
      }).join('、') || '无';
    }
    var sys = '你是专业的英语发音教练，服务中国学员，精通英语语音学：重音、连读、弱读、节奏、常见中式发音问题。你只输出 JSON，不输出任何其他文字。';
    var user = [
      '学员朗读了下面这段英文，另一段是语音识别结果。识别结果可能把发音不清的词转写成别的词，请据此推断可能的发音问题。',
      '',
      '【目标文本】' + targetText,
      '【识别结果】' + (spokenText || '（空）'),
      '【逐词对比】正确 ' + cmp.matched + ' 词；疑似读错：' + words(cmp.wrong) + '；漏读：' + words(cmp.missing),
      '',
      '请分析并输出 JSON（中文说明）：',
      '{"overall":"一两句总评，先肯定再指出重点","score":0到100的整数,"issues":[{"word":"目标词或词组","type":"重音|连读|弱读|发音|流利度","advice":"具体可操作的中文建议，如该重读哪个音节、哪两个词要连读、口型舌位要点"}],"drills":["1-2句含同类问题的针对性练习句"]}',
      'issues 最多 5 条，按重要性排序；若识别结果与文本几乎一致且无明显问题，也请基于文本本身给出 1-2 条进阶建议（连读、节奏等）。'
    ].join('\n');
    return chatJSON(settings, [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ], { temperature: 0.4, maxTokens: 1200 });
  }

  // 生成朗读短文
  function generatePassage(settings, topic, level) {
    var sys = '你是英语教学材料编写专家。你只输出 JSON，不输出任何其他文字。';
    var user = '请为英语学习者写一段朗读短文。主题：' + (topic || '日常生活') + '。难度：' + level + '（' + (LEVEL_DESC[level] || '') + '）。' +
      '要求：60~90 个英文单词；包含自然的口语现象（连读、弱读、词组）以便练习发音；只输出 JSON：{"title":"中文标题","text":"英文短文"}';
    return chatJSON(settings, [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ], { temperature: 0.8, maxTokens: 500 });
  }

  // 对话陪练：系统提示词（含纠错职责）
  function chatSystemPrompt(scenario, level) {
    return [
      '你是一位友好、耐心的英语口语陪练教练，正在和中国学员进行角色扮演对话。',
      '场景：' + scenario + '。学员水平：' + level + '（' + (LEVEL_DESC[level] || '') + '）。',
      '要求：',
      '1. 用符合该水平的英语与学员对话，回复简短自然（通常 1~3 句），像真人一样推进对话，可适当提问。',
      '2. 学员的话来自语音识别，可能有转写错误；只有较有把握时才纠正。',
      '3. 每次回复只输出 JSON：{"reply":"你的英文回复","translate":"reply 的中文翻译","corrections":[{"original":"学员原句","improved":"更地道的说法","note":"中文说明问题（语法/用词/连读/重音等），一句话"}]}',
      '4. corrections 没有问题时为空数组；corrections 里最多 2 条，挑最值得改的。'
    ].join('\n');
  }

  root.AI = {
    PRESETS: PRESETS,
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    presetById: presetById,
    profileFor: profileFor,
    normalize: normalize,
    chat: chat,
    chatJSON: chatJSON,
    extractJSON: extractJSON,
    analyzeReading: analyzeReading,
    generatePassage: generatePassage,
    chatSystemPrompt: chatSystemPrompt,
    LEVEL_DESC: LEVEL_DESC
  };
})(typeof window !== 'undefined' ? window : globalThis);
