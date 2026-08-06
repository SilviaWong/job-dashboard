# UI/UX 设计规范 (UI/UX Guidelines)

本规范定义了 **Job Dashboard Local** 的整体视觉风格、界面布局标准及交互原则。系统大量依赖 [Element Plus](https://element-plus.org/) 组件库，在此基础上进行了求职业务场景的针对性深度优化，并融入了类似 macOS 风格的视觉表现。

---

## 1. 视觉资产规范 (Visual Assets)

### 1.1 色彩规范 (Color Palette)
系统采用现代化、克制且清晰的色彩体系，以减少求职者浏览海量信息时的视觉疲劳。

*   **主品牌色 (Primary)**
    *   `#007AFF` (macOS 经典蓝 / Element 变体) - 用于主要的按钮操作、侧边栏激活状态 (`.is-active`)、核心链接 (`.company-link`)。
*   **功能语义色 (Semantic Colors)**
    *   **成功 (Success)**: `#67C23A` 或 `#15803d` / 背景 `#dcfce3` - 用于 AI 匹配度高分 (>=80分)、状态更新成功、收到 Offer 面试按钮 (`#27ae60`)。
    *   **警告 (Warning)**: `#E6A23C` 或 `#c2410c` / 背景 `#ffedd5` - 用于匹配度一般 (60-79分)、外包/猎头岗位警示标签。
    *   **危险 (Danger)**: `#FF3B30` 或 `#b91c1c` / 背景 `#fee2e2` - 用于不匹配 (<60分)、投递被拒、拉黑公司边缘、废弃按钮 (`#e74c3c`)。
    *   **信息 (Info)**: `#86868B` - 用于次要文本、辅助信息提示 (如 `meta-item`、`.input-label`)。
*   **特定操作色板 (Custom Actions)**
    *   AI 诊断专属紫色: `#9b59b6`
    *   收藏/标星亮黄: `#f1c40f` (未收藏) / `#f39c12` (已收藏)
    *   黑名单拉黑灰色: `#95a5a6`
*   **中性色板 (Neutrals)**
    *   标题与核心文字: `#1D1D1F` 或 `#303133`
    *   正文文字: `#475569` 或 `#606266`
    *   边框色: `rgba(0, 0, 0, 0.04)` 或 `#e2e8f0`
    *   背景色: `#F5F5F7` (全局背景/配置容器) / `#FFFFFF` (卡片与主面板)

### 1.2 字体排版 (Typography)
*   **全局字体族**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Inter", sans-serif`
*   **字号层级**:
    *   H1 / 大标题: `24px` (如 Drawer 内职位标题，字重 600)
    *   H2 / 模块标题: `16px` 至 `18px` (带 Lucide 图标的板块标题，字重 600)
    *   H3 / 卡片标题: `17px` (职位名与薪资凸显，字重 700)
    *   正文: `14px` 至 `15px` (职位描述长文本、常规列表文字，行高 1.6-1.8)
    *   辅助文本: `12px` (普通标签文字 `.tag-item`、首发/更新日期)

### 1.3 阴影与圆角 (Shadows & Radii)
*   **圆角 (Border Radius)**:
    *   卡片与面板: `20px` (大卡片 `.job-card-wide`) 或 `12px` (`.mac-container` 内面板)。
    *   标签与小按钮: `6px` (`.tag-item`) 至 `8px` (`.btn-primary`)。
    *   全圆角胶囊按钮: `20px` (详情与操作按钮)。
*   **阴影 (Box Shadows)**:
    *   默认卡片悬浮效果: `0 4px 24px rgba(0,0,0,0.04)`。
    *   Hover 态卡片阴影: `0 12px 40px rgba(0,0,0,0.08)`，增强立体纵深感。

### 1.4 图标规范 (Iconography)
统一使用 **Lucide Vue Next**，以其简洁现代的线性风格贯穿全站：
*   **侧边栏与信息流**: 广泛使用 `Briefcase`, `Building`, `MapPin`, `Bot`, `FileText` 等图标。
*   **对齐**: 图标与文字混排时，图标必须通过 flex 布局 (`align-items: center` + `gap`) 保证绝对对齐。

---

## 2. 核心页面布局规范 (Layout Patterns)

### 2.1 全局框架 (`layouts/default.vue`)
*   **侧边导航栏 (`.sidebar`)**: 宽度 `240px`，具备毛玻璃特效 (`backdrop-filter: blur(20px)`)，选中项 (`.is-active`) 带有明显的高亮背景块与加粗字体。
*   **顶栏与内容区**: 顶栏用于显示版本及轻量面包屑；内容区拥有 `36px` 的宽松内边距。

### 2.2 列表视图 (List View) (`pages/jobs/index.vue`)
*   **垂直堆叠卡片 (Vertical List)**: 采用宽度自适应的卡片流式布局 `.job-card-wide`，非传统 Table。
*   **卡片信息层级**:
    1.  **头部**: 职位名 (加粗居左)、薪水 (红色加粗)，右侧绝对定位展示圆形 AI 评分徽标 (Score Badge)。
    2.  **公司行**: 蓝色的超链接样式 (`.company-link`)，引导可点击查看更多。
    3.  **灵活标签栏 (`.job-tags`)**: 包含自定义 `.tag-item` (轻量灰底黑字) 与针对“猎头”、“拉黑隐藏”的特殊颜色高亮标签。
    4.  **虚线分割线**: `.dashed-divider` 分隔内容区与操作区。
    5.  **胶囊操作栏 (`.job-footer`)**: 固定放置两组高频操作 (左侧：收藏、不合适、拉黑；右侧：AI诊断、详情)。

### 2.3 职位详情抽屉 (Job Detail Drawer)
*作为本系统最重要的聚合容器：*
*   **弹出方式**: 统一从屏幕右侧滑出，占据屏幕较大宽度 (`75%`)。
*   **分割布局 (`.drawer-split-layout`)**: 内部不是单一长列表，而是采用 Flex 分栏。
    *   **左侧 (Flex 3)**: 展示原始职位客观详情。包括 H1 标题、薪资、公司/地址 Sub-header、大区块标签 (`.badge-tag`)、九宫格形式的岗位概览 (`.stats-grid`)、格式化清洗后的 JD 文本 (`.job-desc` 带背景色)。
    *   **右侧 (Flex 2, `.ai-panel`)**: 专门留给 AI。上方是显眼的半圆形环形进度条 (`el-progress type="dashboard"`) 展示匹配度；下方是由 HTML 渲染的 AI 分析长文 (`.ai-analysis-content`)，并搭配一键生成打招呼语的独立操作区。

### 2.4 看板视图 (Kanban Board) (`pages/kanban/index.vue`)
*   **横向滚动**: 板块整体采用 Flex `gap: 20px` 布局，支持横向滚动。
*   **泳道卡片 (`.kanban-column`)**: `#f4f4f5` 浅灰背景底色。列头附有徽标数字 (Count)。
*   **占位符 (`.empty-column`)**: 当泳道无内容时，显示带有虚线边框 (`2px dashed #dcdfe6`) 的文字提示区。

### 2.5 偏好设置及管理页 (macOS Container)
*   **页面容器**: 在 `ai/model.vue` 和 `ai/resume.vue` 中，使用 `.mac-container` (白色或 `#F5F5F7` 背景，整体圆角 `12px`，外加柔和阴影)。
*   **双栏设置页**: 模型设置等页面左侧是紧凑的列表页 (`width: 250px`)，右侧是表单内容区，输入框 `.api-input` 为大圆角 (`10px`) 配合柔和的聚焦外发光边框 (`box-shadow: 0 0 0 3px rgba(...)`)。

---

## 3. 交互体验规范 (Interaction Principles)

### 3.1 乐观更新 (Optimistic UI)
*   **状态立即变迁**: 拖拽看板或标记“不合适”时，前端数据立刻响应并重新渲染（如卡片立即换列，立即隐藏并淡出），然后后台异步发送 PUT 请求。
*   **异常回滚**: 若网络或数据库抛错，触发 `ElMessage.error` 提示，并将被改动的 Job 状态瞬间恢复为修改前。

### 3.2 卡片动效与拖拽 (Hover & Drag)
*   **悬浮反馈**: `.job-card-wide` 和 `.btn-primary` 等元素在 hover 时均附带 Y 轴位移上浮 (`transform: translateY(-4px)` 或 `-1px`) 以及阴影加深 (`box-shadow`) 的动画效果。
*   **抓取反馈 (Grabbing)**: 看板中的任务卡默认 `cursor: grab`，按住时变为 `cursor: grabbing`，明确告知可拖拽语义。

### 3.3 复杂动作弹窗设计 (Modals & Loading)
*   **弹窗多选**: 对于“标为不合适”操作，唤起自定义 Dialog，支持一键点选多种预设原因（基于 `el-tag` 交互），同时也支持手动输入，增强结构化数据的清洗质量。
*   **加载占位**: 页面底部加载更多 (Infinite Scroll) 或按钮长时间提交时，务必伴随旋转 Loader (如 `lucide` 的 `Loader2` 加 `is-loading` 动画) 以及文本提示 (`loading="..."`)，避免用户的无效点击。

### 3.4 防误触与边界处理
*   **自动交集观察者 (Intersection Observer)**: 对于长列表滚动，使用原生的 `IntersectionObserver` 替代简单的 Scroll 事件进行触底检测 (`rootMargin: '250px'`)，提前缓冲加载下一页，提升流畅度。
*   **不可逆操作拦截**: 诸如删除配置、拉黑公司等破坏性操作，强制使用 `ElMessageBox.confirm` 拦截，阻断用户的无意识点击。
