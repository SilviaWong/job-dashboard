// 判断当前是否处于 Cloudflare 构建环境
const isCloudflare = process.env.CF_PAGES === '1' || process.env.NITRO_PRESET === 'cloudflare-pages' || process.env.USE_D1 === 'true'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // 核心修复逻辑：如果是 Cloudflare 环境，强制把 Prisma 替换为无 Node 依赖的 edge 版本
  alias: isCloudflare ? {
    '@prisma/client$': '@prisma/client/edge'
  } : {},

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