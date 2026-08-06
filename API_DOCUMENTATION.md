# 接口文档 (API Documentation)

本系统后端基于 Nuxt 4 的 **Nitro 引擎** 提供 RESTful API 接口。所有接口均采用 `/api/*` 路由。为了节省网络开销与提升前端渲染效率，所有列表接口默认已剔除了冗余的抓取原始数据 (`rawData`)。

---

## 1. 全局响应规范 (Global Response Format)

系统所有 API 接口均遵循以下基础 JSON 响应结构：

```json
{
  "success": true,
  "data": { ... } // 具体业务数据 (对象或数组)
}
```

或 (失败时)：

```json
{
  "success": false,
  "message": "错误提示信息",
  "error": "具体的异常栈或补充信息 (仅在开发环境或必要时返回)"
}
```

---

## 2. 职位大厅管理 (Jobs)

### 2.1 获取职位列表

* **Method**: `GET`
* **Endpoint**: `/api/jobs`
* **Description**: 获取并过滤职位数据，支持分页。后端会自动过滤掉黑名单中的公司，并通过策略模式清洗数据结构。
* **Query Parameters**:
  * `page` (Number, 选填): 当前页码，默认 `1`
  * `pageSize` (Number, 选填): 每页数量，默认 `20`
  * `platform` (String, 选填): 按招聘平台筛选 (如: `Boss直聘`)
  * `status` (String, 选填): 看板状态筛选 (如: `normal`, `to-apply`, `all` 表示不过滤)
  * `keyword` (String, 选填): 模糊匹配职位名称或公司名称
* **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "jobId": "65b2f13f...",
        "title": "前端开发工程师",
        "companyName": "某某科技",
        "salary": "15-30K",
        "location": "北京",
        "platform": "Boss直聘",
        "status": "normal",
        "isFavorited": false,
        "isHidden": false,
        "tags": null,
        "createdAt": "2026-08-01T12:00:00.000Z",
        "updatedAt": "2026-08-01T12:00:00.000Z",
        "normalizedData": {
          "jobUrl": "https://www.zhipin.com/job_detail/...",
          "publishDate": "2026-08-01",
          "updateDate": "2026-08-01",
          "spiderDate": "2026-08-02",
          "companyIndustry": "计算机软件",
          "companyStage": "C轮",
          "companyScale": "500-999人",
          "brandName": "某某科技有限公司",
          "hrName": "张三",
          "hrPosition": "HRBP",
          "welfareList": ["五险一金", "双休", "定期体检"],
          "skills": ["Vue3", "TypeScript", "Node.js"],
          "jobDesc": "1. 负责公司核心业务系统的开发...\n2. 参与架构设计...",
          "experience": "3-5年",
          "degree": "本科",
          "address": "北京市朝阳区某某大厦10层",
          "isHeadhunter": false
        }
      }
    ],
    "meta": {
      "total": 150,
      "page": 1,
      "pageSize": 20
    }
  }
  ```

### 2.2 更新职位属性 (收藏/废弃)

* **Method**: `PUT`
* **Endpoint**: `/api/jobs/:id`
* **Body Parameters**:
  * `isFavorited` (Boolean, 选填): 标星收藏
  * `isHidden` (Boolean, 选填): 废弃隐藏
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "jobId": "65b2f13f...",
      "title": "前端开发工程师",
      "companyName": "某某科技",
      "salary": "15-30K",
      "location": "北京",
      "platform": "Boss直聘",
      "status": "normal",
      "isFavorited": true,
      "isHidden": false,
      "tags": null,
      "createdAt": "2026-08-01T12:00:00.000Z",
      "updatedAt": "2026-08-02T14:00:00.000Z"
    }
  }
  ```

### 2.3 更新职位流转状态 (Kanban Drag & Drop)

