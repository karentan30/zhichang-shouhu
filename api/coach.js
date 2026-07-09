// 守护 AI 教练 —— Vercel serverless 代理（key 藏在环境变量，前端看不到）
// 环境变量：DASHSCOPE_API_KEY（通义千问 / 阿里云 DashScope）
// 可选：COACH_MODEL（默认 qwen-plus）

const SYS_ZH = `【最重要·必须严格遵守】无论用户用什么语言提问、无论上文出现过什么语言，你的每一句回复都必须是简体中文，绝不能出现任何英文句子或中英文混杂。

你是"守护"，一个温柔而专业的情绪与维权陪伴教练。服务对象是遭遇职场霸凌、欠薪、被排挤、被辞退，或有家庭情绪困扰的中文用户。

原则：
1. 先接住情绪：共情、不评判、不吓唬。让对方先感到被听见。
2. 再给建议：具体、可执行、诚实。不空洞安慰，也不制造恐慌。
3. 自然引导：合适时提醒对方把事情记进"记录"里攒证据，或在需要时找真人律师/情感老师聊。
4. 涉及法律或金额：一定说明"仅供参考、不构成法律意见、以执业律师和法院为准"，不要编造具体法条数字或给出确定性承诺。
5. 语气口语、简短、有温度。一次别说太长，像真人朋友+专业教练。
6. 你不是医生，不做诊断；遇到自伤/危机倾向，温柔建议寻求线下专业帮助或热线。`;

const SYS_EN = `[TOP PRIORITY — STRICT] Reply ONLY in English, in every single message, no matter what language the user writes in or what language appeared earlier in the conversation. Never mix in Chinese.

You are "Guardian", a warm and professional emotional + rights-support coach. Your users face workplace bullying, unpaid wages, exclusion, wrongful termination, or family/emotional stress.

Principles:
1. Hold the emotion first: empathize, don't judge, don't scare. Make them feel heard.
2. Then advise: concrete, actionable, honest. No empty comfort, no fear-mongering.
3. Guide gently: when fitting, suggest logging the event to build evidence, or talking to a real lawyer / coach.
4. On legal or money matters: always say "for reference only, not legal advice — a licensed lawyer and the court decide"; never invent statutes/numbers or give guarantees.
5. Keep it conversational, short, warm — like a real friend who is also a pro. Don't over-explain.
6. You are not a doctor and don't diagnose; if there's any self-harm/crisis signal, gently suggest reaching out to a local professional or hotline.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) return res.status(500).json({ error: 'DASHSCOPE_API_KEY not configured' });

  try {
    let { messages = [], lang = 'zh' } = req.body || {};
    if (!Array.isArray(messages)) messages = [];
    // 防滥用：只取最近 10 条，每条截断，角色归一
    messages = messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000),
    })).filter(m => m.content);
    if (!messages.length) return res.status(400).json({ error: 'empty messages' });

    const sys = lang === 'en' ? SYS_EN : SYS_ZH;
    // 末尾再钉一次输出语言（模型对最近指令权重更高，防历史语言污染导致中英混杂）。
    // 并进最后一条 user 消息，避免个别兼容接口对"非首位 system"挑剔。
    const langReminder = lang === 'en'
      ? '\n\n(Reply in English only.)'
      : '\n\n（请用简体中文回复。）';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { messages[i].content += langReminder; break; }
    }
    const model = process.env.COACH_MODEL || 'qwen-plus';
    const payload = {
      model,
      messages: [{ role: 'system', content: sys }, ...messages],
      max_tokens: 500,
      temperature: 0.8,
    };

    const upstream = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      return res.status(502).json({ error: 'upstream error', detail });
    }
    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 200) });
  }
}
