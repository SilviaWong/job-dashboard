import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
const currentDir = dirname(fileURLToPath(import.meta.url))

// 判断当前是否处于 Cloudflare 构建环境
const isCloudflare = process.env.CF_PAGES === '1' || process.env.NITRO_PRESET === 'cloudflare-pages' || process.env.USE_D1 === 'true'

export default defineNuxtConfig({
  ssr: false, // 启用纯客户端渲染 (SPA)，避免 Edge 端 SSR 耗尽 128MB 内存触发 Error 1102
  nitro: {
    experimental: { wasm: true }
  },
  compatibilityDate: '2025-07-15',
  
  alias: {
    '#prisma': isCloudflare 
      ? resolve(currentDir, './server/db/prisma-edge.ts')
      : resolve(currentDir, './server/db/prisma-node.ts')
  },

  devtools: { enabled: true },
  modules: [
    '@element-plus/nuxt'
  ],
  elementPlus: {
    // Custom configuration for element plus if needed
  },
  vite: {
    optimizeDeps: {
      exclude: ['@prisma/client', '@prisma/adapter-d1']
    }
  },
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Authorization, X-Requested-With'
      }
    }
  }
})