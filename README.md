# AccentCoach · 在线口音纠正

一个**纯前端**的英语口语纠音与陪练 Web 应用，零后端、零构建，手机端可用。

**线上地址（已部署 GitHub Pages）：<https://jim080411123-sudo.github.io/accent-coach/>**

手机打开该地址：安卓 Chrome 点页面顶部「安装」横幅（或菜单 → 安装应用）；iPhone Safari 点分享 ⬆️ → 「添加到主屏幕」。装完桌面就有独立图标，全屏运行。

对应需求文档《在线口音纠正》：

| 需求 | 实现 |
|------|------|
| 1. 朗读英语时纠正口语（重音、连读等） | 「朗读纠音」标签：浏览器语音识别 → 与原文逐词对比（读错标红/漏读标灰/正确标绿）→ AI 深度分析重音、连读、弱读等问题并给出练习句 |
| 2. 生成对话文本，与 AI 英文对话，AI 纠错 | 「AI 对话」标签：7 种场景角色扮演，AI 每轮回复附中文翻译 + 纠错卡片（原句 / 改进 / 说明） |
| 3. 界面简洁 | 单页双标签 + 底部抽屉设置；可选「液态玻璃」外观（毛玻璃 + 流动光斑 + 动效，可关）；主题三档：跟随系统 / 浅色 / 深色 |
| 4. AI 可设置 | 对话 AI 与语音转写分区配置；每个服务商分别保存自己的 Base URL、API Key 和模型，切换时自动带出对应配置 |
| 5. 手机端可用 | 移动优先响应式布局，iOS/安卓浏览器直接访问 |

## 快速开始

```bash
cd accent-coach
python -m http.server 8613
# 浏览器打开 http://127.0.0.1:8613
```

手机访问：让手机与电脑连同一 Wi-Fi，改用 `python -m http.server 8613 --bind 0.0.0.0`，手机浏览器访问 `http://<电脑局域网IP>:8613`。

也可以直接部署到 GitHub Pages / Vercel / Netlify（整个目录就是静态站点）。

### 配置对话 AI（右上角 ⚙ → 对话 AI）

1. 选择服务商（智谱 GLM 的 `glm-4-flash` 有免费额度，适合先体验）；
2. 填入该服务商的 API Key；
3. 点「测试对话 AI 连接」确认，保存。

切换服务商时，界面会立即加载该服务商自己保存的 Base URL、API Key 和模型。尚未配置过的服务商显示空 Key，不会误用上一家的 Key。

> 说明：**逐词对比评分不需要 AI**，纯本地完成；「AI 深度分析」「AI 生成短文」「AI 对话」需要 API Key。Key 仅保存在本机浏览器，请求由浏览器直连服务商，不经过任何中间服务器。

## 技术方案

- **语音识别**：Web Speech API（`webkitSpeechRecognition`），Chrome / Edge 桌面端与安卓 Chrome 支持最好；识别在系统级在线服务完成。
- **发音评估**：识别文本与目标文本做词级 LCS 对齐（含连读合并词、替换词的相似度配对，见 `js/diff.js`，配 13 个单元测试），得到读错/漏读/插入标注与得分。
- **深度纠音**：将逐词对比结果交给 LLM 分析，输出重音、连读、弱读、发音口型等针对性建议（`js/ai.js` 内置提示词）。
- **对话陪练**：要求模型以 JSON 返回 `{reply, translate, corrections[]}`，前端稳健解析（容忍代码块包裹），逐轮携带历史。
- **语音合成**：`speechSynthesis` 朗读示范短文 / AI 回复 / 练习句。

## 手机端自主使用（已部署，直接看上面地址；以下为自行部署的做法）

App 已 PWA 化（manifest + Service Worker + 图标），装到手机主屏幕后全屏运行、断网也能打开界面（AI 功能需联网）。**关键一步是把它放到一个 https 地址上**，这样手机不再依赖电脑：

