import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

export function getPrisma(event?: any): PrismaClient {
  if (event?.context?._prismaD1) return event.context._prismaD1

  const d1Binding = event?.context?.cloudflare?.env?.DB
  if (!d1Binding) {
    throw new Error('D1 binding "DB" not found in event.context.cloudflare.env')
  }
  const adapter = new PrismaD1(d1Binding)
  const client = new PrismaClient({ adapter })
  if (event?.context) {
    event.context._prismaD1 = client
  }
  return client
}
