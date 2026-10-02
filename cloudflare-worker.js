/**
 * AccentCoach 豆包（火山方舟）CORS 代理 —— 部署到 Cloudflare Workers（免费）即可让浏览器直连豆包。
 *
 * 为什么需要它：火山方舟接口不返回 CORS 头，浏览器直连会被拦截；本 Worker 原样转发请求与 Key。
 *
 * 部署（约 5 分钟）：
 *   1. 注册/登录 https://dash.cloudflare.com → Workers & Pages → Create Worker → Deploy
 *   2. Edit code：粘贴本文件全部内容 → Deploy
 *   3. 回到 AccentCoach 设置：AI 服务商选「豆包（火山方舟）」，
 *      接口地址改为  https://你的子域名.workers.dev/v3  ，API Key 填火山方舟的 Key（见下）
 *
 * 火山方舟 API Key 获取：
 *   https://console.volcengine.com/ark/ →左侧「API Key 管理」→ 创建；
 *   模型可填 doubao-seed-1.6 系列模型 ID，或在「在线推理」创建接入点后填 ep- 开头的 ID。
 *
 * 可选（防止别人盗用你的 Worker）：
 *   Worker → Settings → Variables → 添加 ARK_API_KEY = 火山方舟Key（服务端保管，浏览器 Key 栏随便填）；
 *   再添加 ACCESS_TOKEN = 自定义口令，此时 AccentCoach 的 Key 栏填这个口令。
 */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: { message: '仅支持 POST' } }), {
        status: 405, headers: cors
      });
    }

    // /v3/chat/completions → https://ark.cn-beijing.volces.com/api/v3/chat/completions
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/v3/, '/api/v3');

    const headers = { 'Content-Type': 'application/json' };
    if (env && env.ARK_API_KEY) {
      // 服务端密钥模式：可选用 ACCESS_TOKEN 限制谁能用这个 Worker
      if (env.ACCESS_TOKEN) {
        const auth = request.headers.get('Authorization') || '';
        if (auth !== 'Bearer ' + env.ACCESS_TOKEN) {
          return new Response(JSON.stringify({ error: { message: 'ACCESS_TOKEN 不匹配' } }), {
            status: 401, headers: cors
          });
        }
      }
      headers['Authorization'] = 'Bearer ' + env.ARK_API_KEY;
    } else {
      // 透传模式：浏览器填的豆包 Key 原样转发
      const auth = request.headers.get('Authorization');
      if (!auth) {
        return new Response(JSON.stringify({ error: { message: '缺少 API Key' } }), {
          status: 401, headers: cors
        });
      }
      headers['Authorization'] = auth;
    }

    const upstream = await fetch('https://ark.cn-beijing.volces.com' + path, {
      method: 'POST',
      headers: headers,
      body: await request.text()
    });
    const out = new Response(upstream.body, upstream);
    Object.keys(cors).forEach(function (k) { out.headers.set(k, cors[k]); });
    return out;
  }
};
