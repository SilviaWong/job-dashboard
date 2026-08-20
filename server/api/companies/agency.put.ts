import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  const { companyName, isAgency } = body

  if (!companyName) {
    return { success: false, error: 'companyName is required' }
  }

  try {
    // 查找是否存在该公司的记录
    const existingCompanies = await prisma.company.findMany({
      where: {
        OR: [
          { companyName: companyName },
          { companyFullName: companyName }
        ]
      }
    })

    if (existingCompanies.length > 0) {
      // 存在则更新所有匹配的记录
      await prisma.company.updateMany({
        where: {
          OR: [
            { companyName: companyName },
            { companyFullName: companyName }
          ]
        },
        data: {
          isAgency: Boolean(isAgency)
        }
      })
    } else {
      // 不存在则创建一条新的壳记录
      await prisma.company.create({
        data: {
          companyName: companyName,
          sourcePlatform: 'manual',
          isAgency: Boolean(isAgency)
        }
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
