import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20
  const keyword = query.keyword as string

  try {
    const where: any = {}
    
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { tags: { contains: keyword } }
      ]
    }

    const total = await prisma.questionBank.count({ where })
    
    const questions = await prisma.questionBank.findMany({
      where,
      orderBy: { serialNo: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    return {
      success: true,
      data: questions,
      total,
      hasMore: (page * pageSize) < total
    }
  } catch (error: any) {
    console.error('Error fetching questions:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