* **Method**: `PUT`
* **Endpoint**: `/api/jobs/:id/status`
* **Description**: 专门用于 Kanban 面板拖拽时的原子状态更新。
* **Body Parameters**:
  * `status` (String, 必填): 目标泳道状态 (如 `to-apply`, `applied`, `interview-1`, `offer`)
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "jobId": "65b2f13f...",
      "status": "applied",
      "updatedAt": "2026-08-02T14:30:00.000Z"
    }
  }
  ```

---

## 3. 智能诊断 (AI Diagnosis)

### 3.1 触发 AI 岗位匹配诊断

* **Method**: `POST`
* **Endpoint**: `/api/jobs/analyze`
* **Description**: 根据数据库中的岗位 JD 和系统设置里的个人简历，调用远程 LLM，生成诊断报告。
* **Body Parameters**:
  * `jobId` (String, 必填): 需要分析的职位 ID
* **Response**:
  ```json
  {
    "success": true,
    "data": {
      "jobId": "65b2f13f...",
      "score": 85,
      "matchLevel": "A",
      "resultText": "【优势】前端技术栈完全匹配...\n【劣势】缺乏大厂背书...",
      "intro": "您好，我是一名前端开发，有着3年Vue开发经验...",
      "createdAt": "2026-08-02T14:00:00.000Z",
      "updatedAt": "2026-08-02T14:00:00.000Z"
    }
  }
  ```

---

## 4. 扩展数据导入 (Data Ingestion)

### 4.1 全量扩展程序数据推送 (Data Ingestion)

* **Method**: `POST`
* **Endpoint**: `/api/sync-all`
* **Description**: 该接口是整个 Dashboard 的数据汇聚核心。专门供浏览器扩展程序 (Chrome Extension) 或数据采集脚本调用，将本地浏览器 LocalStorage 中的抓取数据以及用户标记状态进行全量推送同步。接口内部采用了 `upsert` (更新或插入) 逻辑，确保多次同步的数据幂等性，不会产生重复脏数据。

* **Body Parameters (大 JSON 载荷)**:
  * `blacklisted_companies` (Array): 黑名单公司名称数组。系统会将它们 upsert 入 `BlacklistedCompany` 表。
  * `favorited_jobs` (Array): 被收藏的 Job ID 数组。
  * `job_statuses` (Object): 职位的看版状态，格式为 `{ [jobId]: "status_name" }`。
  * `job_interviews` (Object): 关联的面试记录，如时间、轮次、面试笔记。
  * `user_job_tags` (Object): 用户自定义的职位标签和隐藏状态。
  * `ai_job_scores` / `ai_job_intros` (Object): AI 分析缓存，upsert 进 `AiJobResult` 表。
  * `boss_scraped_v2`, `51job_scraped_v2`, `liepin_scraped_data_v1`, `zhilian_scraped_data_v1/2` (Array): 各平台的职位原始列表。
  * `boss_single_details` (Array): Boss直聘的职位详情。系统在同步 Boss 职位时，会自动在后端用 `detailMap` 将列表项与其详情深度合并，形成完整的 `rawData` 保存。
  * `boss_companies_scraped`, `51job_companies_scraped` 等 (Array/Object): 企业库原始详情，upsert 入 `Company` 表。

* **处理流程**:
  1. 依次处理黑名单公司与题库的同步。
  2. 合并企业库详情，按公司名为 Key 进行存储。
  3. 分平台解析职位核心字段 (如标题、公司、薪资、地点) 作为外层查询条件，将完整的嵌套 JSON stringify 后作为 `rawData` 进行 `Job.upsert`。
  4. 同步 AI 诊断结果。
  5. 循环 `favorited_jobs`、`job_statuses` 等附加状态池，对刚入库的 Job 进行状态及面试记录更新。

* **Response**: 
  ```json
  {
    "success": true,
    "message": "全量配置同步完成",
    "results": {
      "blacklisted": 3,
      "questions": 0,
      "aiSettingsUpdated": false,
      "jobUpdates": 150,
      "interviews": 2,
      "companies": 85,
      "aiResults": 10
    }
  }
  ```

---

## 5. 企业全景数据 (Companies)

### 5.1 获取公司库全景数据

* **Method**: `GET`
* **Endpoint**: `/api/companies`
* **Description**: 获取以公司为维度的聚合数据，将旗下的所有岗位合并展示，支持分页。前端“企业全景”页面主要依赖此接口。
* **Query Parameters**:
  * `page` (Number, 选填): 当前页码，默认 `1`
  * `pageSize` (Number, 选填): 每页数量，默认 `20`
  * `query` (String, 选填): 模糊匹配公司名称
* **Response**:
  ```json
  {
    "success": true,
    "total": 128,
    "data": [
      {
        "companyName": "某某科技",
        "rawData": {
          "industry": "互联网",
          "scale": "100-499人",
          "stage": "A轮",
          "companyDesc": "公司简介...",
          "welfare": ["五险一金", "年底双薪"]
        },
        "jobs": [
          {
            "jobId": "65b2f1...",
            "title": "前端开发工程师",
            "salary": "15-30K",
            "location": "北京",
            "platform": "Boss直聘",
            "tags": ["Vue3", "TypeScript"],
            "experience": "3-5年",
            "degree": "本科",
            "updatedAt": "2026-08-01T12:00:00.000Z",
            "status": "normal",
            "normalizedData": {
              "isHeadhunter": false
              // ... 其他标准化清洗字段
            }
          }
        ],
        "platformSources": ["Boss直聘", "猎聘"]
      }
    ]
  }
  ```

---

## 6. 面试题库 (Question Bank)

### 6.1 获取题库列表

* **Method**: `GET`
* **Endpoint**: `/api/questions`
* **Description**: 查询题库列表数据。
* **Response**: 
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid-1234",
        "serialNo": 1,
        "title": "Vue3 响应式原理",
        "themeCategory": "前端",
        "subCategory": "Vue",
        "tags": "[\"Proxy\", \"Reactivity\"]",
        "answer": "Vue3 使用 Proxy 代理对象...",
        "createdAt": "2026-08-01T...",
        "updatedAt": "2026-08-01T..."
      }
    ]
  }
  ```

