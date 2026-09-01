/* ============================================================
   增长罗盘 · Northstar — 数据洞察引擎
   上传数据 → 字段识别 → 概览 → 可视化 → 归因 → 实验检验 → LLM 洞察
   可视化用 Chart.js（Tableau 风格 · 自动选图 · 自动挑「值得画」的数据）
   ============================================================ */

(function (global) {
  'use strict';

  /* ============================================================
     色板与主题（Tableau 风格，契合品牌冰蓝→紫）
     ============================================================ */
  // 同色系色板：品牌冰蓝 → 紫的深浅渐变序列（多系列/多分类时依次取用）
  const PALETTE = ['#5b7cff', '#6d8dff', '#8298ff', '#97a3ff', '#abaeff', '#bda0fa', '#a78bfa', '#8f6ff5', '#7b5fe8', '#6b4fd8'];

  function chartTheme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      dark,
      text: dark ? 'rgba(232,236,244,0.92)' : 'rgba(25,30,43,0.9)',
      muted: dark ? 'rgba(139,147,167,0.9)' : 'rgba(90,98,115,0.9)',
      grid: dark ? 'rgba(139,147,167,0.12)' : 'rgba(90,98,115,0.14)',
      font: "'Manrope','Noto Sans SC',sans-serif",
      tooltipBg: dark ? 'rgba(30,36,50,0.97)' : 'rgba(255,255,255,0.98)',
      tooltipBorder: dark ? 'rgba(109,141,255,0.45)' : 'rgba(74,95,208,0.28)',
      tooltipTitle: dark ? '#ffffff' : '#191e2b',
      tooltipBody: dark ? '#dbe1ef' : '#3a4252'
    };
  }

  function hexToRgba(hex, a) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // 垂直渐变（柱状/面积填充用，Tableau 式同色系过渡）
  function vGradient(context, colors) {
    const { chart } = context;
    const { ctx, chartArea } = chart;
    if (!chartArea) return colors[0];
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    return g;
  }

  /* ============================================================
     工具
     ============================================================ */
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(n) { return Number(n ?? 0).toLocaleString('zh-CN'); }
  function fmtCompact(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(Math.round(n));
  }
  function pct(x) { return (Number(x) * 100).toFixed(1) + '%'; }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ============================================================
     字段类型 / 角色推断
     ============================================================ */
  function isDate(v) {
    const s = String(v).trim();
    if (!s) return false;
    return /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(s) || /^\d{4}[-/.]\d{1,2}$/.test(s) || /^\d{6,8}$/.test(s);
  }
  function isNumber(v) {
    const s = String(v).trim().replace(/[,，%\s￥¥$]/g, '');
    if (!s) return false;
    return !isNaN(parseFloat(s)) && isFinite(s);
  }
  function toNumber(v) {
    const s = String(v).trim().replace(/[,，%\s￥¥$]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function inferType(values) {
    const nonEmpty = values.filter((v) => String(v).trim() !== '');
    if (!nonEmpty.length) return 'empty';
    if (nonEmpty.filter(isDate).length / nonEmpty.length > 0.8) return 'date';
    if (nonEmpty.filter(isNumber).length / nonEmpty.length > 0.8) return 'number';
    return 'string';
  }

  function inferRole(name, type) {
    if (type === 'date') return 'time';
    if (type === 'empty') return 'ignore';
    if (type === 'number') return 'metric';
    const n = String(name || '').toLowerCase();
    if (/(日期|时间|date|day|week|month|year|period)/.test(n) && !/(率|数|值|量|金额|成本)/.test(n)) return 'time';
    return 'dimension';
  }

  /* ============================================================
     CSV / TSV 解析（支持引号包裹）
     ============================================================ */
  function splitLine(line, sep) {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === sep && !inQuote) {
        out.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parse(text) {
    const s = String(text || '').replace(/^﻿/, '').trim();
    if (!s) return null;
    const lines = s.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const first = lines[0];
    const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const headers = splitLine(first, sep).map((h) => h || '列');
    const rows = lines.slice(1).map((l) => splitLine(l, sep));
    // 过滤全空行，对齐列数
    const cleanRows = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    const width = headers.length;
    cleanRows.forEach((r) => { while (r.length < width) r.push(''); });

    const columns = headers.map((h, i) => {
      const values = cleanRows.map((r) => r[i]);
      const type = inferType(values);
      const role = inferRole(h, type);
      return { name: h, type, role };
    });
    return { headers, rows: cleanRows, columns };
  }

  /* ============================================================
     示例数据（14 天 · 新旧版本 × 4 渠道 · 3 指标）
     ============================================================ */
  function generateSample() {
    const channels = ['抖音', '微信', '小红书', '自然流量'];
    const base = { '抖音': 1200, '微信': 950, '小红书': 720, '自然流量': 500 };
    const lines = ['日期,版本,渠道,新增用户,付费用户,活跃用户'];
    for (let d = 0; d < 14; d++) {
      const date = new Date(2025, 5, 1 + d);
      const ds = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const isNew = d >= 7;
      const version = isNew ? '新版' : '旧版';
      const lift = isNew ? 1.28 : 1.0;
      channels.forEach((c) => {
        const noise = 0.92 + Math.random() * 0.16;
        const users = Math.round(base[c] * lift * noise);
        const payers = Math.round(users * (0.12 + Math.random() * 0.06));
        const active = Math.round(users * (4 + Math.random() * 1.5));
        lines.push(`${ds},${version},${c},${users},${payers},${active}`);
      });
    }
    return lines.join('\n');
  }
  const SAMPLE = generateSample();

  /* ============================================================
     字段映射表渲染
     ============================================================ */
  const TYPE_LABEL = { date: '时间', number: '数值', string: '文本', empty: '空列' };
  const ROLE_LABEL = { time: '时间', metric: '指标', dimension: '维度', ignore: '忽略' };

  function renderMapping(data) {
    const rowsHtml = data.columns.map((col, i) => `
      <div class="map-row">
        <span class="map-name" title="${esc(col.name)}">${esc(col.name)}</span>
        <span class="map-type map-type-${col.type}">${TYPE_LABEL[col.type] || col.type}</span>
        <div class="map-samples">${data.rows.slice(0, 3).map((r) => `<span class="map-sample">${esc(String(r[i]).slice(0, 12))}</span>`).join('')}</div>
        <select class="map-role" data-col="${i}">
          ${['time', 'metric', 'dimension', 'ignore'].map((r) => `<option value="${r}"${col.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select>
      </div>`).join('');
    return `
      <div class="map-head">
        <span class="map-name">字段</span>
        <span class="map-type">类型</span>
        <div class="map-samples">数据预览</div>
        <span class="map-role-label">角色</span>
      </div>
      ${rowsHtml}`;
  }

  /* ============================================================
     概览
     ============================================================ */
  function buildSummary(data) {
    const timeCol = data.columns.findIndex((c) => c.role === 'time');
    const metricCols = data.columns.map((c, i) => c.role === 'metric' ? i : -1).filter((i) => i >= 0);
    const dimCols = data.columns.map((c, i) => c.role === 'dimension' ? i : -1).filter((i) => i >= 0);

    const metrics = metricCols.map((i) => {
      const values = data.rows.map((r) => toNumber(r[i])).filter((v) => v !== 0);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length ? sum / values.length : 0;
      const max = values.length ? Math.max(...values) : 0;
      const min = values.length ? Math.min(...values) : 0;
      return { index: i, name: data.columns[i].name, count: values.length, sum, avg, max, min };
    });

    let timeRange = '';
    if (timeCol >= 0) {
      const tvals = data.rows.map((r) => r[timeCol]).filter(Boolean);
      timeRange = tvals.length ? `${tvals[0]} ~ ${tvals[tvals.length - 1]}` : '';
    }

    return { timeCol, metricCols, dimCols, metrics, timeRange, rowCount: data.rows.length, colCount: data.columns.length };
  }

  /* ============================================================
     归因（贡献度拆解）
     指标涨跌 → 各维度分组的贡献占比
     ============================================================ */
  function buildAttribution(data) {
    const s = buildSummary(data);
    if (!s.metrics.length || !s.dimCols.length) return null;
    const metricIdx = s.metrics[0].index;
    // 选唯一值最多（但不超过 10 个）的维度做归因
    let bestDim = -1, bestScore = -1;
    s.dimCols.forEach((di) => {
      const uniq = new Set(data.rows.map((r) => r[di])).size;
      const score = uniq >= 2 && uniq <= 10 ? uniq : -1;
      if (score > bestScore) { bestScore = score; bestDim = di; }
    });
    if (bestDim < 0) return null;

    const groups = new Map();
    data.rows.forEach((r) => {
      const key = r[bestDim];
      const v = toNumber(r[metricIdx]);
      if (!groups.has(key)) groups.set(key, { key, sum: 0, count: 0 });
      const g = groups.get(key);
      g.sum += v; g.count++;
    });
    const items = Array.from(groups.values()).sort((a, b) => b.sum - a.sum);
    const total = items.reduce((a, b) => a + b.sum, 0) || 1;
    items.forEach((it) => { it.share = it.sum / total; it.avg = it.sum / (it.count || 1); });

    return {
      metricName: data.columns[metricIdx].name,
      dimName: data.columns[bestDim].name,
      total,
      items
    };
  }

  /* ============================================================
     实验效果检验（两样本 t 检验，真实上传数据）
     ============================================================ */
  function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }

  function runTTest(a, b) {
    const nA = a.length, nB = b.length;
    if (nA < 2 || nB < 2) return null;
    const mean = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
    const vari = (arr) => {
      const m = mean(arr);
      return arr.reduce((x, y) => x + (y - m) * (y - m), 0) / (arr.length - 1);
    };
    const meanA = mean(a), meanB = mean(b);
    const varA = vari(a), varB = vari(b);
    const sp = Math.sqrt((varA + varB) / 2);
    const t = (meanB - meanA) / (sp * Math.sqrt(2 / (nA + nB) * 2));
    // 简化：等样本近似 —— 用 Welch 更严谨
    const tWelch = (meanB - meanA) / Math.sqrt(varA / nA + varB / nB);
    const df = Math.pow(varA / nA + varB / nB, 2) / (Math.pow(varA / nA, 2) / (nA - 1) + Math.pow(varB / nB, 2) / (nB - 1));
    const p = 2 * (1 - normCDF(Math.abs(tWelch)));
    const liftPct = meanA !== 0 ? (meanB - meanA) / Math.abs(meanA) * 100 : 0;
    const significant = p < 0.05;
    return { meanA, meanB, nA, nB, t: tWelch, df, p, liftPct, significant };
  }

  function buildExperiment(data) {
    const s = buildSummary(data);
    // 找 2 值的维度列作为分组列
    let groupCol = -1;
    s.dimCols.forEach((di) => {
      if (groupCol >= 0) return;
      const uniq = Array.from(new Set(data.rows.map((r) => r[di]))).filter(Boolean);
      if (uniq.length === 2) groupCol = di;
    });
    if (groupCol < 0 || !s.metrics.length) return null;

    const groups = Array.from(new Set(data.rows.map((r) => r[groupCol]))).filter(Boolean);
    const g0 = groups[0], g1 = groups[1];
    const metricIdx = s.metrics[0].index;

    const results = s.metrics.slice(0, 3).map((m) => {
      const a = data.rows.filter((r) => r[groupCol] === g0).map((r) => toNumber(r[m.index]));
      const b = data.rows.filter((r) => r[groupCol] === g1).map((r) => toNumber(r[m.index]));
      const tt = runTTest(a, b);
      return { name: m.name, a, b, ...tt };
    });

    return { groupCol, dimName: data.columns[groupCol].name, g0, g1, results };
  }

  /* ============================================================
     报告生成（HTML + 图表配置）
     ============================================================ */
  function generateReport(data) {
    const s = buildSummary(data);
    const attr = buildAttribution(data);
    const exp = buildExperiment(data);
    const charts = [];

    // ---- 概览模块 ----
    const metricCards = s.metrics.map((m) => `
      <div class="ov-card">
        <span class="ov-label">${esc(m.name)} · 总和</span>
        <span class="ov-value">${fmtCompact(m.sum)}</span>
        <span class="ov-sub">均值 ${fmtCompact(m.avg)} · 峰值 ${fmtCompact(m.max)}</span>
      </div>`).join('');
    const overviewHtml = `
      <div class="ov-meta">
        <div class="ov-meta-item"><span class="ov-meta-label">数据规模</span><span class="ov-meta-value">${s.rowCount} 行 × ${s.colCount} 列</span></div>
        ${s.timeRange ? `<div class="ov-meta-item"><span class="ov-meta-label">时间范围</span><span class="ov-meta-value">${esc(s.timeRange)}</span></div>` : ''}
        <div class="ov-meta-item"><span class="ov-meta-label">指标数量</span><span class="ov-meta-value">${s.metrics.length} 项</span></div>
        <div class="ov-meta-item"><span class="ov-meta-label">拆分维度</span><span class="ov-meta-value">${s.dimCols.length} 个</span></div>
      </div>
      <div class="ov-grid">${metricCards || '<p class="plan-hint">未识别到数值指标列。</p>'}</div>`;

    // ---- 可视化模块（自动选图 + 自动挑数据） ----
    let vizHtml = '';
    // 1) 时间趋势（折线）
    if (s.timeCol >= 0 && s.metrics.length) {
      const timeKeys = data.rows.map((r) => r[s.timeCol]);
      const uniqTimes = Array.from(new Set(timeKeys));
      // 挑变化最显著的前 2 个指标
      const trendMetrics = s.metrics.slice().sort((a, b) => (b.max - b.min) - (a.max - a.min)).slice(0, 2);
      const trendDatasets = trendMetrics.map((m, i) => {
        const byTime = new Map();
        data.rows.forEach((r) => { byTime.set(r[s.timeCol], (byTime.get(r[s.timeCol]) || 0) + toNumber(r[m.index])); });
        return { label: m.name, color: PALETTE[i], data: uniqTimes.map((t) => byTime.get(t) || 0) };
      });
      charts.push({ id: 'trend', type: 'line', config: buildLineConfig(uniqTimes, trendDatasets, '核心指标时间趋势') });
      vizHtml += chartCard('trend', '时间趋势', '指标随时间的变化，折线按时间聚合展示');
    }
    // 2) 维度对比（柱状）
    if (attr) {
      const top = attr.items.slice(0, 8);
      charts.push({ id: 'dim-bar', type: 'bar', config: buildBarConfig(top.map((i) => i.key), [{ label: attr.metricName, data: top.map((i) => i.avg), color: PALETTE[0] }], `${attr.dimName} × 均值`, true) });
      vizHtml += chartCard('dim-bar', `${attr.dimName}对比`, `各${attr.dimName}的「${attr.metricName}」均值对比（Top ${top.length}）`);
    }
    // 3) 构成（环形）
    if (attr && attr.items.length >= 2) {
      charts.push({ id: 'dim-doughnut', type: 'doughnut', config: buildDoughnutConfig(attr.items.map((i) => i.key), attr.items.map((i) => i.sum), attr.metricName + ' 构成') });
      vizHtml += chartCard('dim-doughnut', '结构构成', `各${attr.dimName}对「${attr.metricName}」的贡献占比`);
    }

    // ---- 归因模块 ----
    let attrHtml = '<p class="plan-hint">未识别到可用于归因的维度列，无法做贡献度拆解。</p>';
    if (attr) {
      const maxShare = Math.max(...attr.items.map((i) => i.share));
      attrHtml = `
        <p class="attr-lead">「${esc(attr.metricName)}」总量 <strong>${fmt(attr.total)}</strong>，按「${esc(attr.dimName)}」拆解的贡献分布：</p>
        <div class="attr-list">
          ${attr.items.map((it, i) => `
            <div class="attr-row">
              <span class="attr-rank">${i + 1}</span>
              <span class="attr-name">${esc(it.key)}</span>
              <div class="attr-bar"><div class="attr-bar-fill" style="width:${(it.share / maxShare * 100).toFixed(1)}%"></div></div>
              <span class="attr-val">${fmt(it.sum)}</span>
              <span class="attr-share">${(it.share * 100).toFixed(1)}%</span>
            </div>`).join('')}
        </div>
        <p class="plan-hint">贡献度 = 该维度分组的指标值 ÷ 总量；占比越高，对该指标的贡献越大。</p>`;
    }

    // ---- 实验检验模块 ----
    let expHtml = '<p class="plan-hint">未检测到「实验组/对照组」式的二值分组列，上传含分组的数据（如「版本：新版/旧版」）可自动触发显著性检验。</p>';
    if (exp) {
      expHtml = `
        <p class="attr-lead">按「${esc(exp.dimName)}」分组（<strong>${esc(exp.g0)}</strong> vs <strong>${esc(exp.g1)}</strong>）做两样本 t 检验：</p>
        <div class="exp-list">
          ${exp.results.map((r) => {
            if (!r.t) return '';
            const dir = r.liftPct >= 0 ? '提升' : '下降';
            return `
            <div class="exp-row ${r.significant ? 'exp-sig' : 'exp-insig'}">
              <span class="exp-name">${esc(r.name)}</span>
              <span class="exp-compare">${fmt(r.meanA)} → ${fmt(r.meanB)}</span>
              <span class="exp-lift ${r.liftPct >= 0 ? 'up' : 'down'}">${dir} ${Math.abs(r.liftPct).toFixed(1)}%</span>
              <span class="exp-stat">t=${r.t.toFixed(2)} · p=${r.p.toFixed(3)}</span>
              <span class="exp-verdict">${r.significant ? '✓ 显著' : '△ 不显著'}</span>
            </div>`;
          }).join('')}
        </div>
        <p class="plan-hint">p &lt; 0.05 判定为显著差异；结论由上传的真实数据经 Welch t 检验计算得出。</p>`;
    }

    // ---- 洞察与建议（LLM 占位） ----
    const llmBlocks = [
      { id: 'overview', title: '概览结论' },
      { id: 'trend', title: '趋势解读' },
      { id: 'attribution', title: '归因结论' },
      { id: 'opportunity', title: '机会点' },
      { id: 'risk', title: '风险点' },
      { id: 'suggestion', title: '行动建议' }
    ];
    const llmHtml = `
      <div class="llm-grid">
        ${llmBlocks.map((b) => `
          <div class="llm-card">
            <h4 class="llm-title">${b.title}</h4>
            <div class="llm-body" id="insight-llm-${b.id}"><span class="llm-loading">AI 分析中…</span></div>
          </div>`).join('')}
      </div>`;

    const html = `
      <section class="plan-block">
        <h3 class="plan-block-title"><span class="plan-num">01</span> 数据概览</h3>
        <div class="plan-block-body">${overviewHtml}</div>
      </section>
      <section class="plan-block">
        <h3 class="plan-block-title"><span class="plan-num">02</span> 可视化</h3>
        <div class="plan-block-body">${vizHtml || '<p class="plan-hint">暂无可视化：需要至少一列时间或维度列。</p>'}</div>
      </section>
      <section class="plan-block">
        <h3 class="plan-block-title"><span class="plan-num">03</span> 归因分析</h3>
        <div class="plan-block-body">${attrHtml}</div>
      </section>
      <section class="plan-block">
        <h3 class="plan-block-title"><span class="plan-num">04</span> 实验效果检验</h3>
        <div class="plan-block-body">${expHtml}</div>
      </section>
      <section class="plan-block">
        <h3 class="plan-block-title"><span class="plan-num">05</span> 洞察与建议</h3>
        <div class="plan-block-body">${llmHtml}</div>
      </section>`;

    return {
      metaText: `${s.rowCount} 行 × ${s.colCount} 列${s.timeRange ? ' · ' + s.timeRange : ''}`,
      html,
      charts,
      summary: s,
      attribution: attr,
      experiment: exp
    };
  }

  function chartCard(id, title, sub) {
    return `
      <div class="viz-card">
        <div class="viz-head">
          <span class="viz-title">${esc(title)}</span>
          <span class="viz-sub">${esc(sub)}</span>
        </div>
        <div class="viz-canvas"><canvas id="chart-${id}"></canvas></div>
      </div>`;
  }

  /* ============================================================
     Chart.js 配置
     ============================================================ */
  function baseOptions() {
    const th = chartTheme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: th.muted, font: { family: th.font, size: 11 }, boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 14 } },
        tooltip: {
          backgroundColor: th.tooltipBg,
          borderColor: th.tooltipBorder,
          borderWidth: 1,
          titleColor: th.tooltipTitle,
          bodyColor: th.tooltipBody,
          padding: 12, cornerRadius: 10,
          displayColors: true, boxPadding: 5, titleMarginBottom: 6,
          titleFont: { family: th.font, size: 12, weight: '600' },
          bodyFont: { family: th.font, size: 12.5 }
        }
      }
    };
  }

  function buildLineConfig(labels, datasets, title) {
    const th = chartTheme();
    return {
      type: 'line',
      data: { labels, datasets: datasets.map((d) => ({
        label: d.label, data: d.data, borderColor: d.color,
        backgroundColor: (ctx) => vGradient(ctx, [hexToRgba(d.color, 0.26), hexToRgba(d.color, 0.02)]),
        borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5,
        pointBackgroundColor: d.color, pointBorderColor: '#fff', pointBorderWidth: 1.5,
        tension: 0.35, fill: true
      })) },
      options: {
        ...baseOptions(),
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { color: th.grid }, ticks: { color: th.muted, font: { family: th.font, size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: th.grid }, ticks: { color: th.muted, font: { family: th.font, size: 10 }, callback: (v) => fmtCompact(v) } }
        }
      }
    };
  }

  function buildBarConfig(labels, datasets, title, horizontal) {
    const th = chartTheme();
    return {
      type: 'bar',
      data: { labels, datasets: datasets.map((d) => ({
        label: d.label, data: d.data,
        backgroundColor: (ctx) => vGradient(ctx, ['#6d8dff', '#a78bfa']),
        hoverBackgroundColor: '#a78bfa',
        borderRadius: horizontal ? { topRight: 6, bottomRight: 6 } : { topLeft: 6, topRight: 6 },
        maxBarThickness: 36,
        shadowColor: 'rgba(109,141,255,0.32)',
        shadowOffsetY: horizontal ? 4 : 6,
        shadowBlur: 14
      })) },
      options: {
        ...baseOptions(),
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: { grid: { color: th.grid }, ticks: { color: th.muted, font: { family: th.font, size: 10 } } },
          y: { grid: { color: th.grid }, ticks: { color: th.muted, font: { family: th.font, size: 10 }, callback: (v) => fmtCompact(v) } }
        }
      }
    };
  }

  function buildDoughnutConfig(labels, data, title) {
    return {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: PALETTE.slice(0, data.length), borderColor: 'transparent', borderWidth: 1, hoverOffset: 6, shadowColor: 'rgba(109,141,255,0.25)', shadowBlur: 18 }] },
      options: {
        ...baseOptions(),
        cutout: '62%',
        plugins: {
          ...baseOptions().plugins,
          legend: { position: 'right', labels: { color: chartTheme().muted, font: { family: chartTheme().font, size: 11 }, boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 10 } }
        }
      }
    };
  }

  /* ============================================================
     图表渲染
     ============================================================ */
  let chartInstances = [];
  function renderCharts(report) {
    chartInstances.forEach((c) => { try { c.destroy(); } catch (e) {} });
    chartInstances = [];
    (report.charts || []).forEach((ch) => {
      const canvas = document.getElementById('chart-' + ch.id);
      if (!canvas || !global.Chart) return;
      chartInstances.push(new global.Chart(canvas, ch.config));
    });
  }

  /* ============================================================
     LLM 洞察（分模块文本，复用 DeepSeek 后端）
     ============================================================ */
  async function generateInsights(data, apiBase) {
    const s = buildSummary(data);
    const attr = buildAttribution(data);
    const exp = buildExperiment(data);
    const payload = {
      columns: data.columns.map((c) => ({ name: c.name, type: c.type, role: c.role })),
      rowCount: s.rowCount,
      timeRange: s.timeRange,
      metrics: s.metrics.map((m) => ({ name: m.name, sum: Math.round(m.sum), avg: Math.round(m.avg), max: Math.round(m.max), min: Math.round(m.min) })),
      attribution: attr ? { dimName: attr.dimName, metricName: attr.metricName, items: attr.items.map((i) => ({ key: i.key, sum: Math.round(i.sum), share: Number(i.share.toFixed(3)) })) } : null,
      experiment: exp ? { dimName: exp.dimName, g0: exp.g0, g1: exp.g1, results: exp.results.map((r) => ({ name: r.name, meanA: Math.round(r.meanA), meanB: Math.round(r.meanB), p: Number(r.p.toFixed(4)), significant: r.significant, liftPct: Number(r.liftPct.toFixed(1)) })) } : null
    };
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      const d = await res.json();
      if (!d || !d.blocks) return null;
      return Object.entries(d.blocks).map(([id, text]) => ({
        id,
        html: Array.isArray(text) ? `<ul class="llm-list">${text.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="llm-text">${esc(text)}</p>`
      }));
    } catch (e) {
      return null;
    }
  }

  /* ============================================================
     Markdown 导出
     ============================================================ */
  function toMarkdown(report) {
    const s = report.summary;
    const L = [];
    L.push('# 数据洞察报告');
    L.push('');
    L.push(`> ${report.metaText}`);
    L.push('');
    L.push('## 数据概览');
    s.metrics.forEach((m) => {
      L.push(`- ${m.name}：总量 ${fmt(m.sum)}，均值 ${fmtCompact(m.avg)}，峰值 ${fmtCompact(m.max)}`);
    });
    L.push('');
    if (report.attribution) {
      const a = report.attribution;
      L.push('## 归因分析');
      L.push(`「${a.metricName}」按「${a.dimName}」拆解：`);
      a.items.forEach((it, i) => L.push(`- ${i + 1}. ${it.key}：${fmt(it.sum)}（${(it.share * 100).toFixed(1)}%）`));
      L.push('');
    }
    if (report.experiment) {
      const e = report.experiment;
      L.push('## 实验效果检验');
      L.push(`按「${e.dimName}」分组（${e.g0} vs ${e.g1}）：`);
      e.results.forEach((r) => { if (r.t) L.push(`- ${r.name}：${fmt(r.meanA)} → ${fmt(r.meanB)}，${r.liftPct >= 0 ? '提升' : '下降'} ${Math.abs(r.liftPct).toFixed(1)}%，p=${r.p.toFixed(3)}${r.significant ? '（显著）' : '（不显著）'}`); });
      L.push('');
    }
    L.push('## 洞察与建议');
    L.push('（详见在线报告的「洞察与建议」模块）');
    L.push('');
    L.push('*由增长罗盘 · Northstar 数据洞察生成*');
    return L.join('\n');
  }

  global.NorthstarInsight = { parse, renderMapping, generateReport, renderCharts, generateInsights, toMarkdown, buildSummary, buildAttribution, runTTest, SAMPLE };
})(window);
