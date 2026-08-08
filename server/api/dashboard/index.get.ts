import { getPrisma } from '#prisma'
import { normalizeJobData } from '../../utils/jobNormalizer'

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)

  try {
    const jobs = await prisma.job.findMany()

    const salaryDist = { '10k以下': 0, '10-20k': 0, '20-30k': 0, '30k以上': 0, '面议': 0 }
    const expDist: Record<string, number> = {}
    const skillsDist: Record<string, number> = {}

    for (const job of jobs) {
      let parsedRawData = null
      let parsedRawData2 = null
      try {
        if (job.rawData) parsedRawData = JSON.parse(job.rawData)
        if (job.rawData2) parsedRawData2 = JSON.parse(job.rawData2)
      } catch (e) {
        // ignore parse error
      }

      const rawJobObj = {
        ...parsedRawData,
        ...parsedRawData2,
        dataSource: job.dataSource,
        platform: job.platform,
        isFavorited: job.isFavorited,
        isHidden: job.isHidden,
        tags: job.tags ? JSON.parse(job.tags) : []
      }

      const normalizedData = normalizeJobData(job, parsedRawData, parsedRawData2, rawJobObj, job.platform)

      // Salary extraction
      const salary = String(normalizedData.salaryRange || '')
      let maxK = -1;

      const kMatches = [...salary.matchAll(/(\d+)\s*[kK]/g)]
      if (kMatches.length > 0) {
        maxK = Math.max(...kMatches.map(m => parseInt(m[1], 10)))
      } else if (salary.includes('万')) {
        const matches = [...salary.matchAll(/(\d+(\.\d+)?)\s*万/g)]
        if (matches.length > 0) {
          maxK = Math.max(...matches.map(m => parseFloat(m[1]) * 10))
        }
      } else if (salary.includes('千')) {
        const matches = [...salary.matchAll(/(\d+(\.\d+)?)\s*千/g)]
        if (matches.length > 0) {
          maxK = Math.max(...matches.map(m => parseFloat(m[1])))
        }
      }

      if (maxK > 0) {
        if (maxK < 10) salaryDist['10k以下']++
        else if (maxK <= 20) salaryDist['10-20k']++
        else if (maxK <= 30) salaryDist['20-30k']++
        else salaryDist['30k以上']++
      } else {
        salaryDist['面议']++
      }

      // Experience extraction
      let exp = String(normalizedData.experience || '未知')
      if (exp.includes('3-5') || exp.includes('3年') || exp.includes('4年') || exp.includes('3-4')) exp = '3-5年'
      else if (exp.includes('1-3') || exp.includes('1年') || exp.includes('2年') || exp.includes('1-2')) exp = '1-3年'
      else if (exp.includes('5-10') || exp.includes('5年') || exp.includes('6年') || exp.includes('7年') || exp.includes('8年') || exp.includes('9年')) exp = '5-10年'
      else if (exp.includes('10')) exp = '10年以上'
      else exp = '其他/不限'

      expDist[exp] = (expDist[exp] || 0) + 1

      // Skills extraction
      const skills = normalizedData.jobTags || []
      skills.forEach((t: string) => {
        if (t && t.trim()) {
          const tag = t.trim()
          skillsDist[tag] = (skillsDist[tag] || 0) + 1
        }
      })
    }

    return {
      success: true,
      data: {
        salary: salaryDist,
        experience: expDist,
        skills: skillsDist,
        totalJobs: jobs.length
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})