### 6.2 新增题目

* **Method**: `POST`
* **Endpoint**: `/api/questions`
* **Description**: 新增一条面试题。
* **Body Parameters**:
  * `title` (String, 必填): 题目名称
  * `answer` (String, 必填): 题目答案
  * `themeCategory` (String, 必填): 主题分类
  * (其他相关字段)
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid-1234",
      "serialNo": 1,
      "title": "Vue3 响应式原理",
      "themeCategory": "前端",
      "subCategory": "Vue",
      "tags": "[\"Proxy\", \"Reactivity\"]",
      "answer": "Vue3 使用 Proxy 代理对象...",
      "createdAt": "2026-08-01T...",
      "updatedAt": "2026-08-01T..."
    }
  }
  ```

### 6.3 更新题目

* **Method**: `PUT`
* **Endpoint**: `/api/questions/:id`
* **Description**: 更新指定 ID 的题目信息。
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid-1234",
      "serialNo": 1,
      "title": "Vue3 响应式原理",
      "themeCategory": "前端",
      "subCategory": "Vue",
      "tags": "[\"Proxy\", \"Reactivity\"]",
      "answer": "Vue3 使用 Proxy 代理对象（更新后的内容）...",
      "createdAt": "2026-08-01T...",
      "updatedAt": "2026-08-02T..."
    }
  }
  ```

### 6.4 删除题目

* **Method**: `DELETE`
* **Endpoint**: `/api/questions/:id`
* **Description**: 删除指定 ID 的题目。
* **Response**: 
  ```json
  {
    "success": true,
    "message": "删除成功"
  }
  ```

---

## 7. AI 偏好设置 (AI Settings)

### 7.1 获取全局 AI 配置与简历

* **Method**: `GET`
* **Endpoint**: `/api/settings/ai`
* **Description**: 获取当前的 AI 模型配置信息以及个人简历内容。
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "default",
      "activeProfileId": "openai-gpt-4o",
      "profiles": "[{\"id\":\"openai-gpt-4o\",\"name\":\"OpenAI GPT-4o\",\"apiKey\":\"sk-...\",\"baseUrl\":\"https://api.openai.com/v1\"}]",
      "resume": "## 个人简历\n张三，前端工程师，3年经验...",
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-02T12:00:00.000Z"
    }
  }
  ```

### 7.2 更新全局 AI 配置与简历

* **Method**: `POST`
* **Endpoint**: `/api/settings/ai`
* **Description**: 更新全局 AI 配置信息或个人简历内容。
* **Body Parameters**:
  * `activeProfileId` (String, 选填): 当前启用的模型配置 ID
  * `profiles` (String, 选填): JSON 字符串格式的模型配置列表
  * `resume` (String, 选填): 个人简历内容
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "id": "default",
      "activeProfileId": "openai-gpt-4o",
      "profiles": "[{\"id\":\"openai-gpt-4o\",\"name\":\"OpenAI GPT-4o\",\"apiKey\":\"sk-...\",\"baseUrl\":\"https://api.openai.com/v1\"}]",
      "resume": "## 个人简历\n张三，前端工程师，3年经验...",
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-03T12:00:00.000Z"
    }
  }
  ```

### 7.3 连通性测试

* **Method**: `POST`
* **Endpoint**: `/api/settings/ai-test`
* **Description**: 测试当前选中的模型 API 密钥及 baseUrl 等配置是否有效，返回 LLM 的心跳确认消息。
* **Response**: 
  ```json
  {
    "success": true,
    "data": {
      "message": "AI 连接成功！模型响应: Hello!"
    }
  }
  ```
