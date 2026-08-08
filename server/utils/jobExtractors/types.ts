import { PrismaClient } from '@prisma/client'

export type JobProcessor = (job: any, platform: string, prisma: PrismaClient) => Promise<any>
