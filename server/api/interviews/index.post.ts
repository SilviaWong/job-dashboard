import { getPrisma } from '#prisma'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const body = await readBody(event)

  const { jobId, time, type, round, note, debrief, syncJobStatus } = body

  if (!jobId || !time || !round) {
    return {
      success: false,
      message: '缺少必要参数: jobId, time, round 为必填项'
    }
  }

  try {
    // 校验 Job 是否存在
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, applyStatus: true }
    })

    if (!job) {
      return {
        success: false,
        message: '指定的职位记录不存在'
      }
    }

    const interview = await prisma.interview.create({
      data: {
        jobId,
        time: new Date(time),
        type: type || '视频',
        round: round || '一面',
        note: note || null,
        debrief: debrief || null
      },
      include: {
        job: {
          select: {
            id: true,
            jobId: true,
            title: true,
            companyName: true,
            companyFullName: true,
            salary: true,
            platform: true,
            applyStatus: true
          }
        }
      }
    })

    // 可选联动：根据面试轮次更新看板流转状态
    if (syncJobStatus) {
      let targetStatus = 'interview-1'
      const r = String(round).toLowerCase()
      if (r.includes('二面') || r.includes('2面')) {
        targetStatus = 'interview-2'
      } else if (r.includes('一面') || r.includes('1面') || r.includes('初面')) {
        targetStatus = 'interview-1'
      }

      if (job.status !== targetStatus) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: targetStatus,
            applyStatus: targetStatus,
            statusUpdatedAt: new Date()
          }
        })

        // 记录状态流转日志
        await prisma.jobStatusLog.create({
          data: {
            jobRecordId: jobId,
            fromStatus: job.status || 'applied',
            toStatus: targetStatus,
            note: `约面试触发：${round} (${type})`
          }
        })
      }
    }

    return {
      success: true,
      data: interview
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '创建面试日程失败'
    }
  }
})
