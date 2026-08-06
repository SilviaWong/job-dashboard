import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  
  if (!id || !body.status) {
    return { success: false, message: 'Missing id or status' }
  }

  try {
    const job = await prisma.job.update({
      where: { id },
      data: { status: body.status }
    })
    
    return { success: true, data: job }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
