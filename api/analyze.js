// ============================================================
// 增长罗盘 · Northstar — 数据洞察 LLM 分析 serverless 函数（Vercel Functions）
// 调 DeepSeek API 生成分模块分析文本（概览/趋势/归因/机会/风险/建议）
// 环境变量：DEEPSEEK_API_KEY
// ============================================================

const SYSTEM_PROMPT = `你是一名资深数据分析师，擅长把冷冰冰的数据转成有理有据、有洞察的业务结论。

你的任务：根据给出的数据概览、归因结果、实验检验结果，生成一份分模块的数据分析洞察。

核心要求（务必遵守）：
1. 结论必须基于给定数据，不要凭空臆测。引用具体数字（总量、占比、提升/下降幅度、p 值）。
2. 归因结论要呼应归因结果，明确指出主要贡献方，并解释为什么它贡献最大。
3. 实验检验结论要严谨：显著就明确说「显著」并给出幅度与置信含义；不显著就说「证据不足」，不要强下结论。
4. 机会点、风险点、建议要具体可执行，禁止正确的废话（如「加强运营」「提升体验」这类空话）。
5. 全程中文输出。

【输出格式要求】你必须只输出一个合法的 JSON 对象，不要输出任何其他文字，结构如下：
{
  "overview": "一句话概括整体数据表现（含关键总量）",
  "trend": "对指标变化趋势的解读（2-3 句）",
  "attribution": "对归因结果的解读，指出主要贡献方（2-3 句）",
  "opportunity": ["2-3 个数据中体现的增长机会点"],
  "risk": ["2-3 个数据中体现的风险点或异常"],
  "suggestion": ["2-3 条具体可执行的行动建议"]
}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { columns = [], rowCount, timeRange, metrics = [], attribution, experiment } = req.body || {};
    if (!metrics.length) {
      res.status(400).json({ error: '缺少指标数据' });
      return;
    }

    const context = [
      `【数据规模】${rowCount || '未知'} 行`,
      timeRange ? `【时间范围】${timeRange}` : '',
      `【字段】${columns.map((c) => `${c.name}(${c.type})`).join('、')}`,
      `【核心指标】${metrics.map((m) => `${m.name}: 总量 ${m.sum}, 均值 ${m.avg}, 峰值 ${m.max}, 谷值 ${m.min}`).join('；')}`,
      attribution
        ? `【归因结果】指标「${attribution.metricName}」按「${attribution.dimName}」拆解：${attribution.items.map((i) => `${i.key} 贡献 ${(i.share * 100).toFixed(1)}%（总量 ${i.sum}）`).join('、')}`
        : '【归因结果】无（未识别到可归因的维度）',
      experiment
        ? `【实验检验】按「${experiment.dimName}」分组（${experiment.g0} vs ${experiment.g1}）：${experiment.results.map((r) => `${r.name} 提升 ${r.liftPct}%（${r.significant ? '显著' : '不显著'}, p=${r.p}）`).join('；')}`
        : '【实验检验】无（未检测到分组数据）'
    ].filter(Boolean).join('\n');

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: context }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 3000
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('DeepSeek 调用失败:', upstream.status, errText);
      res.status(502).json({ error: `DeepSeek 调用失败（${upstream.status}）` });
      return;
    }

    const upstreamData = await upstream.json();
    const content = upstreamData?.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: 'DeepSeek 返回内容为空' });
      return;
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      res.status(502).json({ error: 'DeepSeek 返回的不是合法 JSON' });
      return;
    }
    if (!data || typeof data !== 'object') {
      res.status(502).json({ error: '返回结构异常' });
      return;
    }

    res.status(200).json({ blocks: data });
  } catch (err) {
    console.error('LLM 分析失败:', err);
    res.status(500).json({ error: err?.message || 'LLM 调用失败' });
  }
}
