const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const values = new Map();
const context = {
  console,
  AbortController,
  FormData,
  Blob,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  }
};
context.globalThis = context;
vm.createContext(context);

function run(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

run('ai.js');
run('asr.js');

// 旧版扁平配置会迁移到当时选中的服务商。
values.set('accentCoach.settings.v1', JSON.stringify({
  preset: 'zhipu',
  baseUrl: 'https://legacy.example/v1',
  apiKey: 'legacy-key',
  model: 'legacy-model'
}));
let settings = context.AI.load();
assert.equal(settings.providerProfiles.zhipu.apiKey, 'legacy-key');
assert.equal(settings.apiKey, 'legacy-key');

// 每个对话服务商保留自己的 Key；未配置的服务商不能继承上一家 Key。
settings.providerProfiles.deepseek = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'deepseek-key',
  model: 'deepseek-chat'
};
settings.preset = 'deepseek';
settings.baseUrl = settings.providerProfiles.deepseek.baseUrl;
settings.apiKey = settings.providerProfiles.deepseek.apiKey;
settings.model = settings.providerProfiles.deepseek.model;
context.AI.save(settings);
settings = context.AI.load();
assert.equal(settings.apiKey, 'deepseek-key');
assert.equal(context.AI.profileFor(settings, 'zhipu').apiKey, 'legacy-key');
assert.equal(context.AI.profileFor(settings, 'openai').apiKey, '');

// 语音转写配置完全独立于对话 AI。
settings.asrPreset = 'siliconflow';
settings.asrProfiles = {
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: 'asr-only-key',
    model: 'FunAudioLLM/SenseVoiceSmall'
  }
};
context.AI.save(settings);
settings = context.AI.load();
assert.equal(context.ASR.profileFor(settings, 'siliconflow').apiKey, 'asr-only-key');
assert.equal(settings.apiKey, 'deepseek-key');
assert.equal(context.ASR.isConfigured(settings), true);

console.log('settings tests passed');
