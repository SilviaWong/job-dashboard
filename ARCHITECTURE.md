# 系统架构设计文档 (Architecture Design Document)

## 1. 总体架构概览 (Overall Architecture Overview)

**Job Dashboard Local** 采用了基于 [Nuxt](https://nuxt.com/) 框架的全栈同构架构 (Full-Stack Isomorphic Architecture)。利用 Nuxt 内置的 Nitro 引擎提供轻量级的后端 API 服务，同时结合 Vue 3 与 Element Plus 提供现代化的前端交互。为了最大程度保障用户的求职数据隐私，系统选择了纯本地化 (Local-first) 运行的存储与部署架构。

整个系统自上而下分为四层：
1. **展现层 (Presentation Layer)**：负责 UI 渲染与用户交互 (Vue 3 + Element Plus)。
2. **业务逻辑层 (Business Logic Layer)**：提供核心业务接口，如数据过滤、AI 调度、状态机流转 (Nitro API)。
3. **数据清洗层 (Data Processing Layer)**：处理异构招聘平台数据的标准化转换 (Normalizer Adapter)。
4. **数据持久层 (Data Persistence Layer)**：负责数据的持久化安全存储 (Prisma + SQLite)。

---

## 2. 技术栈定义 (Technology Stack)

| 领域 | 技术/框架 | 说明 |
| :--- | :--- | :--- |
| **前端视图 (Frontend)** | Vue 3 (Composition API) | 核心前端框架，负责响应式视图。 |
| **前端组件 (UI Library)** | Element Plus | 提供丰富的表单、弹窗、看板等企业级组件。 |
| **元框架 (Meta Framework)** | Nuxt 4 | 提供基于文件系统的路由、SSR/CSR 渲染、以及内置后端环境。 |
| **后端引擎 (Backend Engine)**| Nitro Server | 运行于 Node.js 环境，提供高性能的 API 接口 (`/server/api`)。 |
| **数据持久化 (ORM)** | Prisma | 强类型的 TypeScript ORM，极大提升数据库操作的安全性与效率。 |
| **本地数据库 (Database)** | SQLite | 轻量级本地文件数据库，无需安装任何外部依赖即可存储海量记录。 |
| **开发语言 (Language)** | TypeScript | 全栈采用 TS，在前后端接口复用与类型推导上提供保障。 |
| **图标库 (Icons)** | Lucide Vue Next | 提供现代化、可自定义化的矢量图标。 |

---

## 3. 核心模块划分 (Module Breakdown)

系统按照高内聚、低耦合的原则划分目录结构与模块：

### 3.1 前端展现模块 (Frontend Modules)
*   **路由页面 (`/pages`)**
    *   `jobs/`: 职位列表主视图，负责多维度筛选与渲染展示。
    *   `kanban/`: 投递追踪看板，提供 Drag & Drop 的卡片流转交互。
    *   `companies/`: 企业全景与黄页管理视图。
    *   `questions/`: 面试题库沉淀模块。
    *   `ai/`: AI 模型配置、API Key 管理及个人简历物料库。
*   **UI 业务组件 (`/components`)**
    *   `JobDetailDrawer`: 核心组件！负责展示清洗后的职位详尽信息、AI 面板、面试复盘，是全系统最复杂的业务组件。

### 3.2 后端 API 模块 (`/server/api`)
*   **`jobs.get.ts / jobs.post.ts`**: 职位数据的 CRUD 入口，负责带条件查询、分页及数据安全（屏蔽被拉黑企业）。
*   **`jobs/[id]/status.put.ts`**: 看板状态流转专用接口，实现状态机的原子更新。
*   **`sync-all.post.ts`**: 外部扩展或爬虫推送 JSON 原始数据的入口，负责批量写入 SQLite `rawData`。
*   **`jobs/analyze.post.ts` (AI 路由)**: 负责组装 Prompt、调用远端大语言模型 (LLM)，并将生成的诊断报告写入 `AiJobResult`。

### 3.3 数据清洗与中间件层 (`/server/utils`)
*   **`jobNormalizer.ts`**: 核心**策略模式 (Strategy Pattern)** 模块。
    *   **痛点**：Boss直聘、51job、猎聘等平台的 JSON 层级与字段命名完全不同。
    *   **设计**：提供一个统一的 `NormalizedJobData` 接口协议。后端在查出数据后，通过判断 `job.platform` 路由给 `normalizeBossJob`、`normalizeLiepinJob` 等专属清洗器，将杂乱的 JSON 解构为标准化的英文强类型字段，最后由 API 吐出给前端。

---

## 4. 核心系统数据流向 (Core System Data Flows)

### 4.1 数据入库与清洗流 (Ingestion & Normalization Flow)
1. 外部插件调用 `/api/sync-all` 将抓取到的海量复杂 JSON 提交给系统。
2. Prisma 将这段原始 JSON 字符串无损直接存入 `Job.rawData` 中（保留原始现场）。
3. 前端请求 `/api/jobs`，后端从 SQLite 查询列表。
4. 后端循环调用 `jobNormalizer(job, parsedRawData)` 将 `rawData` 转化为标准格式。
5. 后端通过 ES6 解构 **剔除 `rawData` 字段**，只将极轻量的标准化数据返回给前端 `JobDetailDrawer.vue` 渲染，极大降低前端内存压力。

### 4.2 AI 智能诊断流 (AI Diagnosis Flow)
1. 前端点击“AI分析”，向 `/api/jobs/analyze` 发送 `jobId`。
2. 后端读取该职位的规范化 JD，并从 `AiSettings` 提取用户当前保存的个人简历。
3. 后端组装 `System Prompt`，将双方数据发送至外部 LLM 接口（如 OpenAI / 智谱）。
4. LLM 返回结构化 JSON 数据（包含：匹配得分 0-100、诊断文本、破冰招呼语）。
5. 后端将结果存入 `AiJobResult` 表，前端更新 UI。

---

## 5. 部署架构 (Deployment Architecture)

由于产品定位为高度保护隐私的“个人辅助工具”，本系统采用**免部署、开箱即用的纯本地化架构**。

![Deployment Architecture Diagram]
*可以想象如下架构拓扑：*
```mermaid
graph TD
    User([用户 Browser]) <-->|Localhost HTTP| Nuxt[Nuxt Node Server]
    
    subgraph Local Environment (PC/Mac)
        Nuxt --> API[Nitro API Endpoints]
        Nuxt --> UI[Vue SSR/CSR Engine]
        API <--> Normalizer[jobNormalizer]
        API <--> Prisma[Prisma Client ORM]
        Prisma <--> SQLite[(dev.db SQLite File)]
    end
    
    API <-.->|HTTPS API| LLM[外部大语言模型接口 (OpenAI 等)]
    Ext[外部浏览器爬虫插件] -->|HTTP POST| API
```

*   **物理隔离**：系统所有的请求交互均发生在 `localhost:3000`。
*   **零外部依赖数据库**：不需要在电脑上单独安装 MySQL 或 MongoDB 进程服务。Prisma 使用的 SQLite 是基于文件的存储，随项目代码库共存 (`prisma/dev.db`)。
*   **外部通信边界**：系统仅在用户主动触发“AI 分析”功能时，才会将特定岗位的 JD 与简历通过 HTTPS 发送至配置的大模型接口。其余时间（浏览、标记、拉黑、拖拽）绝对无外部网络交互。
