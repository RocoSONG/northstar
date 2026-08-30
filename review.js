/* ============================================================
   增长罗盘 · Northstar — 复盘模块引擎（数据看板 + 预警 + 复盘）
   Schema 驱动渲染 · 冷启动预填充 · 异常检测 · mock 数据流
   ============================================================ */

(function (global) {
  'use strict';

  const HISTORY_LEN = 14; // 模拟过去 14 个周期

  /* ============================================================
     数据生成（mock · 业务无关）
     ============================================================ */
  function generateSeries(metric) {
    const target = metric.target || 100;
    const above = metric.alert && metric.alert.rule === 'above_limit'; // 成本类指标
    const points = [];
    for (let i = 0; i < HISTORY_LEN; i++) {
      let v;
      if (above && i >= HISTORY_LEN - 3) {
        v = target * 1.28; // 成本超限，触发预警（演示）
      } else if (metric.key === 'ci_ri_liu_cun_lv' && i >= HISTORY_LEN - 2) {
        v = target * 0.72; // 留存下滑（演示）
      } else {
        v = target * (0.84 + Math.random() * 0.32);
      }
      points.push(Math.round(v));
    }
    return points;
  }

  /* ============================================================
     异常检测（业务无关规则）
     ============================================================ */
  function detectAnomalies(metric, series) {
    const anomalies = [];
    const alert = metric.alert;
    if (!alert || series.length < 2) return anomalies;
    const current = series[series.length - 1];
    const prev = series[series.length - 2];

    if (alert.rule === 'below_target' && metric.target != null && current < metric.target * alert.threshold) {
      anomalies.push({
        level: 'high',
        code: 'below_target',
        msg: `「${metric.label}」当前 ${fmt(current)}${metric.unit}，低于目标 ${fmt(metric.target)}${metric.unit} 的 ${Math.round(alert.threshold * 100)}%，需关注。`
      });
    }
    if (alert.rule === 'above_limit' && metric.target != null && current > metric.target * alert.threshold) {
      anomalies.push({
        level: 'high',
        code: 'above_limit',
        msg: `「${metric.label}」当前 ${fmt(current)}${metric.unit}，已超出上限 ${Math.round(alert.threshold * 100)}%（目标 ${fmt(metric.target)}${metric.unit}），成本有失控风险。`
      });
    }
    if (alert.rule === 'mom_drop' && prev > 0 && (current - prev) / prev < -alert.threshold) {
      anomalies.push({
        level: 'medium',
        code: 'mom_drop',
        msg: `「${metric.label}」环比下滑 ${Math.round((1 - current / prev) * 100)}%，低于基线，建议排查原因。`
      });
    }
    return anomalies;
  }

  /* ============================================================
     看板数据构建（冷启动预填充）
     ============================================================ */
  function buildDashboard(plan) {
    const metrics = (plan.metricSchema && plan.metricSchema.metrics) || [];
    const seriesMap = {};
    const anomaliesMap = {};
    metrics.forEach((m) => {
      const series = generateSeries(m);
      seriesMap[m.key] = series;
      anomaliesMap[m.key] = detectAnomalies(m, series);
    });
    return { metrics, seriesMap, anomaliesMap, forecast: plan.forecast };
  }

  /* ============================================================
     数据流 tick（模拟实时更新）
     ============================================================ */
  function tick(dash) {
    dash.metrics.forEach((m) => {
      const series = dash.seriesMap[m.key];
      const target = m.target || 100;
      const above = m.alert && m.alert.rule === 'above_limit';
      let next;
      if (above) {
        next = target * (1.2 + Math.random() * 0.2); // 持续超限
      } else {
        next = target * (0.86 + Math.random() * 0.28);
      }
      series.push(Math.round(next));
      if (series.length > HISTORY_LEN + 8) series.shift();
      dash.anomaliesMap[m.key] = detectAnomalies(m, series);
    });
    return dash;
  }

  /* ============================================================
     Sparkline（SVG，零依赖）
     ============================================================ */
  function sparkline(series, w, h) {
    if (!series || series.length < 2) return '';
    const max = Math.max(...series);
    const min = Math.min(...series);
    const range = max - min || 1;
    const step = w / (series.length - 1);
    const pts = series.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - ((v - min) / range) * (h - 6) - 3).toFixed(1);
      return `${x},${y}`;
    }).join(' ');
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  /* ============================================================
     看板渲染（Schema 驱动）
     ============================================================ */
  function renderDashboard(dash) {
    const cards = dash.metrics.map((m) => {
      const series = dash.seriesMap[m.key] || [];
      const current = series.length ? series[series.length - 1] : 0;
      const target = m.target;
      const pct = target ? Math.max(0, Math.min(current / target, 1.25)) : 0;
      const anomalies = dash.anomaliesMap[m.key] || [];
      const alertCls = anomalies.length ? ' has-alert' : '';
      return `
        <div class="metric-card${alertCls}">
          <div class="metric-card-head">
            <span class="metric-card-label">${esc(m.label)}</span>
            ${anomalies.length ? '<span class="alert-dot" title="存在异常"></span>' : ''}
          </div>
          <div class="metric-card-value">${fmt(current)}<span class="metric-card-unit">${esc(m.unit)}</span></div>
          <div class="metric-card-target">目标 ${target != null ? fmt(target) : '—'}<span>${esc(m.unit)}</span></div>
          <div class="metric-bar"><div class="metric-bar-fill${anomalies.length ? ' fill-alert' : ''}" style="width:${Math.round(pct * 100)}%"></div></div>
          <div class="metric-spark">${sparkline(series, 120, 30)}</div>
        </div>`;
    }).join('');
    return `<div class="metric-grid">${cards}</div>`;
  }

  /* ============================================================
     预警列表渲染
     ============================================================ */
  function renderAlerts(dash) {
    const all = dash.metrics.flatMap((m) => (dash.anomaliesMap[m.key] || []).map((a) => ({ metric: m.label, ...a })));
    if (all.length === 0) {
      return `<div class="risk-item risk-low"><span class="risk-dot"></span><span>当前所有指标均处于健康区间，无异常预警。</span></div>`;
    }
    return all.map((a) => `
      <div class="risk-item risk-${a.level}">
        <span class="risk-dot"></span>
        <span>${esc(a.msg)}</span>
      </div>`).join('');
  }

  /* ============================================================
     复盘报告（mock · 因果 + 动作）
     ============================================================ */
  function renderReport(dash) {
    const all = dash.metrics.flatMap((m) => (dash.anomaliesMap[m.key] || []).map((a) => ({ metric: m, ...a })));
    const healthy = dash.metrics.filter((m) => !(dash.anomaliesMap[m.key] || []).length);

    let body = '';
    if (all.length > 0) {
      body += `<p class="report-para"><strong>本轮复盘核心结论</strong></p>`;
      body += all.map((a) => `
        <div class="risk-item risk-${a.level}"><span class="risk-dot"></span>
          <span>${esc(a.msg)} <em class="report-action">建议：${suggestAction(a.code)}</em></span>
        </div>`).join('');
    } else {
      body += `<p class="report-para">本轮整体健康，${healthy.length} 项核心指标均在目标区间内。</p>`;
    }
    body += `<p class="plan-hint">复盘结论将沉淀为「指标基线库」，反哺下一次方案策划。</p>`;
    return `<div class="report-box">${body}</div>`;
  }

  function suggestAction(code) {
    return {
      'below_target': '排查触达与转化环节，调整权益力度或渠道配比',
      'above_limit': '收紧激励成本、设置领取上限，防止补贴失控',
      'mom_drop': '对比同期与竞品，定位下滑根因并快速迭代'
    }[code] || '结合业务背景进一步分析';
  }

  /* ============================================================
     CSV 导入（字段映射：规则优先 + 同义词字典）
     ============================================================ */
  const FIELD_SYNONYMS = {
    '新增用户数': ['新增用户', '新增用户数', '新用户数', '新增', '注册数', '新注册', 'new_users'],
    '注册转化率': ['注册转化率', '注册转化', '注册率', 'reg_rate'],
    '获客成本': ['获客成本', 'cac', '拉新成本', '获客单价', 'cpa'],
    '渠道拉新占比': ['渠道拉新占比', '渠道占比', '拉新占比'],
    '激活率': ['激活率', '激活比例'],
    '激活用户数': ['激活用户数', '激活数', '激活用户'],
    '激活转化率': ['激活转化率', '激活转化'],
    '激活成本': ['激活成本'],
    '次日留存率': ['次日留存率', '次日留存', '次留', 'd1'],
    '7日留存率': ['7日留存率', '7日留存', '七留', 'd7'],
    'DAU/MAU': ['dau/mau', 'dau', '活跃度', '粘性'],
    '流失率': ['流失率', 'churn'],
    '付费转化率': ['付费转化率', '付费转化', '付费率', '支付率'],
    '付费用户数': ['付费用户数', '付费用户', '付费数', '支付用户'],
    'ARPU': ['arpu'],
    'LTV': ['ltv', 'clv'],
    '裂变系数': ['裂变系数', '裂变', 'k因子', 'k值'],
    '分享率': ['分享率'],
    '邀请转化率': ['邀请转化率', '邀请转化', '邀请率'],
    '传播新增占比': ['传播新增占比', '传播占比', '裂变占比']
  };

  function parseCSV(text) {
    const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return null;
    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = lines.slice(1).map((line) => line.split(',').map((c) => c.trim()));
    return { headers, rows };
  }

  function matchField(header) {
    const h = String(header).toLowerCase();
    for (const [key, syns] of Object.entries(FIELD_SYNONYMS)) {
      if (syns.some((s) => s.toLowerCase() === h)) return key;
    }
    for (const [key, syns] of Object.entries(FIELD_SYNONYMS)) {
      if (syns.some((s) => h.includes(s.toLowerCase()) || s.toLowerCase().includes(h))) return key;
    }
    return null;
  }

  function applyCSV(dash, csvData) {
    const colMap = {};
    csvData.headers.forEach((h, i) => {
      const key = matchField(h);
      if (key) colMap[key] = i;
    });
    let applied = 0;
    dash.metrics.forEach((m) => {
      const col = colMap[m.key];
      if (col == null) return;
      const series = csvData.rows.map((row) => {
        const v = parseFloat(String(row[col] || '').replace('%', ''));
        return isNaN(v) ? 0 : v;
      });
      if (series.length > 0) {
        dash.seriesMap[m.key] = series;
        dash.anomaliesMap[m.key] = detectAnomalies(m, series);
        applied++;
      }
    });
    return applied;
  }

  /* ============================================================
     增长实验（A/B 测试 · 假设 → 分流 → 统计检验 → 结论）
     结论由模拟样本数据经 t 检验 / p 值计算得出，而非预设。
     ============================================================ */
  const EXPERIMENTS = [
    { id: 'benefit', name: '加大权益力度 → 提升转化率', metric: '转化率', unit: '%', base: 5.0, effect: 1.8, stdRatio: 0.3 },
    { id: 'audience', name: '优化人群定向 → 降低获客成本', metric: '获客成本', unit: '元', base: 30, effect: -6, stdRatio: 0.25 },
    { id: 'referral', name: '增加裂变激励 → 提升 K 因子', metric: '裂变系数', unit: '倍', base: 1.2, effect: 0.4, stdRatio: 0.2 },
    { id: 'channel', name: '调整渠道配比 → 提升 ROI', metric: 'ROI', unit: '', base: 2.5, effect: 0.05, stdRatio: 0.35 }
  ];

  // 标准正态采样（Box-Muller）
  function normalRandom(mean, std) {
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // 标准正态 CDF（Abramowitz-Stegun 近似）
  function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }

  function runExperiment(exp, sampleSize = 800) {
    // 模拟分流：对照组 A / 实验组 B 各 sampleSize 个样本（带噪声）
    const stdA = exp.base * exp.stdRatio;
    const stdB = (exp.base + exp.effect) * exp.stdRatio;
    let sumA = 0, sumB = 0, sqA = 0, sqB = 0;
    for (let i = 0; i < sampleSize; i++) {
      const a = normalRandom(exp.base, stdA);
      const b = normalRandom(exp.base + exp.effect, stdB);
      sumA += a; sumB += b;
      sqA += a * a; sqB += b * b;
    }
    const meanA = sumA / sampleSize;
    const meanB = sumB / sampleSize;
    const varA = (sqA - sampleSize * meanA * meanA) / (sampleSize - 1);
    const varB = (sqB - sampleSize * meanB * meanB) / (sampleSize - 1);

    // 合并标准差 + t 统计量 + p 值（双尾）
    const sp = Math.sqrt((varA + varB) / 2);
    const t = (meanB - meanA) / (sp * Math.sqrt(2 / sampleSize));
    const p = 2 * (1 - normCDF(Math.abs(t)));

    const significant = p < 0.05;
    const liftPct = (meanB - meanA) / Math.abs(meanA) * 100;
    const dirWord = exp.effect < 0 ? '降低' : '提升';

    return {
      exp, meanA, meanB, sampleSize, t, p, significant, liftPct,
      conclusion: significant
        ? `实验组「${exp.name}」${dirWord} ${Math.abs(liftPct).toFixed(1)}%（${meanA.toFixed(2)}${exp.unit} → ${meanB.toFixed(2)}${exp.unit}），p = ${p.toFixed(3)} < 0.05，差异显著，建议全量推广。`
        : `实验组与对照组差异不显著（${liftPct > 0 ? '+' : ''}${liftPct.toFixed(1)}%，p = ${p.toFixed(3)} ≥ 0.05），暂不足以证明假设，建议增大样本量或调整实验设计。`
    };
  }

  function renderExperiment(result) {
    return `
      <div class="ab-result">
        <div class="ab-compare">
          <div class="ab-group">
            <span class="ab-label">对照组 A（n=${result.sampleSize}）</span>
            <span class="ab-value">${result.meanA.toFixed(2)}${result.exp.unit}</span>
          </div>
          <div class="ab-arrow" aria-hidden="true">→</div>
          <div class="ab-group ab-group-b">
            <span class="ab-label">实验组 B（n=${result.sampleSize}）</span>
            <span class="ab-value">${result.meanB.toFixed(2)}${result.exp.unit}</span>
          </div>
        </div>
        <div class="ab-stats">
          <span class="ab-stat">t = ${result.t.toFixed(2)}</span>
          <span class="ab-stat">p = ${result.p.toFixed(3)}</span>
          <span class="ab-verdict ${result.significant ? 'ab-sig' : 'ab-insig'}">${result.significant ? '✓ 显著' : '△ 不显著'}</span>
        </div>
        <p class="ab-conclusion">${esc(result.conclusion)}</p>
      </div>`;
  }

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Number(n ?? 0).toLocaleString('zh-CN'); }

  global.NorthstarReview = { buildDashboard, tick, renderDashboard, renderAlerts, renderReport, detectAnomalies, parseCSV, applyCSV, EXPERIMENTS, runExperiment, renderExperiment };
})(window);
