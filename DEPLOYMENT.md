# Job Dashboard 部署指南

本文档详细说明了如何将本项目 (基于 Nuxt 3 + Prisma + Vue 3) 部署到 Cloudflare Pages，并连接 Cloudflare D1 数据库。

由于 Cloudflare Workers/Pages 是 Edge 边缘运行环境，不包含完整的 Node.js API（如 `fs`、`__dirname` 等），所以在整合 Prisma 时需要进行特殊的配置。

## 1. 核心依赖要求

- `nuxt`: ^3.0.0 (本项目使用的是 Nuxt 4 兼容模式)
- `@prisma/client`: 必须与 `@prisma/adapter-d1` 版本**严格一致**（目前锁定在 `5.22.0`）
- `@prisma/adapter-d1`: Cloudflare D1 的官方 Prisma 适配器

## 2. Prisma 配置 (schema.prisma)

为了让 Prisma 能够在 Edge 环境中运行而不需要 Node.js API，必须在 `schema.prisma` 中开启 `driverAdapters` 预览特性：

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"] // 必须开启
}

datasource db {
  provider = "sqlite" // D1 基于 SQLite
  url      = env("DATABASE_URL")
}
```
每次修改 `schema.prisma` 后，记得运行 `npx prisma generate` 重新生成 Client。

## 3. Nuxt 与 Nitro 配置 (nuxt.config.ts)

为了解决本地 Node.js 开发环境与线上 Cloudflare Edge 环境的差异，我们采用了**物理文件隔离**加**构建时别名 (Alias)** 的策略。同时必须开启 Nitro 的 Wasm 支持。

### 3.1 开启 Wasm 支持
Prisma 的 D1 适配器底层依然依赖编译为 WebAssembly (Wasm) 的极小查询引擎内核（`query_engine_bg.wasm`）。为了让 Nuxt/Nitro 在打包时正确处理 `?module` 后缀的导入，**必须**在 `nuxt.config.ts` 中开启：

```typescript
export default defineNuxtConfig({
  nitro: {
    experimental: { wasm: true } // 解决 query_engine_bg.wasm?module 找不到 (ENOENT) 的错误
  }
})
```

### 3.2 别名 (Alias) 配置
通过判断当前是否为 Cloudflare 环境，在构建时将 `#prisma` 映射到不同的物理文件：

```typescript
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const currentDir = dirname(fileURLToPath(import.meta.url))

// 判断当前是否处于 Cloudflare 构建环境
const isCloudflare = process.env.CF_PAGES === '1' || process.env.NITRO_PRESET === 'cloudflare-pages' || process.env.USE_D1 === 'true'

export default defineNuxtConfig({
  alias: {
    '#prisma': isCloudflare 
      ? resolve(currentDir, './server/db/prisma-edge.ts')
      : resolve(currentDir, './server/db/prisma-node.ts')
  }
})
```

## 4. 数据库实例化文件隔离

我们在 `server/db/` 目录下准备了两个独立的 Prisma 实例化文件。**注意：在 Edge 环境下，绝对不能再使用旧版的 `@prisma/client/edge` 导入路径，必须直接使用标准的 `@prisma/client`。**

### Edge 环境 (`server/db/prisma-edge.ts`)
用于 Cloudflare Pages (线上)：

```typescript
// 必须导入标准包，不能使用 /edge 端点
import { PrismaClient } from '@prisma/client' 
import { PrismaD1 } from '@prisma/adapter-d1'

let prisma: PrismaClient | null = null

export const getPrisma = (event: any) => {
  if (prisma) return prisma

  // 这里的 DB_BINDING 必须和 Cloudflare 仪表盘中绑定的 D1 变量名一致（本项目为 DB）
  const dbBinding = event.context.cloudflare?.env?.DB 
  if (!dbBinding) {
    throw new Error('Cloudflare D1 Binding is missing.')
  }

  const adapter = new PrismaD1(dbBinding)
  prisma = new PrismaClient({ adapter })
  return prisma
}
```

### Node 环境 (`server/db/prisma-node.ts`)
用于本地开发 (`npm run dev`)：

```typescript
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | null = null

export const getPrisma = (event: any) => {
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}
```

### 业务代码调用
在所有 API 路由中（如 `server/api/jobs.get.ts`），我们统一通过 `#prisma` 别名来获取客户端，从而实现环境解耦：

```typescript
import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const jobs = await prisma.job.findMany()
  return jobs
})
```

## 5. 部署到 Cloudflare Pages 的流程

1. **创建 D1 数据库**：
   在 Cloudflare 控制台 -> Workers & Pages -> D1 中创建一个数据库，并记录下 Database ID。

2. **配置 Pages 项目**：
   将你的 GitHub 仓库连接到 Cloudflare Pages。
   - **构建命令**: `npm run build`
   - **构建输出目录**: `dist` (Nuxt 默认输出) / 如果是完全服务端渲染，Cloudflare Preset 默认输出是 `.output/public`（通常 Cloudflare 会自动识别）。

3. **绑定 D1 数据库**：
   在 Pages 项目的 **Settings -> Bindings -> D1 database bindings** 中：
   - **Variable name (变量名)**: 必须填写 `DB` （与 `prisma-edge.ts` 中的代码对应）
   - **D1 database**: 选择你刚刚创建的数据库。

4. **初始化数据库表结构 (迁移)**：
   由于你不能直接在 Cloudflare 上运行 `prisma migrate`，你需要在本地将 Schema 推送到远端的 D1 数据库。
   安装 `wrangler` 工具，并执行本地迁移命令到线上：
   ```bash
   npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file=prisma/migrations/.../migration.sql --remote
   ```
   或者直接生成迁移脚本并手动在 Cloudflare 控制台执行 SQL。

5. **触发部署**：
   每次 `git push` 到主分支后，Cloudflare 会自动开始构建。得益于 `nuxt.config.ts` 中的配置，Nuxt 会使用 `cloudflare-pages` Preset 进行打包，正确引入 D1 适配器和 Wasm，最终完成部署。

---
*文档生成于 2026-08*
