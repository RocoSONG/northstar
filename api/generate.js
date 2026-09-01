// ============================================================
// 增长罗盘 · Northstar — LLM 生成 serverless 函数（Vercel Functions）
// 调 DeepSeek API（OpenAI 兼容）生成：定制化玩法 + 项目诊断
// 环境变量：DEEPSEEK_API_KEY
// ============================================================

const SYSTEM_PROMPT = `你是一名资深用户增长策略专家，服务互联网产品与消费品牌的增长团队。

你的任务：根据用户提供的业务背景与增长诉求，生成【深度定制化】的增长玩法策略与项目诊断。

核心要求（务必遵守）：
1. 深度定制，禁止模板化：不要套用"满减/折扣/打卡"这类通用套路。仔细阅读业务背景，识别其中的品牌/平台/产品特有元素（例如星巴克的"星星"、三顿半的"顿点"、京东 PLUS 的"积分"、会员等级体系、产品独特功能等），并把这些元素自然编织进玩法机制里，让策略看起来是为这个业务量身定制的。
2. 玩法要有创意且可落地：每个玩法给出具体机制（触发方式、参与路径、奖励设计），而不是空洞的行业话术。用户就是因为想不出有创意的增长策略才使用你。
3. 诊断要精准：总结业务背景、明确核心目标、识别增长卡点、指出机会点。
4. 全程用中文输出。

【输出格式要求】你必须只输出一个合法的 JSON 对象，不要输出任何其他文字，结构如下：
{
  "diagnosis": {
    "bgSummary": "一句话总结业务背景与增长诉求",
    "objective": "核心增长目标的一句话陈述",
    "blockers": ["2-3 个增长卡点或难点"],
    "opportunities": ["2-3 个可杠杆的增长机会点"]
  },
  "plays": [
    {
      "name": "玩法名称（有创意、有记忆点）",
      "mechanism": "具体可执行的玩法机制（触发方式、参与路径、奖励设计）",
      "hook": "创意点 / 差异化亮点（一句话）"
    }
  ],
  "executionPlan": {
    "phases": [
      {
        "phase": "阶段名称（如预热期/爆发期/返场期）",
        "duration": "D-3 ~ D-1",
        "goalShare": 0.2,
        "actions": ["该阶段要执行的具体动作，必须点名玩法名称与机制"]
      }
    ]
  },
  "budgetAllocation": {
    "items": [
      {
        "channel": "渠道名称",
        "pct": 40,
        "reason": "为什么把预算投在这里，必须与上面的玩法机制联动"
      }
    ]
  },
  "benefitRules": [
    {
      "label": "权益名称（如：新客立减券）",
      "rule": "具体规则：面额、使用门槛、是否可叠加、领取上限等",
      "limit": true
    }
  ],
  "risks": [
    {
      "level": "low|medium|high",
      "content": "项目整体风险（含权益资损/羊毛风险与经营风险，见下方说明）"
    }
  ]
}
其中：
- plays 数组必须包含恰好 3 个玩法。
- executionPlan.phases 必须包含 3-4 个阶段，goalShare 为各阶段目标人数占比（0~1 的小数，全部阶段相加约等于 1）。
- 执行计划与预算分配【严禁套模板】：每一个阶段动作、每一笔预算的理由，都必须点名具体玩法，并围绕玩法机制展开。例如玩法是「豆子积分裂变」，执行计划就写「爆发期上线邀请有礼：老客邀请新客各得 N 颗豆子，实时推送豆仓排行榜」，预算理由就写「因核心玩法依赖社交裂变，预算向社交媒体种草与老客召回倾斜」。绝不允许出现「站内 push + 广告投放」这类与玩法无关的通用话术。
- benefitRules 基于用户选择的权益工具（优惠券/积分/会员权益等）与业务背景，设计 2-3 条具体权益规则（面额、门槛、叠加、限量）。
- risks = 项目「整体风险」，输出 3-5 条，务必覆盖两方面且各条不重复：一是权益资损/羊毛风险（成本失控、套利、重复领取），二是项目经营风险（获客成本、转化不及预期、渠道依赖、时间窗口、竞品、人群匹配）。`;

export default async function handler(req, res) {
  // CORS（前端部署在 GitHub Pages，跨域调用）
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
    const { bg, goal, platform, audienceTags = [], tools = [], channels = [] } = req.body || {};
    if (!bg || !goal) {
      res.status(400).json({ error: '缺少业务背景(bg)或增长目标(goal)' });
      return;
    }

    const userContent = [
      `【业务背景】${bg}`,
      `【增长目标】${goal}`,
      platform ? `【平台/载体】${platform}` : '',
      audienceTags.length ? `【目标人群】${audienceTags.join('、')}` : '',
      tools.length ? `【可用权益/激励工具】${tools.join('、')}` : '',
      channels.length ? `【触达渠道】${channels.join('、')}` : ''
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
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.9,
        max_tokens: 4000
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

    // DeepSeek JSON 模式返回 JSON 字符串，解析并校验结构
    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      res.status(502).json({ error: 'DeepSeek 返回的不是合法 JSON' });
      return;
    }
    if (!data || !Array.isArray(data.plays) || !data.diagnosis) {
      res.status(502).json({ error: '返回结构缺少 plays 或 diagnosis' });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('LLM 生成失败:', err);
    res.status(500).json({ error: err?.message || 'LLM 调用失败' });
  }
}
