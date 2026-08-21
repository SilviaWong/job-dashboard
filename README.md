# Job Dashboard Local (本地求职看板系统)

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4.x-00DC82?logo=nuxt.js)](https://nuxt.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vuedotjs)](https://vuejs.org/)
[![Element Plus](https://img.shields.io/badge/Element%20Plus-2.x-409EFF?logo=elementplus)](https://element-plus.org/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare)](https://pages.cloudflare.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)

**Job Dashboard Local** 是一个基于 **Nuxt 4** 与 **Vue 3** 构建的个人求职数据管理与智能看板系统。系统支持将主流招聘平台（Boss直聘、51job前程无忧、智联招聘、猎聘）的数据进行统一采集、清洗、标准化聚合与多维分析，帮助求职者高效管理投递全流程，并通过 AI 辅助进行岗位匹配度诊断与投递沟通优化。

---

## 🌐 演示地址 (Online Demo)

- 🔗 **独立域名演示**：[https://jobs.yuyo.cc.cd/](https://jobs.yuyo.cc.cd/)
- 🔗 **Cloudflare Pages 镜像**：[https://job-dashboard-bgr.pages.dev/](https://job-dashboard-bgr.pages.dev/)

> 💡 *注：在线演示部署于 Cloudflare Pages 边缘节点，分布式数据库采用 Cloudflare D1。支持完整前端交互与看板展示。*

---

## ✨ 核心功能 (Key Features)

### 1. 🏢 多平台数据清洗与整合
- **标准化适配器 (Normalizer)**：内置策略模式的各平台适配器，自动解析并清洗 Boss直聘、51job、智联招聘、猎聘等平台的原始 JSON 数据。
- **字段统一化**：将薪资范围、学历要求、工作地点、公司规模、HR活跃度、福利标签等标准化处理，抹平平台差异。

### 2. 📊 现代求职看板与列表视图
- **职位列表与高阶筛选**：支持按平台、学历、关键字、公司、黑名单状态及标记状态（收藏/失效/不合适）进行实时组合过滤。
- **招聘进度看板 (Kanban)**：直观拖拽与状态跟踪（沟通中、已投递、约面试、已拿Offer、不合适等）。
- **详尽职位抽屉**：点击职位展开多标签页抽屉（岗位描述、公司信息、AI诊断结果、面试记录等）。
- **批量管理**：支持批量删除、批量标记、批量更新状态等高效操作。

### 3. 🤖 AI 智能辅助
- **岗位匹配度诊断**：一键基于岗位 JD 与个人简历进行智能诊断，给出评分、匹配等级、优势与不足分析。
- **打招呼语与自我介绍**：根据目标岗位特点生成个性化沟通文案，提升 HR 回复率。
- **面试预测与复盘**：自动预测潜在面试提问，并支持面试全过程记录与复盘。
- **面试题库关联 (Standard Questions)**：支持标准题库管理、多变体题目关联及 AI 自动解答生成。

### 4. 🏢 公司库与黑名单管理
- **公司信息识别**：记录公司全称、来源平台、工商背景及中介/外包（Agency）标识。
- **黑名单机制**：一键拉黑不良企业，自动隐藏全站相关招聘信息。

### 5. 🔒 本地优先 (Local-First) 与云端边缘部署
- **本地化安全**：默认基于 SQLite 本地存储，数据不外泄，保障隐私安全。
- **边缘计算支持**：原生支持 Cloudflare Pages + Cloudflare D1 (via `@prisma/adapter-d1`) 免费高性能部署。

---

## 🧭 页面路由与模块结构 (Routes & Pages)

| 路由路径 | 页面说明 | 核心功能 |
| :--- | :--- | :--- |
| `/jobs` | **职位列表管理** | 核心数据表，支持条件搜索、批量操作、收藏/隐藏/拉黑、AI 诊断与职位详情抽屉 |
| `/dashboard` | **数据统计大屏** | 投递数据漏斗分析、平台分布、薪资区间统计、词云图及求职进度可视化 |
| `/kanban` | **招聘进度看板** | 看板式多列展示，拖拽或切换求职状态（已投递、沟通中、约面试等） |
| `/companies` | **公司管理库** | 查看公司档案、标记中介/外包、管理黑名单公司列表 |
| `/questions` | **面试题库管理** | 标准面试题与多变体关联、分类标签管理、AI 智能生成标准回答 |
| `/ai/resume` | **简历配置** | 管理个人简历信息，供 AI 匹配诊断及打招呼文案生成使用 |
| `/ai/model` | **AI 模型配置** | 配置大语言模型 API（OpenAI / DeepSeek / Claude 等）与 Key 参数 |
| `/ai/skills` | **AI Skill 配置** | 自定义 AI 提示词与 Skill 模板 |

---

## 🛠 技术栈 (Tech Stack)

- **前端框架**：[Nuxt 4](https://nuxt.com/) (Vue 3, SPA 客户端渲染模式)
- **UI 组件库**：[Element Plus](https://element-plus.org/)
- **数据可视化**：[ECharts](https://echarts.apache.org/) + `echarts-wordcloud` + `vue-echarts`
- **图标库**：[Lucide Vue Next](https://lucide.dev/)
- **ORM / 数据库**：[Prisma 5](https://www.prisma.io/) (SQLite 本地开发 / Cloudflare D1 生产)
- **服务端 API**：Nuxt 内置 [Nitro](https://nitro.unjs.io/) 引擎
- **部署平台**：[Cloudflare Pages](https://pages.cloudflare.com/) + Cloudflare D1

---

## 🚀 本地开发快速开始 (Getting Started)

### 1. 环境准备
- Node.js 18.0+
- npm / pnpm / yarn

### 2. 克隆仓库与安装依赖
```bash
git clone https://github.com/your-username/job-dashboard-local.git
cd job-dashboard-local
npm install
```

### 3. 初始化数据库
项目在本地使用 SQLite 数据库（位于 `prisma/dev.db`）：
```bash
# 推送 Schema 到本地 SQLite 数据库
npx prisma db push

# (可选) 补丁 Prisma 以适配边缘环境
node patch-prisma.cjs
```

### 4. 启动开发服务器
```bash
npm run dev
```
启动完成后，在浏览器访问 `http://localhost:3000` 即可开始使用。

---

## ☁️ 部署指南 (Deployment to Cloudflare Pages & D1)

本项目已完成 Cloudflare Pages + Cloudflare D1 的 Edge 环境深度适配。完整部署文档请参阅 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

### 简易部署步骤：
1. **创建 D1 数据库**：
   ```bash
   npx wrangler d1 create job-dashboard-db
   ```
   并将生成的 `database_id` 更新至 `wrangler.toml` 文件中。

2. **推送数据库结构到 D1**：
   ```bash
   npx wrangler d1 execute job-dashboard-db --file=scripts/sql/sync_for_d1_perfect.sql --remote
   ```

3. **打包与部署**：
   ```bash
   NITRO_PRESET=cloudflare-pages npm run build
   npx wrangler pages deploy .output/public --project-name job-dashboard
   ```

---

## 📁 项目结构 (Project Structure)

```text
job-dashboard-local/
├── components/            # 全局 Vue 组件 (如 JobDetailDrawer 详情抽屉)
├── docs/                  # 架构设计、部署指南、开发手册等详细文档
│   ├── API_DOCUMENTATION.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_DESIGN.md
│   ├── DEPLOYMENT.md      # 包含 Cloudflare Pages 部署踩坑总结
│   ├── DEVELOPER_GUIDE.md
│   ├── PRD.md
│   ├── UI_UX_GUIDELINES.md
│   └── USER_MANUAL.md
├── pages/                 # 页面路由
│   ├── ai/                # AI 简历与模型设置
│   ├── companies/         # 公司库与黑名单
│   ├── dashboard/         # 统计数据大屏
│   ├── jobs/              # 职位列表管理
│   ├── kanban/            # 看板视图
│   └── questions/         # 面试题库
├── prisma/                # Prisma ORM Schema 与数据库文件
│   └── schema.prisma
├── scripts/               # 数据清洗、SQL 转换与导出脚本
├── server/                # Nitro 后端 API 与工具
│   ├── api/               # API 路由 (jobs, companies, dashboard 等)
│   ├── db/                # Node 环境与 Edge 环境 Prisma 客户端适配器
│   └── utils/             # 平台数据清洗逻辑 (jobNormalizer)
├── nuxt.config.ts         # Nuxt 配置文件 (已配置 SPA 模式及 Edge 别名)
├── wrangler.toml          # Cloudflare 配置文件
└── package.json
```

---

## 📖 相关文档 (Documentation)

- 📘 [部署与踩坑指南 (DEPLOYMENT.md)](docs/DEPLOYMENT.md)
- 📐 [架构设计文档 (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- 💾 [数据库设计规范 (DATABASE_DESIGN.md)](docs/DATABASE_DESIGN.md)
- 🔌 [API 接口文档 (API_DOCUMENTATION.md)](docs/API_DOCUMENTATION.md)
- 📖 [开发者指南 (DEVELOPER_GUIDE.md)](docs/DEVELOPER_GUIDE.md)

---

## 📄 开源许可 (License)

[MIT](LICENSE)