- **Vercel（最简单）**：注册 [vercel.com](https://vercel.com) → New Project → 直接上传本目录（或推到 GitHub 再导入）→ 得到 `https://xxx.vercel.app`
- **GitHub Pages**：仓库 Settings → Pages → 选分支根目录 → 得到 `https://<用户名>.github.io/<仓库名>`
- **Cloudflare Pages**：同理免费托管，顺便和下文的 Worker 同账号管理

部署后手机浏览器打开地址：

- **安卓 Chrome**：菜单 →「添加到主屏幕/安装应用」→ 桌面出现独立图标，全屏运行
- **iOS Safari**：分享 →「添加到主屏幕」

临时方案（不部署）：电脑跑 `python -m http.server 8613 --bind 0.0.0.0`，手机连同一 Wi-Fi 访问 `http://<电脑IP>:8613`。注意局域网 http 下 Service Worker 不生效、iPhone 上语音识别不稳定，仅适合试用。

## 接入豆包（火山方舟）

实测火山方舟接口**不允许浏览器跨域直连**（其余预设厂商均可直连），需要先花 5 分钟部署一个免费代理，项目里已备好现成文件：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create Worker → Deploy 后点 Edit code；
2. 用 [cloudflare-worker.js](cloudflare-worker.js) 的全部内容替换默认代码 → Deploy，记下地址 `https://你的子域名.workers.dev`；
3. 到 [火山方舟控制台](https://console.volcengine.com/ark/) 「API Key 管理」创建 Key；
4. AccentCoach 设置 → 服务商选「豆包（火山方舟）」→ **接口地址改为 `https://你的子域名.workers.dev/v3`** → 填入 Key → 测试连接。

模型填 `doubao-seed-1.6` 系列（如 `doubao-seed-1.6-flash`），或在方舟「在线推理」创建接入点后填 `ep-` 开头的 ID。想防止别人盗用代理，可按文件头部注释配置服务端密钥模式。

### 各厂商浏览器直连实测

| 服务商 | 浏览器直连 | 说明 |
|--------|-----------|------|
| 智谱 / DeepSeek / Kimi / 通义 / OpenAI | ✅ | 填 Key 即用 |
| 豆包（火山方舟） | ❌ | 无 CORS 头，按上文部署 Worker 后可用 |

## 更换发音音色与语速

设置面板（右上角 ⚙）新增「发音音色」与「语速」，作用于示范朗读、AI 回复朗读、练习句朗读：

- 音色列表来自设备系统 TTS（英语音色排前，非英语的会标注）；点 🔊 试听；
- 语速 0.5x~1.5x，练习跟读建议 0.8~0.95；
- 手机端自带高质量英语音色（iOS 的 Samantha、安卓的 Google English 等），直接可选。

**这台 Windows 电脑若列表里没有英语音色**：设置 → 时间和语言 → 语音 → 添加语音，安装 English (United States) 后重启浏览器即可（当前这台机器只装了中文语音包 Huihui/Kangkang/Yaoyao）。

> 想要豆包那种拟人 TTS 音色？火山方舟的语音合成接口同样有跨域限制且协议不同（非 OpenAI 兼容），需要单独的代理转换，暂未内置；系统音色 + 语速调节已能满足跟读场景。

## 语音识别说明（重要）

设置的「语音转写」已经与「对话 AI」完全分开，可选三种方式：

- **自动（默认）**：先用浏览器内置识别；只有在已经单独配置转写服务时，失败后才自动切换；
- **仅浏览器识别**：Web Speech API，走谷歌/苹果在线服务——**中国大陆安卓手机不可达**（会报 aborted 或无结果），桌面端需可访问谷歌网络；
- **仅独立转写服务（国内手机推荐）**：页面内录音 → 转码 16kHz WAV → 上传给转写区所配服务商的 `/audio/transcriptions`。支持智谱、硅基流动 SenseVoice、OpenAI Whisper 和自定义兼容接口。它使用独立 Key，切换对话 AI 不会影响转写；录音内容会上传至所选转写服务商。

免配置方案是「仅浏览器内置」，无需 API Key；但中国大陆安卓环境通常无法连接其在线识别服务。国内网络稳定使用目前仍需一次性配置独立转写服务，推荐硅基流动 SenseVoice。纯前端网页无法在不下载本地语音模型、也不调用云服务的前提下稳定完成转写。

安卓「添加到主屏幕」的安装版（WebAPK）受系统限制无法调用谷歌语音服务，属于安卓/Chromium 已知行为；安装版里请选「仅 AI 转写」，或在 Chrome 浏览器中打开网址使用。iPhone 建议用 Safari 打开（不要用主屏幕图标），并打开 设置→通用→键盘→启用听写。

## 已知限制

- 浏览器内置语音识别依赖谷歌/苹果在线服务，**中国大陆手机网络下通常不可用**，请使用设置中独立的转写服务（见上文）。
- 浏览器麦克风权限需要 `https` 或 `localhost` 环境。
- 识别文本的对比是「发音问题」的间接信号（识别错的词通常是发音不清的词），AI 分析部分已提示模型据此推断而非下定论。
- 个别厂商接口不允许浏览器跨域直连，如遇连接失败可换预设或在自定义里填支持 CORS 的地址（实测情况见上文表格）。

## 外观设置

右上角 ⚙ →「外观 · 主题」可选 **跟随系统 / 浅色 / 深色**；「液态玻璃效果」开关控制毛玻璃卡片、流动光斑背景、入场动效（默认开启）。旧设备若感觉卡顿可关闭；不支持 backdrop-filter 的浏览器自动回退为纯色卡片；系统开启"减弱动态效果"时动效自动停用。

## 后续可扩展

- 接入发音评估 API（如 Azure Speech Pronunciation Assessment）做音素级评分——设置面板已预留「自定义接口」位。
- 生成跟读音频对比（示范朗读录音 vs 学员录音）。
- 学习记录与错词本（localStorage）。

## 参考的开源项目

设计前调研了这些项目，思路上有借鉴：

- [Oliviaviaviavia/english-trainer](https://github.com/Oliviaviaviavia/english-trainer) — 连读训练；Azure 发音评估 + 浏览器识别粗评的降级组合
- [Thiagohgl/ai-pronunciation-trainer](https://github.com/Thiagohgl/ai-pronunciation-trainer) — AI 发音评估 Web 应用
- [ajajaj238/smart-voice](https://github.com/ajajaj238/smart-voice) — 场景化对话、逐句反馈的 Web 口语练习系统
- [laoba-01/AI-Spoken-English-Practice-Partner](https://github.com/laoba-01/AI-Spoken-English-Practice-Partner) — Go + Vue3 口语陪练平台
- [Halleck45/OpenPronounce](https://github.com/Halleck45/OpenPronounce) — 音素级发音评估
- [SSDWGG/svs](https://github.com/SSDWGG/svs) — 音标/连读/弱读/语调训练课程
- [nikdelvin/liquid-glass](https://github.com/nikdelvin/liquid-glass) — 纯 CSS+SVG 滤镜复刻 iOS 26 液态玻璃（边缘折射增强的借鉴方向）
