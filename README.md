<div align="center">

# 增长罗盘 · Northstar

**AI 用户增长 Copilot** · 面向互联网产品与消费品牌的增长全链路助手

让每一次增长，都有章可循。

[在线体验](https://rocosong.github.io/northstar/) · [产品需求文档](./PRD.md)

</div>

---

## 一句话定位

把一次用户增长活动，从「拍脑袋写方案 + 手工盯数据」，变成「输入项目背景与目标，AI 生成可落地的增长方案；上传业务数据，一键产出分析报告」，覆盖 **策划 → 上线 → 复盘** 全链路。产品不绑定任何特定行业打法，业务相关的创意全部由 LLM 依据你的业务背景动态生成。

## ✨ 核心功能

### 1. 智能策划（新建项目）

输入业务背景、增长目标、平台、目标人群、权益工具、触达渠道，AI 深度定制生成一套完整方案：

| 板块 | 说明 |
|---|---|
| 项目诊断 | 背景总结 · 核心目标 · 增长卡点 · 机会点 |
| 创意玩法 | 3 个有记忆点、可落地的玩法（机制 + 亮点），拒绝满减/打卡等通用套路 |
| 执行计划 | 分阶段动作 + 各阶段目标占比，与玩法机制强联动 |
| 预算分配 | 渠道 + 占比 + 理由，每一笔预算都点名具体玩法 |
| 权益规则 | 面额 / 门槛 / 叠加 / 限量等可落地规则 |
| 风险提示 | 权益资损（羊毛/套利）+ 经营风险，去重合并 |
| 增长预估 | 曝光 × 点击率 × 转化率 × 策略提升，区间化输出 |

### 2. 数据洞察

上传企业导出的 CSV / Excel（或粘贴表格），一键生成分析报告：

- **字段智能映射**：自动识别日期/数值/文本 → 时间/指标/维度，识别不准可手动微调
- **数据概览**：核心指标 + 环比变化
- **专业可视化**：动态选图（时间序列 → 折线；维度对比 → 柱状图 + 环形图；多指标 → 对比柱状图），同色系渐变 + 阴影 + 数据标签
- **归因分析**：贡献度拆解，量化各维度对结果的拉动
- **实验检验**：两样本 Welch t 检验，判断分组差异是否显著
- **AI 洞察报告**：趋势 / 归因 / 机会点 / 风险 / 建议，分模块结构化生成
- **导出**：报告可导出 Markdown

## 🏗️ 技术架构

```
前端（原生 HTML/CSS/JS，零框架依赖，GitHub Pages 部署）
  ├── 策划引擎 plan.js          — 确定性预估模型 + 方案渲染 + mock 降级
  ├── 洞察引擎 insight.js       — 字段推断 / 归因 / t 检验 / 图表动态生成
  └── 可视化 Chart.js 4.4.1     — 折线 / 柱状 / 环形，渐变 + 阴影 + 数据标签
        │
        ▼  跨域调用
后端（Vercel Functions，serverless）
  ├── api/generate.js           — LLM 生成增长方案（结构化 JSON）
  └── api/analyze.js            — LLM 生成数据洞察报告（结构化 JSON）
        │
        ▼
  DeepSeek API（deepseek-chat，response_format: json_object）
```

**设计原则**：确定性算法（预估模型 / 字段推断 / t 检验）保证稳定可靠，LLM 保证 AI 含量与个性化，mock 降级保证无 Key / 断网也能完整演示。

## 🧰 技术栈

- **前端**：原生 HTML / CSS / JavaScript，[Chart.js](https://www.chartjs.org/) 4.4.1 + [chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) + [SheetJS](https://sheetjs.com/) 0.20.2
- **后端**：Vercel Functions（Node.js serverless）
- **大模型**：[DeepSeek API](https://platform.deepseek.com/)（OpenAI 兼容，JSON 模式结构化输出）
- **设计**：深夜空 × 北极星（墨蓝黑 `#0a0c11` + 冰蓝 → 紫渐变 `#6d8dff → #a78bfa`），Space Grotesk + Manrope + Noto Sans SC，深/浅双主题

## 🚀 快速开始

### 本地运行前端

前端是纯静态页面，直接起任意静态服务器即可：

```bash
cd northstar
python -m http.server 8080   # 或 npx serve .
# 打开 http://localhost:8080
```

> 无后端时，策划与洞察会自动走内置 mock 数据降级，功能可完整演示。

### 本地运行后端（可选，接入真实 LLM）

```bash
npm install -g vercel
vercel dev                    # 本地起 serverless 函数
```

### 部署

- **前端**：推送到 GitHub 后启用 Pages（本项目已部署于 `rocosong.github.io/northstar/`）
- **后端**：配置环境变量 `DEEPSEEK_API_KEY` 后 `vercel --prod`

```bash
vercel --prod
```

> 前端调用后端的地址在 [script.js](./script.js) 中的 `API_BASE` 常量，部署时改为你自己的后端域名。

## 📁 项目结构

```
northstar/
├── index.html          # SPA 单页（Landing + 顶栏导航 + 三个视图）
├── styles.css          # 设计系统 + 全部样式（含深/浅主题 CSS 变量）
├── script.js           # 应用壳：导航 / 项目状态 / LLM merge / 数据洞察交互
├── plan.js             # 策划引擎：预估模型 + 方案渲染 + mock 降级
├── insight.js          # 洞察引擎：字段推断 / 归因 / t 检验 / 图表生成
├── api/
│   ├── generate.js     # LLM 生成增长方案（Vercel Function）
│   └── analyze.js      # LLM 生成数据洞察报告（Vercel Function）
├── PRD.md              # 产品需求文档
└── package.json        # vercel dev 脚本
```

## 📄 License

[MIT](./LICENSE) © Ziang SONG（RocoSONG）

---

<div align="center">

**增长罗盘 · Northstar** — 把资深运营的方案能力与数据敏感度，沉淀为可复用的 AI 助手。

</div>
