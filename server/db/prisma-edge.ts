import { PrismaClient } from '@prisma/client/edge'
import { PrismaD1 } from '@prisma/adapter-d1'

let _prismaD1: PrismaClient | null = null

export function getPrisma(event?: any): PrismaClient {
  if (_prismaD1) return _prismaD1
  const d1Binding = event?.context?.cloudflare?.env?.DB
  if (!d1Binding) {
    throw new Error('D1 binding "DB" not found in event.context.cloudflare.env')
  }
  const adapter = new PrismaD1(d1Binding)
  _prismaD1 = new PrismaClient({ adapter })
  return _prismaD1
}
