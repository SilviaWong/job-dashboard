// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
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
