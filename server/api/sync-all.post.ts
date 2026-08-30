import { getPrisma } from '#prisma'
import { computeDescHash } from '../utils/descHash'
import { resolveJobHrActive } from '../utils/hrAnalytics'
import { extractStructuredAndPayload, syncJobDetailPayload } from '../utils/jobDualWriter'
import { extractCompanyMetadata } from '../utils/companyProcessors/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    return { success: false, message: 'Invalid payload' }
  }

  const {
    blacklisted_companies = [],
    favorited_jobs = [],
    job_statuses = {},
    job_interviews = {},
    ai_job_scores = {},
    ai_job_intros = {},
    user_job_tags = {},
    interview_questions = [],
    ai_settings = null,
    boss_companies_scraped = [],
    '51job_companies_scraped': job51_companies_scraped = [],
    liepin_companies_db_v1 = [],
    zhilian_company_cache = {},
    zhilian_enrichment_cache = {},
    '51job_scraped_v2': job51_scraped_v2 = [],
    boss_scraped_v2 = [],
    boss_single_details = [],
    liepin_scraped_data_v1 = [],
    zhilian_scraped_data_v1 = [],
    zhilian_scraped_data_v2 = []
  } = body

  let syncResults = {
    blacklisted: 0,
    questions: 0,
    aiSettingsUpdated: false,
    jobUpdates: 0,
    interviews: 0,
    companies: 0,
    aiResults: 0
  }

  // 1. Sync Blacklisted Companies
  if (Array.isArray(blacklisted_companies)) {
    for (const company of blacklisted_companies) {
      if (typeof company === 'string' && company.trim()) {
        await prisma.blacklistedCompany.upsert({
          where: { companyName: company.trim() },
          update: {},
          create: { companyName: company.trim() }
        }).catch(() => { })
      }
    }
    syncResults.blacklisted = blacklisted_companies.length
  }

  // 2. Sync Question Bank
  if (Array.isArray(interview_questions)) {
    for (const q of interview_questions) {
      if (q.id && q.title) {
        await prisma.questionBank.upsert({
          where: { id: q.id },
          update: {
            title: q.title,
            tags: typeof q.tags === 'string' ? q.tags : (q.tags ? JSON.stringify(q.tags) : null),
            answer: q.answer || null,
            serialNo: q.serialNo ? parseInt(q.serialNo, 10) : null,
            themeCategory: q.themeCategory || null,
            subCategory: q.subCategory || null
          },
          create: {
            id: q.id,
            title: q.title,
            tags: typeof q.tags === 'string' ? q.tags : (q.tags ? JSON.stringify(q.tags) : null),
            answer: q.answer || null,
            serialNo: q.serialNo ? parseInt(q.serialNo, 10) : null,
            themeCategory: q.themeCategory || null,
            subCategory: q.subCategory || null
          }
        }).catch(() => { })
      }
    }
    syncResults.questions = interview_questions.length
  }

  // 3. Sync AI Settings
  if (ai_settings && ai_settings.activeProfileId) {
    await prisma.aiSettings.upsert({
      where: { id: 'default' },
      update: {
        activeProfileId: ai_settings.activeProfileId,
        profiles: JSON.stringify(ai_settings.profiles || []),
        resume: ai_settings.resume || null
      },
      create: {
        id: 'default',
        activeProfileId: ai_settings.activeProfileId,
        profiles: JSON.stringify(ai_settings.profiles || []),
        resume: ai_settings.resume || null
      }
    }).catch(() => { })
    syncResults.aiSettingsUpdated = true
  }

  // 4. Sync Companies
  const allCompanies: { cName: string, companyId: string, platform: string, rawData: any }[] = []

  // Boss直聘
  if (Array.isArray(boss_companies_scraped)) {
    for (const comp of boss_companies_scraped) {
      const cName = comp['公司全称'] || '';
      const companyId = comp['公司ID'] || '';
      if (companyId) {
        allCompanies.push({
          cName: String(cName),
          companyId: String(companyId),
          platform: 'Boss直聘',
          rawData: { ...comp, sourcePlatform: 'Boss直聘' }
        });
      }
    }
  }

  // 51job
  if (Array.isArray(job51_companies_scraped)) {
    for (const comp of job51_companies_scraped) {
      const cName = comp.coinfo.coname || comp.llicense.businessName || '';
      const companyId = comp.coinfo.encryCompanyId || '';
      if (companyId) {
        allCompanies.push({
          cName: String(cName),
          companyId: String(companyId),
          platform: '51job',
          rawData: { ...comp, sourcePlatform: '51job' }
        });
      }
    }
  }

  // 猎聘
  if (Array.isArray(liepin_companies_db_v1)) {
    for (const comp of liepin_companies_db_v1) {
      const cName = comp.compName || '';
      const companyId = comp.compId || '';
      if (companyId) {
        allCompanies.push({
          cName: String(cName),
          companyId: String(companyId),
          platform: '猎聘',
          rawData: { ...comp, sourcePlatform: '猎聘' }
        });
      }
    }
  }

  // 智联
  const zhilianComps = Array.isArray(zhilian_company_cache)
    ? zhilian_company_cache
    : (zhilian_company_cache && typeof zhilian_company_cache === 'object' ? Object.values(zhilian_company_cache) : []);

  for (const comp of zhilianComps as any[]) {
    let cName = comp.businessInformation?.businessInformationData?.registeredName || '';
    const companyId = comp.companyNumber || '';
    if (companyId) {
      allCompanies.push({
        cName: String(cName),
        companyId: String(companyId),
        platform: '智联',
        rawData: { ...comp, sourcePlatform: '智联' }
      });
    }
  }

  // 统一入库
  for (const item of allCompanies) {
    const { cName, companyId, platform, rawData } = item;
    if (cName && typeof cName === 'string' && cName.trim() !== '') {
      const meta = extractCompanyMetadata(rawData);
      try {
        await prisma.company.upsert({
          where: {
            companyName_sourcePlatform_companyId: {
              companyName: cName.trim(),
              sourcePlatform: platform,
              companyId: companyId ? String(companyId) : null
            }
          },
          update: {
            rawData: JSON.stringify(rawData),
            companyId: companyId ? String(companyId) : null,
            industry: meta.industry,
            scale: meta.scale,
            stage: meta.stage,
            companyType: meta.companyType,
            creditCode: meta.creditCode,
            logo: meta.logo,
            welfareList: meta.welfareList
          },
          create: {
            companyName: cName.trim(),
            sourcePlatform: platform,
            companyId: companyId ? String(companyId) : null,
            rawData: JSON.stringify(rawData),
            industry: meta.industry,
            scale: meta.scale,
            stage: meta.stage,
            companyType: meta.companyType,
            creditCode: meta.creditCode,
            logo: meta.logo,
            welfareList: meta.welfareList
          }
        })
        syncResults.companies++
      } catch (err) {
        console.error('Failed to upsert company:', cName.trim(), err)
      }
    }
  }

  // 4.5 Sync Jobs
  const allJobs: any[] = []

  // boss_scraped_v2 + boss_single_details
  if (Array.isArray(boss_scraped_v2)) {
    const detailMap = new Map(boss_single_details.map((d: any) => [d.encryptJobId || d.jobId || d['职位ID'], d]))
    for (const job of boss_scraped_v2) {
      const jobId = job.encryptJobId || job.jobId || job['职位ID']
      const detail = detailMap.get(jobId)
      if (detail) {
        job.boss_single_detail = detail
      }

      const location = [job.cityName, job.areaDistrict, job.businessDistrict].filter(Boolean).join('·') || '未知'
      allJobs.push({
        jobId: String(jobId),
        title: String(job.jobName || '未知'),
        companyName: String(job.brandName || '未知'),
        salary: String(job.salaryDesc || '面议'),
        location: String(location),
        platform: 'Boss直聘',
        dataSource: 'boss_scraped_v2',
        rawData: JSON.stringify(job),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }
  }

  // 51job_scraped_v2
  if (Array.isArray(job51_scraped_v2)) {
    for (const job of job51_scraped_v2) {
      allJobs.push({
        jobId: String(job.jobId),
        title: String(job.jobName || job.jobTitle || '未知'),
        companyName: String(job.companyName || '未知'),
        salary: String(job.provideSalaryString || job.jobSalary || '面议'),
        location: String(job.jobAreaString || job.jobArea || '未知'),
        platform: '51job',
        dataSource: '51job_scraped_v2',
        rawData: JSON.stringify(job),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }
  }

  // liepin_scraped_data_v1
  if (Array.isArray(liepin_scraped_data_v1)) {
    for (const job of liepin_scraped_data_v1) {
      const jobInfo = job.job || {}
      const compInfo = job.comp || {}
      const title = (job.jobDetailJson && job.jobDetailJson.title) || jobInfo.title || '未知'
      const compName = compInfo.compName || '未知'
      const jobId = jobInfo.jobId || jobInfo.jobKind || `${compName}_${title}`
      const location = (job.jobDetailJson && job.jobDetailJson.jobLocation?.address?.addressLocality) || jobInfo.dq || jobInfo.city || '未知'

      allJobs.push({
        jobId: String(jobId),
        title: String(title),
        companyName: String(compName),
        salary: String(jobInfo.salary || '面议'),
        location: String(location),
        platform: '猎聘',
        dataSource: 'liepin_scraped_data_v1',
        rawData: JSON.stringify(job),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }
  }

  // zhilian_scraped_data_v1 and v2
  const zhilianV1 = Array.isArray(zhilian_scraped_data_v1) ? zhilian_scraped_data_v1 : []
  const zhilianV2 = Array.isArray(zhilian_scraped_data_v2) ? zhilian_scraped_data_v2 : []
  
  // 1. 将 v1 的数据保存
  for (const job of zhilianV1) {
    const compName = job.company?.name || job.companyName || '未知'
    const title = job.name || '未知'
    const jobId = String(job.number || job.id || `${compName}_${title}`)
    
    allJobs.push({
      jobId: jobId,
      title: String(title),
      companyName: String(compName),
      salary: String(job.salary60 || job.salary || '面议'),
      location: String(job.workCity || job.cityDistrict || '未知'),
      platform: '智联',
      dataSource: 'zhilian_scraped_data_v1',
      rawData: JSON.stringify(job),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  }

  // 2. 将 v2 的数据保存
  for (const job of zhilianV2) {
    const compName = job.company?.name || job.companyName || '未知'
    const title = job.name || '未知'
    const jobId = String(job.number || job.id || `${compName}_${title}`)
    
    allJobs.push({
      jobId: jobId,
      title: String(title),
      companyName: String(compName),
      salary: String(job.salary60 || job.salary || '面议'),
      location: String(job.workCity || job.cityDistrict || '未知'),
      platform: '智联',
      dataSource: 'zhilian_scraped_data_v2',
      rawData: JSON.stringify(job),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  }

  // Preload existing jobs for fast in-memory change detection
  const existingJobs = await prisma.job.findMany({
    select: {
      jobId: true,
      platform: true,
      descHash: true,
      salary: true,
      title: true,
      companyName: true
    }
  })
  const existingJobMap = new Map<string, any>()
  for (const ej of existingJobs) {
    existingJobMap.set(`${ej.jobId}_${ej.platform}`, ej)
  }

  const changedJobs: any[] = []

  // Upsert all collected jobs
  for (const job of allJobs) {
    if (job.jobId && job.jobId !== 'undefined' && job.jobId !== 'null') {
      try {
        const descHash = computeDescHash(job)
        job.descHash = descHash
        job.firstSeen = job.createdAt
        job.lastSeen = job.updatedAt

        let parsedRaw = null
        try { parsedRaw = JSON.parse(job.rawData) } catch(e) {}
        const hr = resolveJobHrActive(parsedRaw, null, job.platform)
        job.hrActiveStatus = hr.hrActiveStatus || null
        job.hrActiveLevel = hr.hrActiveLevel

        let isHeadhunter = false
        if (job.platform === 'Boss直聘') isHeadhunter = parsedRaw?.proxyJob === 1 || parsedRaw?.zpData?.jobInfo?.proxyJob === 1 || false
        else if (job.platform === '51job') isHeadhunter = parsedRaw?.jobType === '1' || parsedRaw?.jobType === '2' || parsedRaw?.companyTypeString === '中介' || false
        else if (job.platform === '猎聘') isHeadhunter = String(parsedRaw?.job?.jobKind) === '1' || false
        else if (job.platform === '智联') isHeadhunter = (parsedRaw?.proxyModel?.recruitPosition > 0) || false
        job.isHeadhunter = isHeadhunter

        const key = `${job.jobId}_${job.platform}`
        const existing = existingJobMap.get(key)
        if (existing) {
          const descChanged = !!(existing.descHash && existing.descHash !== descHash)
          const salaryChanged = !!(existing.salary && job.salary && existing.salary !== job.salary)
          if (descChanged || salaryChanged) {
            changedJobs.push({
              jobId: job.jobId,
              title: job.title,
              companyName: job.companyName,
              platform: job.platform,
              oldSalary: existing.salary,
              newSalary: job.salary,
              reason: descChanged && salaryChanged ? 'JD描述与薪资均变更' : (salaryChanged ? '薪资调整' : 'JD描述更新')
            })
          }
        }

        const { structured, payload } = extractStructuredAndPayload(parsedRaw || job, job.platform, job.rawData)

        const savedJob = await prisma.job.upsert({
          where: { 
            jobId_platform: {
              jobId: job.jobId,
              platform: job.platform
            }
          },
          update: {
            title: job.title,
            companyName: job.companyName,
            salary: job.salary,
            location: job.location,
            platform: job.platform,
            rawData: job.rawData,
            updatedAt: job.updatedAt,
            lastSeen: job.updatedAt,
            descHash: descHash,
            hrActiveStatus: job.hrActiveStatus,
            hrActiveLevel: job.hrActiveLevel,
            isHeadhunter: isHeadhunter,
            ...structured
          },
          create: {
            ...job,
            ...structured
          }
        })

        await syncJobDetailPayload(prisma, savedJob.id, payload)
        syncResults.jobUpdates++
      } catch (err) {
        console.error('Failed to upsert job:', job.jobId, err)
      }
    }
  }

  // 5. Sync AiJobResults
  const aiJobIds = new Set([
    ...Object.keys(ai_job_scores || {}),
    ...Object.keys(ai_job_intros || {})
  ])
  for (const jobId of aiJobIds) {
    const scoreData = ai_job_scores[jobId] || {}
    const intro = ai_job_intros[jobId] || null
    try {
      await prisma.aiJobResult.upsert({
        where: { jobId },
        update: {
          score: scoreData.score ? Number(scoreData.score) : null,
          matchLevel: scoreData.matchLevel || null,
          resultText: scoreData.resultText || null,
          intro: intro
        },
        create: {
          jobId,
          score: scoreData.score ? Number(scoreData.score) : null,
          matchLevel: scoreData.matchLevel || null,
          resultText: scoreData.resultText || null,
          intro: intro
        }
      })
      syncResults.aiResults++
    } catch (err) { }
  }

  // 6. Batch update Jobs (Favorited, Status, Tags)
  const jobIdsForUpdate = new Set([
    ...favorited_jobs,
    ...Object.keys(job_statuses || {}),
    ...Object.keys(job_interviews || {}),
    ...Object.keys(user_job_tags || {})
  ])

  for (const jobId of jobIdsForUpdate) {
    const updateData: any = {}

    if (favorited_jobs.includes(jobId)) {
      updateData.isFavorited = true
    }
    if (job_statuses[jobId]) {
      updateData.status = job_statuses[jobId]
    }
    if (user_job_tags[jobId]) {
      updateData.tags = JSON.stringify(user_job_tags[jobId].tags || [])
      updateData.isHidden = user_job_tags[jobId].isHidden || false
    }

    if (Object.keys(updateData).length > 0) {
      try {
        await prisma.job.update({
          where: { jobId },
          data: updateData
        })
        syncResults.jobUpdates++
      } catch (err) {
        // Job might not exist in SQLite yet, ignore
      }
    }

    // 7. Sync Interviews for this job
    if (job_interviews[jobId]) {
      const interview = job_interviews[jobId]
      try {
        const jobExists = await prisma.job.findUnique({ where: { jobId } })
        if (jobExists) {
          const existing = await prisma.interview.findFirst({ where: { jobId } })
          if (existing) {
            await prisma.interview.update({
              where: { id: existing.id },
              data: {
                time: interview.time ? new Date(interview.time) : new Date(),
                type: interview.type || '未知',
                round: interview.round || '未知',
                note: interview.note || null,
                debrief: interview.debrief || null
              }
            })
          } else {
            await prisma.interview.create({
              data: {
                jobId,
                time: interview.time ? new Date(interview.time) : new Date(),
                type: interview.type || '未知',
                round: interview.round || '未知',
                note: interview.note || null,
                debrief: interview.debrief || null
              }
            })
          }
          syncResults.interviews++
        }
      } catch (err) { }
    }
  }

  // 8. Sync Zhilian Enrichment Cache
  const zhilianCacheKeys = Object.keys(zhilian_enrichment_cache || {})
  for (const jobId of zhilianCacheKeys) {
    const rawData = zhilian_enrichment_cache[jobId]
    if (rawData) {
      try {
        await prisma.zhilianEnrichmentCache.upsert({
          where: { jobId },
          update: { rawData: JSON.stringify(rawData) },
          create: { jobId, rawData: JSON.stringify(rawData) }
        })
      } catch (err) {
        console.error('Failed to upsert ZhilianEnrichmentCache:', jobId, err)
      }
    }
  }

  return {
    success: true,
    message: changedJobs.length > 0
      ? `全量配置与职位同步完成！检测到 ${changedJobs.length} 个岗位信息变更（薪资调整或JD修改）`
      : '全量配置同步完成',
    results: {
      ...syncResults,
      changedJobsCount: changedJobs.length
    },
    changedJobs
  }
})
