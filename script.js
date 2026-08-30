/* ============================================================
   增长罗盘 · Northstar — 骨架逻辑
   视图切换 / 主题 / 表单预设联动 / 项目存储
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 预设数据 ---------- */
  // 增长目标 → 默认追踪指标（业务无关，仅作便捷预设，可增删）
  const TARGET_PRESETS = {
    '拉新': ['新增用户数', '注册转化率', '获客成本', '渠道拉新占比'],
    '激活': ['激活率', '激活用户数', '激活转化率', '激活成本'],
    '留存': ['次日留存率', '7日留存率', 'DAU/MAU', '流失率'],
    '转化': ['付费转化率', '付费用户数', 'ARPU', 'LTV'],
    '传播': ['裂变系数', '分享率', '邀请转化率', '传播新增占比']
  };

  const TEMPLATES = [
    { id: 'acquisition', goal: '拉新', icon: '✦', name: '新用户拉新', desc: '获取新用户，降低获客成本', bg: '面向目标人群获取新用户，当前获客成本偏高，希望通过低门槛权益与社交裂变降低获客成本。' },
    { id: 'activation', goal: '激活', icon: '◆', name: '新用户激活', desc: '提升注册后关键行为完成率', bg: '新用户注册后首次关键行为完成率偏低，希望通过新手引导与行为激励提升激活率。' },
    { id: 'retention', goal: '留存', icon: '●', name: '老用户召回', desc: '唤醒沉默用户，提升复访', bg: '用户留存低于行业基线，希望通过召回触达与签到机制提升复访频次。' },
    { id: 'conversion', goal: '转化', icon: '▲', name: '付费转化', desc: '提升付费转化率与 LTV', bg: '活跃用户付费转化率偏低，希望通过限时权益与会员体系提升付费与 LTV。' },
    { id: 'referral', goal: '传播', icon: '❋', name: '裂变增长', desc: '老带新，撬动指数增长', bg: '希望通过邀请奖励与双向权益驱动老用户带来新用户，实现低成本增长。' }
  ];

  const STORAGE_KEY = 'northstar-projects';
  const THEME_KEY = 'northstar-theme';
  // LLM serverless 后端地址（部署后填 Vercel URL，如 https://xxx.vercel.app；留空则走 mock 玩法池降级）
  const API_BASE = 'https://northstar-rocosong.vercel.app';

  /* ---------- 状态 ---------- */
  let projects = loadProjects();
  let currentProjectId = null;
  let editingProjectId = null;

  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const views = {
    projects: $('#view-projects'),
    new: $('#view-new'),
    detail: $('#view-detail')
  };
  const navLinks = $$('.nav-link');
  const projectGrid = $('#project-grid');
  const emptyState = $('#empty-state');
  const form = $('#project-form');

  /* ============================================================
     存储
     ============================================================ */
  function loadProjects() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveProjects() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  /* ============================================================
     主题
     ============================================================ */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  });

  /* ============================================================
     视图切换
     ============================================================ */
  function showView(name) {
    Object.keys(views).forEach((k) => views[k].classList.toggle('hidden', k !== name));
    navLinks.forEach((l) => l.classList.toggle('is-active', l.dataset.nav === name));
    window.scrollTo({ top: 0 });
  }

  /* ============================================================
     项目列表
     ============================================================ */
  const STATUS_LABEL = { draft: '草稿', live: '已上线', review: '已复盘' };
  const STATUS_CLASS = { draft: 'status-draft', live: 'status-live', review: 'status-review' };

  function renderProjects() {
    projectGrid.innerHTML = '';
    const hasProjects = projects.length > 0;
    emptyState.classList.toggle('hidden', hasProjects);
    projectGrid.classList.toggle('hidden', !hasProjects);
    $('#projects-title').classList.toggle('hidden', !hasProjects);

    projects.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card-top">
          <span class="tag">${escapeHtml(p.platform || '通用')}</span>
          <div class="project-card-actions">
            <span class="status-badge ${STATUS_CLASS[p.status] || ''}">${STATUS_LABEL[p.status] || '草稿'}</span>
            <button class="card-delete" data-id="${p.id}" title="删除项目" type="button">✕</button>
          </div>
        </div>
        <h3 class="project-card-title">${escapeHtml(p.name)}</h3>
        <p class="view-sub" style="font-size:13px">${escapeHtml(truncate(p.bg, 60))}</p>
        <div class="project-card-meta">
          <span class="tag tag-goal">${escapeHtml(p.goal || '未设目标')}</span>
          ${(p.metrics || []).slice(0, 3).map((m) => `<span class="tag">${escapeHtml(m)}</span>`).join('')}
        </div>`;
      card.addEventListener('click', () => openProject(p.id));
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProject(p.id);
      });
      projectGrid.appendChild(card);
    });
  }

  function deleteProject(id) {
    if (!confirm('确定删除该项目？此操作不可恢复。')) return;
    projects = projects.filter((p) => p.id !== id);
    saveProjects();
    renderProjects();
    renderKPIs();
  }

  function renderKPIs() {
    const total = projects.length;
    const live = projects.filter((p) => p.status === 'live').length;
    const review = projects.filter((p) => p.status === 'review').length;
    const pending = projects.filter((p) => !p.planHistory || !p.planHistory.length).length;
    const kpis = [
      { value: total, label: '项目总数' },
      { value: live, label: '进行中' },
      { value: review, label: '已复盘' },
      { value: pending, label: '待生成方案' }
    ];
    $('#kpi-grid').innerHTML = kpis.map((k) => `
      <div class="kpi-card">
        <span class="kpi-value">${k.value}</span>
        <span class="kpi-label">${k.label}</span>
      </div>`).join('');
  }

  function renderTemplates() {
    $('#template-grid').innerHTML = TEMPLATES.map((t) => `
      <div class="template-card" data-template="${t.id}">
        <span class="template-icon">${t.icon}</span>
        <div class="template-body">
          <h3 class="template-name">${t.name}</h3>
          <p class="template-desc">${t.desc}</p>
        </div>
        <span class="template-goal">${t.goal}</span>
      </div>`).join('');
    $$('#template-grid .template-card').forEach((card) => {
      card.addEventListener('click', () => {
        const t = TEMPLATES.find((x) => x.id === card.dataset.template);
        if (t) createFromTemplate(t);
      });
    });
  }

  function createFromTemplate(t) {
    const project = {
      id: 'p_' + Math.random().toString(36).slice(2, 8),
      name: t.name,
      bg: t.bg,
      platform: '',
      goal: t.goal,
      audienceTags: [],
      budget: '',
      channels: [],
      tools: [],
      sku: '',
      metrics: TARGET_PRESETS[t.goal] || [],
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    projects.unshift(project);
    saveProjects();
    renderProjects();
    renderKPIs();
    openProject(project.id);
  }

  function openProject(id) {
    currentProjectId = id;
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    $('#detail-title').textContent = p.name;
    $('#detail-eyebrow').textContent = p.platform ? `${p.platform} · ${p.goal || ''}` : (p.goal || '项目');
    const badge = $('#detail-status');
    badge.textContent = STATUS_LABEL[p.status] || '草稿';
    badge.className = `status-badge ${STATUS_CLASS[p.status] || ''}`;
    renderPlanSummary(p);
    renderPlan(p);
    resetReview();
    showView('detail');
  }

  /* ============================================================
     表单：chips 多选（渠道 / 工具）
     ============================================================ */
  $$('.chips[data-chips]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip || !group.contains(chip)) return;
      if (chip.classList.contains('chip-metric')) return; // 指标 chip 单独处理
      chip.classList.toggle('is-active');
    });
  });

  function getActiveChips(groupSelector) {
    return $$(`${groupSelector} .chip.is-active`).map((c) => c.dataset.value);
  }

  /* ============================================================
     表单：其他自填（select 其他 / chips 自定义添加）
     ============================================================ */
  function addCustomChip(group, val) {
    const container = document.querySelector(`.chips[data-chips="${group}"]`);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip is-active';
    chip.dataset.value = val;
    chip.textContent = val;
    container.appendChild(chip);
  }

  // select「其他」→ 显示自定义输入框
  [['#project-platform', '#platform-other'], ['#project-goal', '#goal-other']].forEach(([selId, inputId]) => {
    $(selId).addEventListener('change', (e) => {
      $(inputId).classList.toggle('hidden', e.target.value !== '__other__');
    });
  });

  // chips 自定义添加（渠道 / 权益）
  $$('[data-add-chip]').forEach((btn) => {
    const group = btn.dataset.addChip;
    const input = document.querySelector(`[data-add-input="${group}"]`);
    const doAdd = () => {
      const val = input.value.trim();
      if (!val) return;
      addCustomChip(group, val);
      input.value = '';
    };
    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  });

  // 目标人群自填
  $('#btn-add-audience').addEventListener('click', () => {
    const input = $('#audience-input');
    const val = input.value.trim();
    if (!val) return;
    addCustomChip('audience', val);
    input.value = '';
  });
  $('#audience-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btn-add-audience').click(); }
  });

  /* ============================================================
     表单：指标（目标预设 + 增删）
     ============================================================ */
  const metricsContainer = $('#metrics-container');
  const metricSet = new Set();

  function renderMetrics() {
    metricsContainer.innerHTML = '';
    if (metricSet.size === 0) {
      metricsContainer.innerHTML = '<span class="field-hint">请选择「增长目标」自动带出默认指标，或手动添加。</span>';
      return;
    }
    metricSet.forEach((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip-metric is-active';
      chip.dataset.value = m;
      chip.innerHTML = `${escapeHtml(m)} <span class="chip-x" title="移除">✕</span>`;
      chip.querySelector('.chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        metricSet.delete(m);
        renderMetrics();
      });
      metricsContainer.appendChild(chip);
    });
  }

  $('#project-goal').addEventListener('change', (e) => {
    const goal = e.target.value;
    if (!goal) return;
    // 用预设替换当前指标集（用户之后可增删）
    metricSet.clear();
    (TARGET_PRESETS[goal] || []).forEach((m) => metricSet.add(m));
    renderMetrics();
  });

  $('#btn-add-metric').addEventListener('click', () => {
    const input = $('#metric-input');
    const val = input.value.trim();
    if (!val) return;
    metricSet.add(val);
    input.value = '';
    renderMetrics();
  });
  $('#metric-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#btn-add-metric').click(); }
  });

  /* ============================================================
     表单：提交 / 取消
     ============================================================ */
  $('#btn-cancel').addEventListener('click', () => showView('projects'));
  $('#btn-back-new').addEventListener('click', () => showView('projects'));
  $('#btn-back-detail').addEventListener('click', () => showView('projects'));
  $('#btn-edit-project').addEventListener('click', () => {
    const p = getCurrentProject();
    if (p) goEdit(p);
  });
  $('#brand-home').addEventListener('click', (e) => { e.preventDefault(); showView('projects'); });

  function resetForm() {
    form.reset();
    metricSet.clear();
    $$('.chip').forEach((c) => c.classList.remove('is-active'));
    $$('.other-input').forEach((i) => { i.classList.add('hidden'); i.value = ''; });
    renderMetrics();
  }

  function goNew() {
    editingProjectId = null;
    resetForm();
    showView('new');
    $('#project-name').focus();
  }

  function goEdit(project) {
    editingProjectId = project.id;
    resetForm();
    fillForm(project);
    showView('new');
    $('#project-name').focus();
  }

  function fillSelect(selectId, value, otherInputId) {
    const select = $(selectId);
    const hasOption = Array.from(select.options).some((o) => o.value === value);
    if (hasOption) {
      select.value = value;
      $(otherInputId).classList.add('hidden');
    } else if (value) {
      select.value = '__other__';
      $(otherInputId).value = value;
      $(otherInputId).classList.remove('hidden');
    }
  }

  function activateChip(group, value) {
    const chip = document.querySelector(`.chips[data-chips="${group}"] .chip[data-value="${value}"]`);
    if (chip) chip.classList.add('is-active');
  }

  function fillForm(project) {
    $('#project-name').value = project.name || '';
    $('#project-bg').value = project.bg || '';
    fillSelect('#project-platform', project.platform || '', '#platform-other');
    fillSelect('#project-goal', project.goal || '', '#goal-other');
    $('#project-budget').value = project.budget || '';
    $('#project-sku').value = project.sku || '';
    $('#baseline-users').value = project.baselineUsers || '';
    $('#baseline-cpm').value = project.baselineCpm || '';
    $('#baseline-ctr').value = project.baselineCtr || '';
    $('#baseline-cvr').value = project.baselineCvr || '';
    (project.audienceTags || []).forEach((t) => activateChip('audience', t));
    (project.channels || []).forEach((c) => activateChip('channels', c));
    (project.tools || []).forEach((t) => activateChip('tools', t));
    (project.metrics || []).forEach((m) => metricSet.add(m));
    renderMetrics();
  }
  $('#btn-new-project').addEventListener('click', goNew);
  $('#btn-new-project-2').addEventListener('click', goNew);
  navLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    if (l.dataset.nav === 'projects') showView('projects');
    else if (l.dataset.nav === 'new') goNew();
  }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#project-name').value.trim();
    const bg = $('#project-bg').value.trim();
    const goalSel = $('#project-goal').value;
    const goal = goalSel === '__other__' ? $('#goal-other').value.trim() : goalSel;
    if (!name || !bg || !goal) {
      alert('请填写：项目名称、业务背景、增长目标（必填项）。');
      return;
    }
    const platformSel = $('#project-platform').value;
    const platform = platformSel === '__other__' ? $('#platform-other').value.trim() : platformSel;
    const fields = {
      name,
      bg,
      platform,
      goal,
      audienceTags: getActiveChips('[data-chips="audience"]'),
      budget: $('#project-budget').value,
      channels: getActiveChips('[data-chips="channels"]'),
      tools: getActiveChips('[data-chips="tools"]'),
      sku: $('#project-sku').value.trim(),
      baselineUsers: $('#baseline-users').value,
      baselineCpm: $('#baseline-cpm').value,
      baselineCtr: $('#baseline-ctr').value,
      baselineCvr: $('#baseline-cvr').value,
      metrics: Array.from(metricSet)
    };

    if (editingProjectId) {
      const idx = projects.findIndex((p) => p.id === editingProjectId);
      if (idx >= 0) {
        // 配置变更后，旧方案作废，需重新生成
        projects[idx] = { ...projects[idx], ...fields, planHistory: null, planIndex: 0 };
      }
      saveProjects();
      renderProjects();
      renderKPIs();
      openProject(editingProjectId);
    } else {
      const project = {
        id: 'p_' + Math.random().toString(36).slice(2, 8),
        ...fields,
        status: 'draft',
        createdAt: new Date().toISOString()
      };
      projects.unshift(project);
      saveProjects();
      renderProjects();
      renderKPIs();
      openProject(project.id);
    }
  });

  /* ============================================================
     详情：Tab 切换
     ============================================================ */
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      $$('.tab-panel').forEach((panel) =>
        panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab)
      );
      if (tab.dataset.tab === 'review') {
        const p = getCurrentProject();
        if (p && !reviewDash) initReview(p); // 冷启动预填充（不启动数据流）
      }
    });
  });

  /* ============================================================
     策划模块：方案生成
     ============================================================ */
  function getCurrentProject() {
    return projects.find((x) => x.id === currentProjectId);
  }

  function renderPlanSummary(p) {
    const parts = [];
    if (p.goal) parts.push(`<span class="tag tag-goal">${escapeHtml(p.goal)}</span>`);
    if (p.platform) parts.push(`<span class="tag">${escapeHtml(p.platform)}</span>`);
    if (p.budget) parts.push(`<span class="tag">预算 ${escapeHtml(p.budget)} 元</span>`);
    parts.push(`<span class="tag">${(p.channels || []).length} 个渠道</span>`);
    parts.push(`<span class="tag">${(p.metrics || []).length} 项指标</span>`);
    $('#plan-summary').innerHTML = parts.join('');
  }

  function renderPlan(p) {
    if (p && p.planHistory && p.planHistory.length) {
      renderCurrentPlan(p);
    } else {
      $('#plan-output').innerHTML = '';
      $('#plan-empty').classList.remove('hidden');
      $('#tune-panel').classList.add('hidden');
    }
  }

  function renderCurrentPlan(p) {
    const plan = p.planHistory[p.planIndex];
    $('#plan-output').innerHTML = NorthstarPlan.render(plan);
    $('#plan-empty').classList.add('hidden');
    updateTunePanel(p, plan);
    $('#btn-export').classList.remove('hidden');
  }

  function updateTunePanel(p, plan) {
    $('#tune-panel').classList.remove('hidden');
    $('#tune-version').textContent = `v${plan.version || 1} / 共 ${p.planHistory.length} 版`;
    $('#btn-tune-prev').classList.toggle('hidden', p.planIndex === 0);
  }

  $('#btn-generate-plan').addEventListener('click', async () => {
    const p = getCurrentProject();
    if (!p) return;
    const plan = NorthstarPlan.generate(p);
    p.planHistory = [plan];
    p.planIndex = 0;
    saveProjects();
    renderCurrentPlan(p);
    $('#plan-output').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 异步 LLM 增强：定制化玩法 + 诊断（失败/未配置则自动降级为 mock 玩法池）
    if (API_BASE) {
      const llm = await NorthstarPlan.generateWithLLM(p, API_BASE);
      if (llm) {
        plan.diagnosis = { ...plan.diagnosis, ...llm.diagnosis };
        plan.playbook = { plays: llm.plays, note: '以上玩法由 AI 基于业务背景定制化生成。' };
        p.planHistory = [plan];
        saveProjects();
        renderCurrentPlan(p);
      }
    }
  });

  $('#btn-tune-submit').addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p) return;
    const feedback = $('#tune-input').value.trim();
    if (!feedback) { $('#tune-input').focus(); return; }
    const current = p.planHistory[p.planIndex];
    const tuned = NorthstarPlan.tune(current, feedback, p);
    p.planHistory = p.planHistory.slice(0, p.planIndex + 1);
    p.planHistory.push(tuned);
    p.planIndex = p.planHistory.length - 1;
    $('#tune-input').value = '';
    saveProjects();
    renderCurrentPlan(p);
    $('#plan-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#btn-tune-prev').addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p || p.planIndex <= 0) return;
    p.planIndex--;
    saveProjects();
    renderCurrentPlan(p);
    $('#plan-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ============================================================
     方案导出（Markdown / PDF）
     ============================================================ */
  $('#btn-export').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#export-menu').classList.toggle('hidden');
  });
  $('#export-menu').addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    $('#export-menu').classList.add('hidden');
  });

  $('#btn-export-md').addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p || !p.planHistory) return;
    const plan = p.planHistory[p.planIndex];
    const md = NorthstarPlan.toMarkdown(plan);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name}-增长方案-v${plan.version || 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
    $('#export-menu').classList.add('hidden');
  });

  $('#btn-export-pdf').addEventListener('click', () => {
    $('#export-menu').classList.add('hidden');
    window.print();
  });

  /* ============================================================
     复盘模块：数据看板 + 预警 + 复盘
     ============================================================ */
  let reviewTimer = null;
  let reviewDash = null;

  function renderReview() {
    if (!reviewDash) return;
    $('#review-dashboard').innerHTML = NorthstarReview.renderDashboard(reviewDash);
    $('#review-alerts').innerHTML = NorthstarReview.renderAlerts(reviewDash);
    $('#review-report').innerHTML = NorthstarReview.renderReport(reviewDash);
  }

  function initReview(p) {
    const plan = p.planHistory ? p.planHistory[p.planIndex] : null;
    if (!plan || !plan.metricSchema || !plan.metricSchema.metrics.length) {
      $('#review-empty').classList.remove('hidden');
      $('#review-output').classList.add('hidden');
      return false;
    }
    reviewDash = NorthstarReview.buildDashboard(plan);
    renderReview();
    $('#review-empty').classList.add('hidden');
    $('#review-output').classList.remove('hidden');
    return true;
  }

  function resetReview() {
    if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
    reviewDash = null;
    $('#review-empty').classList.remove('hidden');
    $('#review-output').classList.add('hidden');
    $('#review-status-text').textContent = '数据未接入';
    $('#review-status-dot').classList.remove('is-live');
    $('#btn-start-stream').innerHTML = '<span aria-hidden="true">▶</span> 启动实时追踪';
  }

  $('#btn-start-stream').addEventListener('click', () => {
    const p = getCurrentProject();
    if (!p) return;
    if (reviewTimer) {
      // 暂停
      clearInterval(reviewTimer);
      reviewTimer = null;
      $('#review-status-text').textContent = '已暂停';
      $('#review-status-dot').classList.remove('is-live');
      $('#btn-start-stream').innerHTML = '<span aria-hidden="true">▶</span> 继续追踪';
      return;
    }
    // 启动 / 继续
    if (!reviewDash) {
      const ok = initReview(p);
      if (!ok) return;
    }
    $('#review-status-text').textContent = '实时追踪中（mock 数据流）';
    $('#review-status-dot').classList.add('is-live');
    $('#btn-start-stream').innerHTML = '<span aria-hidden="true">⏸</span> 暂停追踪';
    reviewTimer = setInterval(() => {
      reviewDash = NorthstarReview.tick(reviewDash);
      renderReview();
    }, 2000);
  });

  // CSV 导入（字段映射）
  $('#btn-import-csv').addEventListener('click', () => {
    $('#csv-input').click();
  });
  $('#csv-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csvData = NorthstarReview.parseCSV(ev.target.result);
      if (!csvData) { alert('CSV 解析失败，请检查格式（首行为表头）。'); return; }
      const p = getCurrentProject();
      if (!p) return;
      if (!reviewDash) initReview(p);
      const applied = NorthstarReview.applyCSV(reviewDash, csvData);
      renderReview();
      $('#review-status-text').textContent = `已导入数据（匹配 ${applied} 项指标）`;
      $('#review-empty').classList.add('hidden');
      $('#review-output').classList.remove('hidden');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 增长实验（A/B 测试）
  $('#btn-ab-run').addEventListener('click', () => {
    const id = $('#ab-hypothesis').value;
    if (!id) { alert('请先选择要验证的策略假设。'); return; }
    const exp = NorthstarReview.EXPERIMENTS.find((e) => e.id === id);
    if (!exp) return;
    const result = NorthstarReview.runExperiment(exp);
    $('#ab-result').innerHTML = NorthstarReview.renderExperiment(result);
  });

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function truncate(s, n) {
    s = String(s ?? '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ============================================================
     封面入口 + 星空
     ============================================================ */
  function initStars() {
    const container = $('#landing-stars');
    for (let i = 0; i < 70; i++) {
      const star = document.createElement('div');
      star.className = 'landing-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      const size = Math.random() < 0.8 ? 2 : 3;
      star.style.width = size + 'px';
      star.style.height = size + 'px';
      star.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
      star.style.setProperty('--delay', (Math.random() * 3) + 's');
      container.appendChild(star);
    }
  }

  $('#btn-enter').addEventListener('click', () => {
    $('#view-landing').classList.add('hidden');
    document.querySelector('.topbar').classList.remove('hidden');
    document.querySelector('.main').classList.remove('hidden');
    showView('projects');
  });

  /* ---------- 启动 ---------- */
  initTheme();
  initStars();
  renderProjects();
  renderKPIs();
  renderTemplates();
  renderMetrics();
})();
