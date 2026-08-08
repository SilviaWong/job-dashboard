import { PrismaClient } from '@prisma/client'

let _prismaLocal: PrismaClient | null = null

export function getPrisma(event?: any): PrismaClient {
  if (_prismaLocal) return _prismaLocal
  _prismaLocal = new PrismaClient()
  return _prismaLocal
}
