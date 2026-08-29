import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const query = getQuery(event)

  let companyName = (query.companyName as string || '').trim()

  if (!companyName) {
    try {
      const body = await readBody(event)
      companyName = (body?.companyName || '').trim()
    } catch (e) {}
  }

  if (!companyName) {
    return {
      success: false,
      error: '请提供要移出黑名单的公司名称'
    }
  }

  try {
    await prisma.blacklistedCompany.delete({
      where: { companyName }
    })

    return {
      success: true,
      message: `已将【${companyName}】移出黑名单`
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
