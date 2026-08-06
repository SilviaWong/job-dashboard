# Job Dashboard Local (本地求职看板系统)

Job Dashboard Local 是一个基于 **Nuxt** 和 **Vue 3** 构建的个人本地求职管理与看板系统。它可以将来自多个招聘平台（如 Boss 直聘、51job、智联招聘、猎聘）的数据进行统一的聚合、清洗、分析和展示。旨在帮助求职者更高效地管理投递记录、进行岗位筛选以及通过 AI 辅助进行岗位匹配度诊断。

## ✨ 核心特性 (Features)

*   **🏢 多平台数据统一化**
    *   内置策略模式的数据清洗适配器 (`jobNormalizer`)，自动将不同平台繁杂的 JSON 结构清洗为标准化的统一格式，保证前端展示的准确与美观。
    *   目前支持：`Boss直聘`、`前程无忧(51job)`、`智联招聘`、`猎聘`。
*   **📊 现代化看板与列表视图**
    *   提供美观、直观的职位列表。
    *   提供包含全方位信息（如：公司规模、福利标签、融资阶段、HR 活跃状态等）的侧边详情抽屉。
*   **🤖 AI 智能辅助**
    *   **AI 匹配度诊断**：一键对目标岗位与自身简历进行 AI 匹配度评分，提供详细的优劣势分析。
    *   **AI 打招呼语生成**：利用 AI 针对特定岗位自动生成专业的打招呼与自我介绍文案，提升回复率。
*   **🎯 高效筛选与管理**
    *   支持通过平台、学历、关键字等多维度过滤岗位。
    *   职位操作：一键收藏 (⭐)、标记失效 (⛔)、标记不合适 (👎) 并记录具体原因（如：外包、薪资低、太远等）。
    *   **黑名单机制**：可将特定公司加入黑名单，自动隐藏其相关的所有招聘信息。
*   **🔒 数据本地化与隐私安全**
    *   使用本地 SQLite 数据库存储所有数据，不上传云端，保证求职数据与个人隐私的绝对安全。

## 🛠 技术栈 (Tech Stack)

*   **框架**: [Nuxt](https://nuxt.com/) (Vue 3, SSR/CSR)
*   **UI 组件库**: [Element Plus](https://element-plus.org/)
*   **图标库**: [Lucide Vue Next](https://lucide.dev/)
*   **ORM / 数据库**: [Prisma](https://www.prisma.io/) + SQLite
*   **后端 API**: 采用 Nuxt 内置的 Nitro 引擎 (`/server/api`)

## 🚀 快速开始 (Getting Started)

### 1. 环境要求
*   Node.js (建议 v18+)
*   npm / yarn / pnpm

### 2. 安装依赖
```bash
npm install
```

### 3. 数据库初始化
项目使用本地 SQLite 数据库，位于 `prisma/dev.db`。你需要先同步数据库 Schema：
```bash
npx prisma db push
# 或使用 npx prisma migrate dev
```

### 4. 启动开发服务器
```bash
npm run dev
```
启动后，浏览器访问 `http://localhost:3000` 即可查看您的本地求职看板。

## 📁 核心目录结构 (Project Structure)

```text
job-dashboard-local/
├── components/          # Vue 组件 (如: JobDetailDrawer.vue 详情抽屉)
├── pages/               # Nuxt 路由页面 (如: jobs/index.vue 职位列表页)
├── prisma/              # Prisma schema 与 SQLite 数据库文件
│   └── schema.prisma    # 数据库模型定义 (Job, Company, Interview, AI 记录等)
├── server/              # 后端服务
│   ├── api/             # Nitro API 接口 (处理数据请求、过滤查询等)
│   └── utils/           # 后端工具函数 (如: jobNormalizer.ts 数据清洗适配器)
├── nuxt.config.ts       # Nuxt 全局配置文件
└── package.json         # 项目依赖
```

## 📝 数据库设计简述

*   **Job**: 核心职位表。保存职位的核心信息，同时通过 `rawData` 字段保存抓取的原始数据。在 API 吐出给前端时会自动通过 `jobNormalizer` 解析并剥离庞大的 `rawData`。
*   **Company & BlacklistedCompany**: 公司信息表及黑名单库，用于记录公司详情和规避不良企业。
*   **Interview**: 强绑定于职位的面试记录（支持面试时间、轮次、形式、复盘内容等）。
*   **AiJobResult**: 脱离职位强绑定的独立 AI 分析结果记录。

## 🤝 贡献与自定义

*   **添加新平台**: 
    1. 在 `server/utils/jobNormalizer.ts` 中新增类似 `normalizeXXXJob` 的适配器函数。
    2. 将新适配器注册到主函数 `normalizeJobData` 的 switch 路由中。
    3. 前端筛选下拉框中加入对应平台选项即可。
