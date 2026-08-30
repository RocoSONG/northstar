/* ============================================================
   增长罗盘 · Northstar — 策划模块引擎（mock 生成器）
   方案生成 · 权益校验 · 预估模型 · 指标 Schema
   原则：通用增长 —— 服务电商与互联网产品（App/内容/AI 平台），
        不预设任何行业专属打法；货品为可选参考，重心在玩法与策略。
   ============================================================ */

(function (global) {
  'use strict';

  /* ============================================================
     指标模板（通用增长指标字典）
     ============================================================ */
  const METRIC_TEMPLATES = {
    // 拉新
    '新增用户数':    { unit: '人', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'target' },
    '注册转化率':    { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '获客成本':      { unit: '元', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'limit', alertRule: 'above' },
    '渠道拉新占比':  { unit: '%',  type: 'percent', chart: 'bar',   aggregation: 'daily', compare: 'target' },
    // 激活
    '激活率':        { unit: '%',  type: 'percent', chart: 'gauge', aggregation: 'daily', compare: 'baseline' },
    '激活用户数':    { unit: '人', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'target' },
    '激活转化率':    { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '激活成本':      { unit: '元', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'limit', alertRule: 'above' },
    // 留存
    '次日留存率':    { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '7日留存率':     { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    'DAU/MAU':       { unit: '%',  type: 'percent', chart: 'gauge', aggregation: 'daily', compare: 'baseline' },
    '流失率':        { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'limit', alertRule: 'above' },
    // 转化
    '付费转化率':    { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '付费用户数':    { unit: '人', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'target' },
    'ARPU':          { unit: '元', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    'LTV':           { unit: '元', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    // 传播
    '裂变系数':      { unit: '倍', type: 'number',  chart: 'line',  aggregation: 'daily', compare: 'target' },
    '分享率':        { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '邀请转化率':    { unit: '%',  type: 'percent', chart: 'line',  aggregation: 'daily', compare: 'baseline' },
    '传播新增占比':  { unit: '%',  type: 'percent', chart: 'bar',   aggregation: 'daily', compare: 'target' }
  };
  const DEFAULT_METRIC = { unit: '', type: 'number', chart: 'line', aggregation: 'daily', compare: 'target' };

  /* ============================================================
     权益校验（防资损 / 防羊毛 · 确定性校验）
     ============================================================ */
  function validateBenefits(benefits, ctx) {
    // ctx: { budget, estCore, unitCost }
    const issues = [];
    benefits.filter(b => b.cost != null).forEach((b) => {
      // 单份权益成本 vs 合理上限（按预算均摊的每核心用户成本）
      const perUserBudget = (ctx.budget || 0) / (ctx.estCore || 1);
      if (b.cost > perUserBudget * 1.2) {
        issues.push({
          level: 'high', code: 'loss',
          msg: `权益「${b.label}」单份成本 ${b.cost} 元，高于人均预算 ${Math.round(perUserBudget)} 元，存在亏损风险。`
        });
      }
    });

    // 叠加成本
    const stackable = benefits.filter(b => b.stackable);
    if (stackable.length > 1) {
      const total = stackable.reduce((s, b) => s + (b.cost || 0), 0);
      const totalCost = total * (ctx.estCore || 0);
      if (totalCost > (ctx.budget || 0) * 0.6) {
        issues.push({
          level: 'medium', code: 'stack',
          msg: `${stackable.length} 项可叠加权益，叠加后单人均摊 ${total} 元，预计总成本 ${fmt(totalCost)} 元，占预算 ${pct(totalCost / (ctx.budget || 1))}，建议设叠加上限。`
        });
      }
    }

    // 总成本 ≤ 预算
    const totalCost = benefits.reduce((s, b) => s + (b.cost || 0) * (ctx.estCore || 0), 0);
    if (ctx.budget && totalCost > ctx.budget * 0.8) {
      issues.push({
        level: 'high', code: 'budget',
        msg: `预计总激励成本 ${fmt(totalCost)} 元，达预算的 ${pct(totalCost / ctx.budget)}，接近/超出预算红线。`
      });
    }

    // 羊毛党漏洞
    benefits.forEach((b) => {
      if (b.cost > 0 && !b.limit) {
        issues.push({
          level: 'medium', code: 'loophole',
          msg: `权益「${b.label}」未设领取上限，存在被批量薅羊毛的风险，建议加每人限领/总量上限。`
        });
      }
    });

    return issues;
  }

  /* ============================================================
     预估模型（MVP 简化版 · 通用）
     核心转化量 = 曝光 × 点击率 × 转化率
     ============================================================ */
  const GOAL_PARAMS = {
    '拉新': { defaultCpm: 20, defaultCtr: 0.03, defaultCvr: 0.06, reachRate: 0.6, metricLabel: '新增用户数' },
    '激活': { defaultCpm: 15, defaultCtr: 0.03, defaultCvr: 0.25, reachRate: 0.5, metricLabel: '激活用户数' },
    '留存': { defaultCpm: 10, defaultCtr: 0.04, defaultCvr: 0.30, reachRate: 0.5, metricLabel: '召回活跃用户数' },
    '转化': { defaultCpm: 15, defaultCtr: 0.03, defaultCvr: 0.05, reachRate: 0.4, metricLabel: '付费用户数' },
    '传播': { defaultCpm: 8, defaultCtr: 0.04, defaultCvr: 0.08, reachRate: 0.5, metricLabel: '裂变新增用户数' }
  };

  function forecast(project) {
    const budget = Number(project.budget) || 50000;
    const p = GOAL_PARAMS[project.goal] || GOAL_PARAMS['拉新'];

    // 历史基线（自然状态参数，代表"不做增长策略"的表现）
    const hasCpm = project.baselineCpm != null && project.baselineCpm !== '';
    const hasCtr = project.baselineCtr != null && project.baselineCtr !== '';
    const hasCvr = project.baselineCvr != null && project.baselineCvr !== '';
    const cpm = hasCpm ? Number(project.baselineCpm) : p.defaultCpm;
    const ctr = hasCtr ? Number(project.baselineCtr) / 100 : p.defaultCtr;
    const cvr = hasCvr ? Number(project.baselineCvr) / 100 : p.defaultCvr;

    // 曝光 = 预算 / 曝光单价（千次 → 次）
    const exposure = Math.round((budget / cpm) * 1000);

    // 触达量受现有用户规模约束
    let reach = exposure;
    let userConstrained = false;
    if (project.baselineUsers != null && project.baselineUsers !== '') {
      const maxReach = Math.round(Number(project.baselineUsers) * p.reachRate);
      if (exposure > maxReach) { reach = maxReach; userConstrained = true; }
    }

    // 基线转化：不做增长策略的自然增长
    const baselineCount = Math.round(reach * ctr * cvr);

    // 策略增量：增长策略带来的 lift（>1 体现增长价值）
    const lift = calculateLift(project);
    const liftDetail = liftDetailText(project);

    // 总预估 = 基线 × lift
    const coreCount = Math.round(baselineCount * lift);
    const incremental = coreCount - baselineCount;

    const sources = {
      cpm: hasCpm ? '历史基线' : '行业默认',
      ctr: hasCtr ? '历史基线' : '行业默认',
      cvr: hasCvr ? '历史基线' : '行业默认'
    };

    return {
      exposure, ctr, cvr, cpm, coreCount, baselineCount, incremental, lift, liftDetail,
      metricLabel: p.metricLabel, sources,
      range: [Math.round(coreCount * 0.8), Math.round(coreCount * 1.2)], userConstrained
    };
  }

  // 策略 lift 系数：基于选定的权益 / 渠道 / 目标，估算增长策略带来的提升
  function calculateLift(project) {
    let lift = 1.0;
    const tools = project.tools || [];
    const channels = project.channels || [];
    if (tools.includes('优惠券') || tools.includes('折扣')) lift *= 1.3;
    if (tools.includes('免费体验')) lift *= 1.4;
    if (tools.includes('会员权益')) lift *= 1.2;
    if (tools.includes('积分') || tools.includes('赠品礼包')) lift *= 1.15;
    if (project.goal === '传播') lift *= 1.5;
    if (channels.includes('社交媒体') || channels.includes('内容种草')) lift *= 1.1;
    return Math.round(lift * 100) / 100;
  }

  function liftDetailText(project) {
    const parts = [];
    const tools = project.tools || [];
    if (tools.includes('免费体验')) parts.push('免费体验降低首次尝试门槛');
    if (tools.includes('优惠券') || tools.includes('折扣')) parts.push('权益激励提升转化率');
    if (tools.includes('会员权益')) parts.push('会员权益增强粘性');
    if (project.goal === '传播') parts.push('裂变机制带来指数级新增');
    if ((project.channels || []).includes('社交媒体') || (project.channels || []).includes('内容种草')) parts.push('内容渠道降低获客成本');
    if (parts.length === 0) parts.push('策略组合带来综合提升');
    return parts;
  }

  /* ============================================================
     指标 Schema 生成
     ============================================================ */
  function buildMetricSchema(metrics, ctx) {
    const f = ctx.forecast;
    const special = {
      '新增用户数':   { target: f.coreCount, baseline: Math.round(f.coreCount * 0.7) },
      '激活用户数':   { target: Math.round(f.coreCount * 0.8), baseline: Math.round(f.coreCount * 0.55) },
      '付费用户数':   { target: Math.round(f.coreCount * 0.4), baseline: Math.round(f.coreCount * 0.28) },
      '裂变新增用户数': { target: Math.round(f.coreCount * 0.5), baseline: Math.round(f.coreCount * 0.35) },
      '注册转化率':   { target: pct(f.cvr), baseline: pct(f.cvr * 0.8) },
      '获客成本':     { target: Math.round((Number(ctx.budget) || 50000) / Math.max(f.coreCount, 1)), baseline: null }
    };

    const metricsDef = (metrics || []).map((m) => {
      const t = METRIC_TEMPLATES[m] || DEFAULT_METRIC;
      const sp = special[m] || {};
      return {
        key: slug(m),
        label: m,
        unit: t.unit,
        type: t.type,
        aggregation: t.aggregation,
        chart: t.chart,
        compare: t.compare,
        target: sp.target ?? null,
        baseline: sp.baseline ?? null,
        alert: buildAlert(t, m)
      };
    });

    return { metrics: metricsDef, dimensions: ['daily', 'channel'], comparison: ['baseline', 'target'] };
  }

  function buildAlert(t, m) {
    if (t.alertRule === 'above') return { rule: 'above_limit', threshold: 1.1, priority: 'high' };
    if (m === '获客成本' || m === '激活成本') return { rule: 'above_limit', threshold: 1.15, priority: 'high' };
    if (t.compare === 'target') return { rule: 'below_target', threshold: 0.8, priority: 'medium' };
    return { rule: 'mom_drop', threshold: 0.2, priority: 'medium' };
  }

  /* ============================================================
     玩法 Playbook（通用增长 · 业务无关）
     ============================================================ */
  const BG_KEYWORDS = {
    'AI工具': ['ai', '助手', '工具', '智能', '对话', '大模型', 'agent', '机器人', 'chat'],
    '本地生活': ['本地生活', '餐厅', '外卖', '团购', '订餐', '美团', '生活服务', '到店', '出行', '餐饮'],
    '学生': ['学生', '校园', '大学', '教育', '课程', '学习', '青年'],
    '白领': ['白领', '职场', '上班', '通勤', '都市', '办公', '商务'],
    '社交': ['社交', '社区', '视频', '直播', '内容', '分享', '短视频', '种草'],
    '电商': ['电商', '购物', '商品', '零售', '下单', '商城', '货', '卖'],
    '会员': ['会员', '付费', '订阅', '续费', 'vip', '增值', '变现'],
    '游戏': ['游戏', '娱乐', '休闲', '互动', '闯关', '挑战', '趣味']
  };

  const PLAY_POOL = {
    '拉新': [
      { name: '首单任务闯关', tags: ['AI工具', '游戏'], mechanism: '新用户完成 3 个关键动作（如「让 AI 推荐一次」「用 AI 比一次价」「用 AI 下一单」），逐级解锁阶梯奖励，把首次体验游戏化。', hook: '任务制替代硬广，降低尝试心理成本' },
      { name: '好友助力解锁', tags: ['社交', '白领'], mechanism: '新用户邀请 2 位好友首次体验，双方各得一张无门槛券，用社交关系链撬动拉新。', hook: '社交助力把拉新成本转嫁给关系链' },
      { name: 'AI 盲盒惊喜', tags: ['AI工具', '游戏'], mechanism: '首次使用时随机掉落优惠券 / 会员体验 / 免配送费，随机奖励制造惊喜与分享欲。', hook: '随机奖励比固定奖励更激发分享' },
      { name: '校园大使计划', tags: ['学生'], mechanism: '招募校园 KOC 担任品牌大使，按拉新人数发放佣金 + 校园专属权益，下沉到学生圈层。', hook: '用学生自组织撬动同辈信任' },
      { name: '通勤场景打卡', tags: ['白领', '本地生活'], mechanism: '绑定通勤场景，在地铁 / 写字楼周边门店打卡解锁周边优惠，把拉新嵌入每日必经动线。', hook: '抓住通勤这个高频固定场景' },
      { name: '新人礼包阶梯', tags: ['电商', '会员'], mechanism: '新用户注册即得礼包，连续 3 天登录礼包逐级加码，用递进奖励锁定前 3 日。', hook: '阶梯礼包延长新手留存窗口' }
    ],
    '激活': [
      { name: '新手任务地图', tags: ['AI工具', '游戏'], mechanism: '注册后 7 天内完成关键行为（首次提问 / 首次比价 / 首次下单）逐级解锁奖励，引导走通核心路径。', hook: '地图式引导把「会用」变成「想完成」' },
      { name: '场景化引导', tags: ['本地生活'], mechanism: '在用户已有场景（点餐、订座、搜店）自动弹出 AI 助手推荐，让激活发生在需求当下。', hook: '在真实需求场景里顺势激活' },
      { name: '首日即时激励', tags: ['通用'], mechanism: '完成首个关键行为立即到账奖励，用即时反馈强化行为。', hook: '即时反馈远比延迟奖励有效' },
      { name: '学习路径计划', tags: ['学生', 'AI工具'], mechanism: '为学生用户设计「一周上手」学习路径，完成每步解锁积分与进阶内容。', hook: '把激活包装成自我提升' },
      { name: '首单奖励翻倍', tags: ['电商'], mechanism: '首次下单后奖励翻倍，用「首单即惊喜」推动首次付费行为。', hook: '首单翻倍降低首次付费阻力' },
      { name: '功能解锁彩蛋', tags: ['游戏', 'AI工具'], mechanism: '完成指定行为解锁隐藏功能（如高级模式 / 专属皮肤），用收集欲驱动激活。', hook: '彩蛋机制制造探索欲' }
    ],
    '留存': [
      { name: '连续打卡', tags: ['游戏'], mechanism: '每日使用打卡，连续 7 天解锁终极大奖，用沉没成本绑定使用习惯。', hook: '连续打卡制造「舍不得断签」' },
      { name: '个性化召回', tags: ['本地生活', '白领'], mechanism: '基于用户历史偏好，在饭点 / 周末等场景精准 push 个性化推荐，而非群发。', hook: '场景 + 偏好双维度召回' },
      { name: '会员成长', tags: ['会员'], mechanism: '使用频次解锁会员等级，等级越高权益越多，用成长体系锁定长期留存。', hook: '成长体系把留存变成升级游戏' },
      { name: '内容订阅', tags: ['社交', 'AI工具'], mechanism: '根据兴趣推送专属内容 / 周报，把工具变成「每周期待」的订阅。', hook: '订阅制把低频工具变高频' },
      { name: '周度挑战赛', tags: ['游戏'], mechanism: '每周发起主题挑战（如「本周用 AI 省下 100 元」），完成可得排名奖励。', hook: '周挑战制造周期性新鲜感' },
      { name: '情感化提醒', tags: ['AI工具'], mechanism: 'AI 记住用户偏好与重要节点，主动送上贴心提醒，制造「它懂我」的粘性。', hook: '情感连接是留存的最深护城河' }
    ],
    '转化': [
      { name: '限时会员价', tags: ['会员'], mechanism: '首月会员半价 + 限时倒计时，用价格 + 紧迫感推动付费决策。', hook: '倒计时制造决策紧迫感' },
      { name: '场景化推荐', tags: ['本地生活'], mechanism: 'AI 在决策场景（选餐厅、订餐）顺势推荐付费服务，把转化嵌入决策链。', hook: '在决策点上顺势转化' },
      { name: '积分抵扣', tags: ['电商', '会员'], mechanism: '历史积分可抵扣付费金额，降低付费门槛的同时消耗存量积分。', hook: '积分抵扣双向利好' },
      { name: '首单特惠', tags: ['电商'], mechanism: '首次付费享专属低价，用「第一次最划算」突破付费心理防线。', hook: '首单特惠是转化的临门一脚' },
      { name: '需求诊断', tags: ['AI工具'], mechanism: 'AI 先诊断用户需求、给出定制方案，再推荐对应付费服务，用「先帮后卖」建立信任。', hook: '先提供价值再转化，信任转化率最高' },
      { name: '拼团凑单', tags: ['电商', '社交'], mechanism: '2 人拼团享折扣，用社交关系促成付费，同时带来新客。', hook: '拼团把转化和拉新合二为一' }
    ],
    '传播': [
      { name: '组队瓜分', tags: ['游戏', '社交'], mechanism: '3 人组队共同完成体验任务，瓜分奖励池，用团队目标撬动批量裂变。', hook: '组队机制把单人裂变放大 3 倍' },
      { name: '邀请返利', tags: ['电商', '会员'], mechanism: '邀请好友完成首单，邀请人得现金返利、被邀请人得新人券，双向激励。', hook: '双向激励让邀请双方都有动力' },
      { name: '分享晒单', tags: ['社交', 'AI工具'], mechanism: '分享使用结果（如「AI 帮我省了 30 元」）得曝光奖励，用社交证明驱动传播。', hook: '晒单即广告，社交证明最有效' },
      { name: '社群裂变', tags: ['社交', '学生'], mechanism: '建立核心用户社群，通过社群任务 + 群专属福利驱动成员拉人。', hook: '社群沉淀忠实种子用户' },
      { name: '老带新权益', tags: ['会员'], mechanism: '老用户每成功带新用户，双方各得会员权益叠加，用长期权益替代一次性奖励。', hook: '权益叠加让老用户持续拉新' },
      { name: '话题挑战赛', tags: ['社交', 'AI工具'], mechanism: '发起话题挑战（如「用 AI 做一周计划」），参与者带话题分享即可获奖。', hook: '话题挑战制造社交传播势能' }
    ]
  };

  function buildPlaybook(project) {
    const pool = PLAY_POOL[project.goal] || PLAY_POOL['拉新'];
    const bgText = (project.bg || '').toLowerCase();
    const audience = (project.audienceTags || []).join(' ').toLowerCase();

    // 打分：业务背景 / 人群标签命中加分 + 随机扰动（保证每次生成不同）
    const scored = pool.map((play) => {
      let score = Math.random() * 1.5;
      (play.tags || []).forEach((t) => {
        const kw = BG_KEYWORDS[t] || [];
        if (kw.some((k) => bgText.includes(k))) score += 3;
        if (audience.includes(t)) score += 2;
      });
      return { play, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const plays = scored.slice(0, 3).map((s) => s.play);

    return {
      plays,
      note: `以上玩法结合「${project.goal}」目标与业务背景 / 人群标签自动匹配生成；每次生成会从玩法池择优组合，可再次生成获取不同方案。`
    };
  }

  function buildBenefits(project) {
    const tools = project.tools || [];
    const map = {
      '优惠券': '优惠券（服务/商品抵扣）',
      '折扣': '限时折扣',
      '积分': '积分奖励 / 抵扣',
      '会员权益': '会员专属权益',
      '赠品礼包': '赠品 / 虚拟礼包',
      '免费体验': '免费试用 / 体验额度'
    };
    if (tools.length === 0) return ['优惠券', '限时折扣'];
    return tools.map((t) => map[t] || t);
  }

  /* 目标用户策略（替代电商"选品"，通用） */
  function buildAudienceStrategy(project) {
    const tags = project.audienceTags || [];
    const touchpoints = project.channels || [];
    const strategies = [];
    if (tags.length === 0) {
      strategies.push('未指定人群标签，建议按「目标用户的画像」补充标签以精确定向。');
    } else {
      strategies.push(`核心人群：${tags.join('、')}，权益与文案应围绕该人群的核心诉求设计。`);
    }
    if (touchpoints.length > 0) {
      strategies.push(`触达路径：优先通过「${touchpoints.slice(0, 3).join(' / ')}」触达，按渠道特征定制内容。`);
    }
    return strategies;
  }

  function buildAssets(project) {
    // 可选：货盘 / 产品（仅作参考，非必选）
    const skus = (project.sku || '')
      .split(/[\n,，;；、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (skus.length === 0) {
      return { hasAssets: false, items: [], hint: '未填写货盘/产品。本方案以玩法与策略为核心，货品细节仅作落地参考。' };
    }
    const roles = ['引流款', '核心款', '长尾款'];
    const items = skus.slice(0, 8).map((sku, i) => ({
      sku,
      role: roles[i % roles.length],
      reason: { '引流款': '低门槛、强吸引力，适合作为钩子拉动首次行为', '核心款': '承接主要价值，作为增长目标的核心载体', '长尾款': '补充选择，覆盖长尾需求' }[roles[i % roles.length]]
    }));
    return { hasAssets: true, items, hint: '' };
  }

  function buildBenefitRules(project) {
    const tools = project.tools || [];
    const goal = project.goal;
    const rules = [];
    if (tools.includes('优惠券') || tools.length === 0) {
      rules.push({ label: '新客券 15 元', cost: 15, stackable: true, limit: true });
    }
    if (tools.includes('免费体验')) {
      rules.push({ label: '免费体验 7 天', cost: 20, stackable: false, limit: true });
    }
    if (tools.includes('赠品礼包')) {
      rules.push({ label: '拉新礼包（虚拟）', cost: 10, stackable: false, limit: false });
    }
    if (goal === '传播' && (tools.includes('积分') || tools.includes('会员权益'))) {
      rules.push({ label: '邀请双方奖励', cost: 12, stackable: false, limit: true });
    }
    return rules;
  }

  function buildExecutionPlan(project, forecast) {
    const core = forecast.coreCount;
    const channels = project.channels || ['站内推送'];
    const tools = project.tools || ['优惠券'];
    const hasAd = channels.includes('广告投放');
    const hasContent = channels.includes('社交媒体') || channels.includes('内容种草');
    const adChannel = hasAd ? '朋友圈 / 信息流广告' : '核心渠道投放';
    const contentChannel = hasContent ? '小红书 / 抖音内容种草' : '内容预热';
    const primaryTool = tools[0] || '权益';

    const phases = [
      {
        phase: '预热期', duration: 'D-3 ~ D-1', goalShare: 0.2, goal: Math.round(core * 0.2),
        actions: [
          `D-3：站内 push 通知 + ${contentChannel}发布 3 篇预热内容`,
          'D-2：开启「预约体验」入口，预约用户锁定首日权益',
          `D-1：${primaryTool}创建并审核，设置 D0 0:00 生效；KOL 发布预告`
        ]
      },
      {
        phase: '爆发期', duration: 'D0 ~ D+2', goalShare: 0.6, goal: Math.round(core * 0.6),
        actions: [
          `D0 0:00：${primaryTool}生效 + 站内全量 push + ${adChannel}开始投放`,
          'D0：首日冲量，实时监控转化率，异常及时调优',
          'D+1：二次触达「首单未转化用户」；发布首日战报制造社交证明',
          'D+2：根据各渠道转化数据动态调整预算配比'
        ]
      },
      {
        phase: '返场期', duration: 'D+3 ~ D+5', goalShare: 0.2, goal: Math.round(core * 0.2),
        actions: [
          'D+3：部分权益下架，制造紧迫感',
          'D+4：长尾用户定向召回（短信 + push）',
          'D+5：全部权益下架，数据沉淀复盘'
        ]
      }
    ];
    return { channels, phases };
  }

  const CHANNEL_RATIONALE = {
    '广告投放': '外部拉新主阵地，覆盖广、起量快，承担主要增量来源',
    '社交媒体': '种草内容降低信任门槛，长尾效应好，兼顾品牌心智',
    '内容种草': '达人背书降低决策成本，转化质量高、复访意愿强',
    '站内推送': '触达已有用户，成本最低，但天花板受用户规模限制',
    '短信': '高触达率的召回手段，适合二次触达与流失挽回',
    '邮件': '低成本信息触达，适合深度内容与长期培育',
    '线下活动': '场景化曝光，适合本地生活类产品的即时转化'
  };

  function buildBudgetAllocation(project) {
    const budget = Number(project.budget) || 50000;
    const channels = project.channels || ['站内推送'];
    const weights = {
      '广告投放': 0.35, '社交媒体': 0.25, '内容种草': 0.20,
      '站内推送': 0.10, '短信': 0.05, '邮件': 0.05, '线下活动': 0.20
    };
    const items = channels.map((c) => ({ channel: c, weight: weights[c] || 0.15 }));
    const totalWeight = items.reduce((s, i) => s + i.weight, 0) || 1;
    items.forEach((i) => {
      i.amount = Math.round(budget * i.weight / totalWeight);
      i.pct = Math.round(i.weight / totalWeight * 100);
      i.reason = CHANNEL_RATIONALE[i.channel] || '按渠道属性分配';
    });
    return { total: budget, items };
  }

  function buildRisks(project, validation, forecast) {
    const risks = [];
    validation.forEach((v) => risks.push({ level: v.level, content: v.msg }));
    if (!project.budget) {
      risks.push({ level: 'medium', content: '未填写预算，预估按默认 5 万测算，建议补充后重算。' });
    }
    if (!project.audienceTags || project.audienceTags.length === 0) {
      risks.push({ level: 'medium', content: '未指定目标人群，触达与定向将偏泛，建议补充人群标签提升转化效率。' });
    }
    if (risks.length === 0) {
      risks.push({ level: 'low', content: '暂未发现显著风险，上线后建议关注核心指标的实时波动。' });
    }
    return risks;
  }

  /* ============================================================
     增长诊断（先诊断、再开方）
     ============================================================ */
  const GOAL_BLOCKERS = {
    '拉新': ['获客成本偏高，渠道投放 ROI 承压', '注册转化链路较长，流失率高', '目标人群触达同质化，注意力争夺激烈'],
    '激活': ['注册后首次关键行为完成率低', '新手引导环节存在流失', '价值感知不足，用户缺乏使用动力'],
    '留存': ['次日/7 日留存低于行业基线', '召回触达效率低，用户沉默', '缺乏持续的粘性抓手'],
    '转化': ['付费门槛偏高，用户决策成本大', '核心价值传达不足，付费动力弱', '缺乏紧迫感与转化场景'],
    '传播': ['分享动力不足，缺乏自传播机制', '裂变激励设计不合理，K 因子低', '传播路径断裂，承接体验差']
  };

  function buildDiagnosis(project, forecast) {
    const bg = project.bg || '';
    const bgSummary = bg.length > 90 ? bg.slice(0, 90) + '…' : bg;
    const objective = `围绕「${project.goal}」，核心目标为 ${forecast.metricLabel} 达到 ${fmt(forecast.coreCount)} 人`;
    const blockers = GOAL_BLOCKERS[project.goal] || GOAL_BLOCKERS['拉新'];
    const opportunities = buildOpportunities(project);
    return { bgSummary, objective, blockers, opportunities };
  }

  function buildOpportunities(project) {
    const tags = project.audienceTags || [];
    const tools = project.tools || [];
    const channels = project.channels || [];
    const opps = [];
    if (tags.includes('学生群体') || tags.includes('Z世代')) opps.push('学生/Z世代存在暑期、开学季等周期性红利，可抓时间窗口集中投放');
    if (tools.includes('免费体验')) opps.push('「免费体验」可显著降低首次尝试门槛，是拉新/激活的高杠杆权益');
    if (channels.includes('社交媒体') || channels.includes('内容种草')) opps.push('内容种草渠道获客成本通常低于硬广，可加大内容化投放');
    if (tools.includes('赠品礼包') || tools.includes('积分')) opps.push('积分/礼包可驱动裂变分享，将单一获客转化为指数增长');
    if (opps.length === 0) opps.push('聚焦核心人群，用低门槛权益撬动首次关键行为');
    return opps.slice(0, 3);
  }

  /* ============================================================
     主生成器
     ============================================================ */
  function generate(project) {
    const forecastResult = forecast(project);
    const benefitRules = buildBenefitRules(project);
    const estCore = forecastResult.coreCount;

    const ctx = { budget: Number(project.budget) || 50000, estCore, unitCost: 15 };
    const benefitValidation = validateBenefits(benefitRules, ctx);

    return {
      version: 1,
      diagnosis: buildDiagnosis(project, forecastResult),
      playbook: buildPlaybook(project),
      benefits: buildBenefits(project),
      audienceStrategy: buildAudienceStrategy(project),
      assets: buildAssets(project),
      benefitRules,
      benefitValidation,
      executionPlan: buildExecutionPlan(project, forecastResult),
      budgetAllocation: buildBudgetAllocation(project),
      forecast: forecastResult,
      risks: buildRisks(project, benefitValidation, forecastResult),
      metricSchema: buildMetricSchema(project.metrics, { forecast: forecastResult, budget: ctx.budget })
    };
  }

  /* ============================================================
     方案协同调优（基于用户反馈迭代新版）
     ============================================================ */
  function tune(plan, feedback, project) {
    const tuned = JSON.parse(JSON.stringify(plan));
    const fb = (feedback || '').toLowerCase();
    const actions = [];
    if (fb.includes('预算') || fb.includes('成本') || fb.includes('便宜') || fb.includes('少') || fb.includes('降')) {
      tuned.forecast.coreCount = Math.round(tuned.forecast.coreCount * 0.88);
      actions.push('收紧了激励成本与预算，核心转化量相应下调');
    }
    if (fb.includes('人群') || fb.includes('用户') || fb.includes('定向') || fb.includes('学生') || fb.includes('年轻')) {
      actions.push('优化了目标人群定向与触达策略');
    }
    if (fb.includes('权益') || fb.includes('奖励') || fb.includes('力度') || fb.includes('赠') || fb.includes('体验')) {
      actions.push('调整了权益 / 激励力度');
    }
    if (fb.includes('渠道') || fb.includes('投放') || fb.includes('触达') || fb.includes('裂变') || fb.includes('传播')) {
      actions.push('重新规划了渠道投放与裂变节奏');
    }
    if (actions.length === 0) {
      tuned.forecast.coreCount = Math.round(tuned.forecast.coreCount * 1.08);
      actions.push('根据综合反馈优化了玩法与策略细节');
    }
    tuned.tuningNote = { feedback, actions };
    tuned.version = (plan.version || 1) + 1;
    return tuned;
  }

  /* ============================================================
     导出 Markdown
     ============================================================ */
  function toMarkdown(plan) {
    const f = plan.forecast;
    const L = [];
    L.push(`# 增长方案${plan.diagnosis ? ' · ' + plan.diagnosis.objective : ''}`);
    L.push('');
    L.push(`> 版本 v${plan.version || 1}${plan.tuningNote ? ` · 反馈：${plan.tuningNote.feedback}` : ''}`);

    if (plan.diagnosis) {
      L.push('');
      L.push('## 项目诊断');
      L.push(`- 背景：${plan.diagnosis.bgSummary}`);
      L.push(`- 目标：${plan.diagnosis.objective}`);
      L.push('');
      L.push('**增长卡点**');
      plan.diagnosis.blockers.forEach((b) => L.push(`- ${b}`));
      L.push('');
      L.push('**机会点**');
      plan.diagnosis.opportunities.forEach((o) => L.push(`- ${o}`));
    }

    L.push('');
    L.push('## 玩法设计');
    (plan.playbook.plays || []).forEach((play, i) => {
      L.push(`### ${i + 1}. ${play.name}`);
      L.push(play.mechanism);
      L.push(`> 创意点：${play.hook}`);
      L.push('');
    });

    L.push('## 权益 / 激励设计');
    plan.benefits.forEach((b) => L.push(`- ${b}`));
    L.push('');

    L.push('## 预估');
    L.push(`- ${f.metricLabel}：**${fmt(f.coreCount)} 人**`);
    L.push(`- 基线（自然增长）：${fmt(f.baselineCount)} 人`);
    L.push(`- 策略增量：+${fmt(f.incremental)} 人（lift ${f.lift}x）`);
    L.push(`- 公式：曝光 ${fmt(f.exposure)} × 点击率 ${pct(f.ctr)} × 转化率 ${pct(f.cvr)} × 策略提升 ${f.lift}x`);
    L.push('');

    L.push('## 权益规则');
    plan.benefitRules.forEach((r) => L.push(`- ${r.label}（${r.limit ? '限量' : '未设上限'}${r.stackable ? ' · 可叠加' : ''}）`));
    L.push('');

    L.push('## 执行计划');
    plan.executionPlan.phases.forEach((p) => {
      L.push(`### ${p.phase}（${p.duration}）`);
      L.push(`- 阶段目标：${fmt(p.goal)} 人（${p.goalShare * 100}%）`);
      p.actions.forEach((a) => L.push(`- ${a}`));
      L.push('');
    });

    L.push('## 预算分配');
    plan.budgetAllocation.items.forEach((i) => L.push(`- ${i.channel}：${fmt(i.amount)} 元（${i.pct}%）——${i.reason}`));
    L.push('');

    L.push('## 风险提示');
    plan.risks.forEach((r) => L.push(`- ${r.content}`));
    L.push('');

    L.push('## 追踪指标');
    plan.metricSchema.metrics.forEach((m) => L.push(`- ${m.label}${m.target != null ? `（目标 ${fmt(m.target)}${m.unit}）` : ''}`));
    L.push('');
    return L.join('\n');
  }

  /* ============================================================
     渲染
     ============================================================ */
  function render(plan) {
    const f = plan.forecast;
    const assets = plan.assets;

    const assetsHtml = assets.hasAssets
      ? `<div class="sel-list">${assets.items.map((it) => `
          <div class="sel-item">
            <span class="sel-sku">${esc(it.sku)}</span>
            <span class="tag tag-role">${esc(it.role)}</span>
            <span class="sel-reason">${esc(it.reason)}</span>
          </div>`).join('')}</div>`
      : `<p class="plan-hint">${esc(assets.hint)}</p>`;

    const benefitHtml = plan.benefitRules.map((r) => `
      <div class="coupon-row">
        <span class="coupon-label">${esc(r.label)}</span>
        ${r.limit ? '<span class="tag">限量</span>' : '<span class="tag tag-muted">未设上限</span>'}
        ${r.stackable ? '<span class="tag">可叠加</span>' : '<span class="tag tag-muted">不可叠加</span>'}
      </div>`).join('');

    const validationHtml = plan.benefitValidation.length
      ? plan.benefitValidation.map((v) => `
          <div class="risk-item risk-${v.level}"><span class="risk-dot"></span><span>${esc(v.msg)}</span></div>`).join('')
      : '<div class="risk-item risk-low"><span class="risk-dot"></span><span>权益规则校验通过，无资损/羊毛风险。</span></div>';

    const audienceHtml = plan.audienceStrategy.map((s) => `<div class="risk-item risk-low"><span class="risk-dot"></span><span>${esc(s)}</span></div>`).join('');

    const metricsHtml = plan.metricSchema.metrics.map((m) => `
      <div class="metric-chip">
        <span class="metric-chip-label">${esc(m.label)}</span>
        <span class="metric-chip-meta">${m.target ? fmt(m.target) : '—'}${m.unit}</span>
      </div>`).join('');

    const diagnosisHtml = plan.diagnosis ? `
      <section class="plan-block plan-block-diagnosis">
        <h3 class="plan-block-title"><span class="plan-num">✦</span> 项目诊断</h3>
        <div class="plan-block-body">
          <div class="diag-row"><span class="diag-label">背景</span><span class="diag-text">${esc(plan.diagnosis.bgSummary)}</span></div>
          <div class="diag-row"><span class="diag-label">目标</span><span class="diag-text">${esc(plan.diagnosis.objective)}</span></div>
          <div class="diag-grid">
            <div class="diag-col">
              <p class="diag-title">增长卡点</p>
              ${plan.diagnosis.blockers.map((b) => `<div class="diag-item diag-blocker"><span aria-hidden="true">⚠</span>${esc(b)}</div>`).join('')}
            </div>
            <div class="diag-col">
              <p class="diag-title">机会点</p>
              ${plan.diagnosis.opportunities.map((o) => `<div class="diag-item diag-opp"><span aria-hidden="true">✦</span>${esc(o)}</div>`).join('')}
            </div>
          </div>
        </div>
      </section>` : '';

    const tuningHtml = plan.tuningNote ? `
      <section class="plan-block plan-block-tune">
        <h3 class="plan-block-title"><span class="plan-num">↺</span> 本轮调优 · v${plan.version || 2}</h3>
        <div class="plan-block-body">
          <p class="plan-hint" style="margin-top:0">反馈：${esc(plan.tuningNote.feedback)}</p>
          ${plan.tuningNote.actions.map((a) => `<div class="risk-item risk-low"><span class="risk-dot"></span><span>${esc(a)}</span></div>`).join('')}
        </div>
      </section>` : '';

    return `
      <div class="plan-output">

        ${diagnosisHtml}
        ${tuningHtml}

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">A</span> 玩法设计</h3>
          <div class="plan-block-body">
            ${plan.playbook.plays.map((play, i) => `
              <div class="play-card">
                <div class="play-head">
                  <span class="play-num">${i + 1}</span>
                  <span class="play-name">${esc(play.name)}</span>
                </div>
                <p class="play-mech">${esc(play.mechanism)}</p>
                <p class="play-hook">创意点：${esc(play.hook)}</p>
              </div>`).join('')}
            <p class="plan-hint">${esc(plan.playbook.note)}</p>
          </div>
        </section>

        <div class="plan-grid">
          <section class="plan-block">
            <h3 class="plan-block-title"><span class="plan-num">B</span> 权益 / 激励设计</h3>
            <div class="plan-block-body">
              <div class="benefit-list">${plan.benefits.map((b) => `<span class="benefit-pill">${esc(b)}</span>`).join('')}</div>
            </div>
          </section>

          <section class="plan-block">
            <h3 class="plan-block-title"><span class="plan-num">C</span> 预估 · ${esc(f.metricLabel)}</h3>
            <div class="plan-block-body">
              <p class="plan-gmv">${fmt(f.coreCount)}<span class="plan-gmv-unit">人</span></p>
              <p class="plan-gmv-formula">曝光 ${fmt(f.exposure)} × 点击率 ${pct(f.ctr)} × 转化率 ${pct(f.cvr)} × 策略提升 ${f.lift}x</p>
              <p class="plan-est-range">预估区间：${fmt(f.range[0])} ~ ${fmt(f.range[1])} 人（±20%）</p>
              <div class="lift-breakdown">
                <div class="lift-item"><span>基线（不做策略的自然增长）</span><span>${fmt(f.baselineCount)} 人</span></div>
                <div class="lift-item lift-inc"><span>策略增量（+${Math.round((f.lift - 1) * 100)}%）</span><span>+${fmt(f.incremental)} 人</span></div>
                <div class="lift-item lift-total"><span>总预估</span><span>${fmt(f.coreCount)} 人</span></div>
              </div>
              <div class="param-sources">
                ${f.liftDetail.map((d) => `<span class="param-source">${esc(d)}</span>`).join('')}
              </div>
              ${f.userConstrained ? '<p class="plan-hint">触达量受现有用户规模约束，已按可触达上限修正。</p>' : ''}
              <div class="param-sources">
                <span class="param-source">点击率 ${pct(f.ctr)}（${f.sources.ctr}）</span>
                <span class="param-source">转化率 ${pct(f.cvr)}（${f.sources.cvr}）</span>
                <span class="param-source">曝光单价 ${f.cpm} 元/千次（${f.sources.cpm}）</span>
              </div>
            </div>
          </section>
        </div>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">D</span> 目标用户与触达策略</h3>
          <div class="plan-block-body">${audienceHtml}</div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">E</span> 货盘 / 产品参考（可选）</h3>
          <div class="plan-block-body">${assetsHtml}</div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">F</span> 权益规则</h3>
          <div class="plan-block-body">${benefitHtml}</div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">G</span> 执行计划（分阶段）</h3>
          <div class="plan-block-body">
            ${plan.executionPlan.phases.map((p) => `
              <div class="exec-phase">
                <div class="exec-phase-head">
                  <span class="phase-name">${esc(p.phase)}</span>
                  <span class="phase-dur">${esc(p.duration)}</span>
                  <span class="exec-goal">目标 ${fmt(p.goal)} 人 · ${p.goalShare * 100}%</span>
                </div>
                <div class="exec-actions">${p.actions.map((a) => `<span class="exec-action">${esc(a)}</span>`).join('')}</div>
              </div>`).join('')}
            <p class="plan-hint">渠道：${plan.executionPlan.channels.map(esc).join(' / ')}</p>
          </div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">H</span> 预算分配</h3>
          <div class="plan-block-body">
            <div class="budget-list">
              ${plan.budgetAllocation.items.map((i) => `
                <div class="budget-item">
                  <span class="budget-channel">${esc(i.channel)}</span>
                  <div class="budget-bar"><div class="budget-bar-fill" style="width:${i.pct}%"></div></div>
                  <span class="budget-amount">${fmt(i.amount)} 元 · ${i.pct}%</span>
                </div>
                <p class="budget-reason">${esc(i.reason)}</p>`).join('')}
            </div>
            <p class="plan-hint">总预算 ${fmt(plan.budgetAllocation.total)} 元 · 权重按渠道属性（覆盖广度 / 信任成本 / 触达上限）综合评估</p>
          </div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">I</span> 权益校验（防资损 / 防羊毛）</h3>
          <div class="plan-block-body">${validationHtml}</div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">J</span> 风险提示</h3>
          <div class="plan-block-body">
            ${plan.risks.map((r) => `<div class="risk-item risk-${r.level}"><span class="risk-dot"></span><span>${esc(r.content)}</span></div>`).join('')}
          </div>
        </section>

        <section class="plan-block">
          <h3 class="plan-block-title"><span class="plan-num">K</span> 追踪指标（指标 Schema）</h3>
          <div class="plan-block-body">
            <div class="metric-chip-list">${metricsHtml}</div>
            <p class="plan-hint">这些指标将决定上线后看板追踪什么、如何预警。</p>
          </div>
        </section>

      </div>`;
  }

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Number(n ?? 0).toLocaleString('zh-CN'); }
  function pct(x) { return (Number(x) * 100).toFixed(1) + '%'; }
  function slug(s) { return String(s).replace(/\s+/g, '_'); }

  /* ============================================================
     LLM 定制化生成（调 serverless，返回诊断 + 玩法；失败返回 null）
     ============================================================ */
  async function generateWithLLM(project, apiBase) {
    if (!apiBase) return null;
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bg: project.bg,
          goal: project.goal,
          platform: project.platform,
          audienceTags: project.audienceTags || [],
          tools: project.tools || [],
          channels: project.channels || []
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.plays || !data.diagnosis) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  global.NorthstarPlan = { generate, render, tune, toMarkdown, generateWithLLM, validateBenefits, forecast, buildMetricSchema };
})(window);
