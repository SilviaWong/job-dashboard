import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20
  const keyword = query.keyword as string
  const domain = query.domain as string

  try {
    const where: any = {}
    
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { tags: { contains: keyword } },
        { corePoints: { contains: keyword } },
        { variants: { some: { title: { contains: keyword } } } }
      ]
    }
    
    if (domain) {
      where.domain = domain
    }

    const total = await prisma.standardQuestion.count({ where })
    
    const questions = await prisma.standardQuestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        variants: {
          orderBy: { serialNo: 'asc' }
        }
      }
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
