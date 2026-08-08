import { PrismaClient } from '@prisma/client'

export type CompanyProcessor = (company: any, platform: string, prisma: PrismaClient) => Promise<void>
