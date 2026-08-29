import { createHash } from 'crypto'

/**
 * 计算职位 JD/核心描述的 MD5 哈希值，用于检测企业是否改过要求或薪资
 */
export function computeDescHash(job: any): string {
  let desc = ''
  try {
    const jobDetail = job?.jobDetail || {}
    const zpData = jobDetail.zpData || job?.zpData || {}
    const jobInfo = zpData.jobInfo || job?.jobInfo || {}

    desc = jobInfo.postDescription ||
      jobInfo.jobDesc ||
      job?.postDescription ||
      job?.jobDesc ||
      job?.jobDescribe ||
      job?.jobSummary ||
      job?.description ||
      job?.['职位描述'] ||
      ''
  } catch (e) {
    desc = ''
  }

  if (!desc) {
    desc = `${job?.title || job?.jobName || job?.['职位名称'] || ''}_${job?.salary || job?.salaryDesc || job?.['薪资待遇'] || ''}_${job?.education || job?.jobDegree || ''}`
  }

  return createHash('md5').update(String(desc)).digest('hex')
}
