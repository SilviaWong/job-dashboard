# 功能实现说明文档 (Developer Implementation Guide)

本文档旨在为全栈开发人员提供 **Job Dashboard Local** 系统从前端交互到后端数据流转的详细技术剖析。通过阅读本文档，您可以清晰地了解核心模块的数据获取、转换清洗以及落地流程。

---

## 1. 核心技术栈与架构概述

- **前端层 (Frontend)**: 基于 Vue 3 + Nuxt 3 构建。页面使用 `Element Plus` 搭配纯手写 CSS（macOS 风格）完成 UI 渲染，大量运用了 Vue 3 的 Composition API (`setup`) 与自定义组件化（如 `JobDetailDrawer.vue`）。
- **服务端接口层 (API Layer)**: 使用 Nuxt 3 内置的 Nitro 引擎提供 RESTful API (`server/api/**/*.ts`)。
- **数据持久层 (Database)**: 采用 Prisma ORM 操作本地 SQLite 数据库 (`prisma/dev.db`)。
- **数据清洗层 (Data Normalization)**: 后端提供基于策略模式的 `jobNormalizer.ts`，用于统一各个招聘平台抓取返回的异构 JSON 数据。

---

## 2. 数据模型层 (Prisma Schema)

数据库核心模型以解耦为设计原则，以防止单表过于臃肿：
- **`Job`**: 核心主表。存储 `jobId`, `title`, `companyName`, `platform`, `status` 以及标记状态 (`isFavorited`, `isHidden`)。原始的抓取数据以 JSON 字符串形式持久化在 `rawData` 字段中。
- **`Interview`**: 与 `Job` 存在强物理外键绑定 (`onDelete: Cascade`)，记录面试相关的跟进和复盘。
- **`AiJobResult`**: 记录大模型的评分与匹配分析，通过 `jobId` 与 `Job` 产生逻辑关联，但**未设立物理外键约束**，保障即使职位表被清空也能保留 AI 记录或单独重置。
- **`Company`**: 独立的公司缓存表，以 `companyName` 为主键，保存抓取到的工商信息等原始数据。
- **`BlacklistedCompany`**: 存储被拉黑的公司名 (`companyName`)，用于在查询时做前置剔除。
- **`AiSettings`**: 全局唯一的 AI 偏好配置表（通过 `id="default"` 单例控制），保存模型 API 配置集合与个人简历内容。
- **`QuestionBank`**: 面试题库管理表，记录八股文、面试问题及其分类、标签与答案。

---

## 3. 全栈核心数据流转解析

下面以系统最核心的**职位列表展示 (Jobs List)** 为例，剖析完整的数据流向。

### 3.1 步骤 1：前端发起请求 (Frontend Request)
在 `/pages/jobs/index.vue` 中，当页面挂载 (`onMounted`) 或触发搜索、过滤操作时，通过 `$fetch` 向后端请求数据：
```javascript
const res = await $fetch('/api/jobs', {
  params: {
    page: page.value,
    pageSize: pageSize.value,
    platform: selectedPlatform.value,
    status: selectedStatus.value,
    filterFavoritesOnly: showFavoritesOnly.value,
    filterShowHidden: showHidden.value,
    filterShowBlacklisted: showBlacklisted.value,
    keyword: searchQuery.value
  }
})
```

### 3.2 步骤 2：服务端接收与条件拼装 (Backend Query Builder)
请求流转至 `server/api/jobs.get.ts`。服务端根据入参动态构建 Prisma 的 `whereClause`。

**关键处理逻辑：黑名单静默过滤**
除非前端显式要求查看黑名单 (`filterShowBlacklisted=true`)，否则服务端会前置查询 `BlacklistedCompany` 表：
```typescript
const blacklisted = await prisma.blacklistedCompany.findMany({ select: { companyName: true } });
const blacklistedNames = blacklisted.map(b => b.companyName);
if (blacklistedNames.length > 0) {
  whereClause.companyName = { notIn: blacklistedNames };
}
```

### 3.3 步骤 3：数据聚合查询 (Data Aggregation)
1. **分页获取主表数据**:
   ```typescript
   const jobs = await prisma.job.findMany({
     where: whereClause,
     orderBy: { updatedAt: 'desc' },
     skip: (page - 1) * pageSize,
     take: pageSize
   });
   ```
2. **提取 `jobId` 集合并批量获取 AI 结果**:
   为了避免 `N+1` 查询问题，服务端提取当前页所有职位的 ID，发起一次性 `IN` 查询获取 `AiJobResult`。
   ```typescript
   const jobIds = jobs.map(j => j.jobId);
   const aiResults = await prisma.aiJobResult.findMany({ where: { jobId: { in: jobIds } } });
   const aiResultMap = Object.fromEntries(aiResults.map(a => [a.jobId, a]));
   ```

