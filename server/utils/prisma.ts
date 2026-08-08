import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

// 缓存实例，避免每次请求重复初始化
let _prismaLocal: PrismaClient | null = null
let _prismaD1: PrismaClient | null = null

export function getPrisma(event?: any): PrismaClient {
  // 通过环境变量判断当前是否需要连 D1
  const useD1 = process.env.USE_D1 === 'true'

  if (useD1) {
    // 【线上环境】：走 Cloudflare D1
    if (_prismaD1) return _prismaD1
    
    const d1Binding = event?.context?.cloudflare?.env?.DB
    if (!d1Binding) {
      throw new Error('D1 Binding not found in event context.')
    }
    
    console.log('Initialize Prisma with Cloudflare D1 Adapter')
    const adapter = new PrismaD1(d1Binding)
    _prismaD1 = new PrismaClient({ adapter })
    return _prismaD1
  } else {
    // 【本地环境】：走原生 SQLite 文件
    if (_prismaLocal) return _prismaLocal
    
    console.log('Initialize Prisma with Local SQLite')
    _prismaLocal = new PrismaClient()
    return _prismaLocal
  }
}