### 3.4 步骤 4：策略模式数据清洗 (Data Normalization)
各家招聘平台（Boss、51job、智联等）抓取下来的 `rawData` 嵌套层级和字段命名天差地别。在接口返回给前端前，服务端调用 `server/utils/jobNormalizer.ts`。

`jobNormalizer.ts` 采用了**工厂/策略模式**，暴露 `normalizeJobData` 主函数：
```typescript
export function normalizeJobData(job: any, raw: any): NormalizedJobData {
  switch (job.platform) {
    case 'Boss直聘': return normalizeBossJob(job, raw);
    case '51job': return normalize51Job(job, raw);
    case '智联': return normalizeZhilianJob(job, raw);
    case '猎聘': return normalizeLiepinJob(job, raw);
    default: return normalizeFallbackJob(job, raw);
  }
}
```
**以 Boss直聘 适配器 (`normalizeBossJob`) 为例**，由于不同抓取工具或浏览器插件返回的原始 JSON 结构可能截然不同，它采用了极强的**防御性提取与多级降级**策略：

1. **节点多层降级提取 (Fallback Extraction)**:
   不同来源的数据，字段位置可能不同。代码通过 `||` 逻辑进行链式降级提取：
   ```typescript
   // 提取公司名：优先取爬虫格式的“公司全称”，其次取官方接口的 brandName，最后用本地表的兜底
   brandName: boss_single['公司全称'] || comp.brandName || raw?.brandName || job.companyName || '未知',
   // 提取 URL
   jobUrl: boss_single['职位链接'] || boss_single['干净链接'] || (job.jobId ? `https://www.zhipin.com/job_detail/${job.jobId}.html` : '')
   ```

2. **复杂对象的清洗适配 (Array & String Parsing)**:
   像“公司福利”或“技能标签”，有些来源返回的是逗号分隔的字符串 `"五险一金,带薪年假"`，有些来源返回的是对象数组 `[{name: '五险一金'}, {name: '带薪年假'}]`。
   这里使用了统一的 `extractTags` 辅助方法：
   ```typescript
   // 内部通过 Array.isArray 判断，若为数组则 map 提取 text/name/label 属性；若是字符串则 split(',')
   welfareList: extractTags(boss_single['公司福利'] || raw?.welfareList),
   skills: extractTags(boss_single['技能标签'] || info.showSkills || raw?.skills),
   ```

3. **业务语义的布尔转换 (Semantic Boolean Flags)**:
   对于前端需要重点关注的特征（如是否外包/猎头），后端会通过多重特征联合判定，并使用 `!!` 强制转化为 Boolean：
   ```typescript
   // 只要官方接口 proxyType === 1，或在企业类型文本中带有'外包'二字，即判定为猎头/外包岗位
   isHeadhunter: !!(info.proxyType === 1 || info.proxyJob === 1 || boss_single['企业类型']?.includes('外包') || boss_single['岗位类型_外包猎头']?.includes('猎头'))
   ```

最终，经过重重清洗且结构百分百确定的 `NormalizedJobData` 将作为 `normalizedData` 属性挂载到 Job 对象上，连同 `aiResult` 和解析过的 `tags` 一并返回给前端。

### 3.5 步骤 5：前端渲染与交互 (Frontend Render)
前端拿到具有统一标准结构的 `NormalizedJobData` 数组，通过 `v-for` 循环渲染 `<div class="job-card-wide">`。
- 因为所有平台的福利字段均被统一抹平至 `job.normalizedData.welfareList`，前端可以直接遍历渲染 Tag 组件，无需再做 `if (platform === 'Boss')` 类的恶心逻辑判断。
- **状态流转交互**：当用户在看板拖拽卡片时，前端捕获 `drop` 事件，立即乐观更新本地卡片位置，并后台静默调用 `PUT /api/jobs/[id]/status`，将诸如 `status: "一面"` 写入数据库。

---

## 4. 扩展开发指南 (How to Extend)

### 4.1 如何新增一种平台的清洗支持？
1. 打开 `server/utils/jobNormalizer.ts`。
2. 新增一个专用解析函数，例如 `normalizeNewPlatformJob(job, raw)`，使其返回值符合 `NormalizedJobData` 接口约束。
3. 在底部的 `switch (job.platform)` 分支中增加 `case '新平台': return normalizeNewPlatformJob;`。

### 4.2 如何调整 AI 大模型逻辑？
1. 大模型对话交互核心逻辑位于 `server/api/jobs/analyze.post.ts`。
2. 该接口会先从本地 SQLite 获取 `AiSettings` 的 `activeProfileId` 以及 Prompt 和简历模板。
3. 结合职位的 `normalizedData.jobDesc`，通过 `@google/genai` 或其他兼容 SDK 发起调用。
4. 返回后的文本会按照结构化截取，最后执行 `prisma.aiJobResult.upsert` 持久化入库。
