export interface FunnelJobItem {
  id: string
  jobId: string
  title: string
  companyName: string
  salary: string
  platform: string
  applyStatus: string | null
  isFavorited: boolean
  appliedAt: Date | null
  statusUpdatedAt: Date | null
  createdAt: Date
  interviews?: Array<{ id: string; round: string; type: string; time: Date }>
  statusLogs?: Array<{ fromStatus: string; toStatus: string; createdAt: Date }>
}

export function calcAvg(arr: number[]) {
  if (!arr.length) return { avg: 0, count: 0 }
  const sum = arr.reduce((a, b) => a + b, 0)
  return { avg: Math.round((sum / arr.length) * 10) / 10, count: arr.length }
}

export function computeFunnelAnalytics(jobs: FunnelJobItem[], now = Date.now()) {
  const DAY_MS = 24 * 60 * 60 * 1000

  let cumToApply = 0
  let cumApplied = 0
  let cumInterview1 = 0
  let cumInterview2 = 0
  let cumOffer = 0
  let cumRejected = 0

  const currentDist: Record<string, number> = {
    'to-apply': 0, 'applied': 0, 'interview-1': 0, 'interview-2': 0, 'offer': 0, 'rejected': 0
  }

  const durations = {
    appliedToI1: [] as number[],
    i1ToI2: [] as number[],
    i2ToOffer: [] as number[],
    fullCycle: [] as number[]
  }

  const rejectionBreakdown: Record<string, number> = {
    '简历初筛未通过': 0,
    '技术一面未通过': 0,
    '复试/终面未通过': 0,
    '意向阶段放弃': 0
  }

  const stagnantJobs: any[] = []
  const weeklyMap = new Map<string, { label: string; applied: number; interview: number; offer: number }>()

  for (let w = 11; w >= 0; w--) {
    const d = new Date(now - w * 7 * DAY_MS)
    const dayNr = (d.getDay() + 6) % 7
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNr)
    const sun = new Date(mon.getTime() + 6 * DAY_MS)
    const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
    const label = `${String(mon.getMonth() + 1).padStart(2, '0')}/${String(mon.getDate()).padStart(2, '0')}~${String(sun.getMonth() + 1).padStart(2, '0')}/${String(sun.getDate()).padStart(2, '0')}`
    weeklyMap.set(key, { label, applied: 0, interview: 0, offer: 0 })
  }

  for (const job of jobs) {
    let status = job.applyStatus || 'none'
    if (status === 'none' && job.isFavorited) status = 'to-apply'
    if (currentDist[status] !== undefined) currentDist[status]++

    const logs = job.statusLogs || []
    const interviews = job.interviews || []
    const passed = new Set<string>([status])
    logs.forEach(l => {
      if (l.toStatus) passed.add(l.toStatus)
      if (l.fromStatus && l.fromStatus !== 'normal' && l.fromStatus !== 'none') passed.add(l.fromStatus)
    })
    if (interviews.length > 0) {
      passed.add('interview-1')
      if (interviews.length >= 2) passed.add('interview-2')
    }

    if (passed.has('to-apply') || job.isFavorited || passed.has('applied') || passed.has('interview-1')) cumToApply++
    if (passed.has('applied') || job.appliedAt || passed.has('interview-1')) cumApplied++
    if (passed.has('interview-1') || passed.has('interview-2') || interviews.length > 0) cumInterview1++
    if (passed.has('interview-2') || passed.has('offer') || interviews.length >= 2) cumInterview2++
    if (passed.has('offer')) cumOffer++
    if (passed.has('rejected')) cumRejected++

    let tApp: number | null = job.appliedAt ? new Date(job.appliedAt).getTime() : null
    let tI1: number | null = null
    let tI2: number | null = null
    let tOff: number | null = null

    for (const l of logs) {
      const lt = new Date(l.createdAt).getTime()
      if (l.toStatus === 'applied' && (!tApp || lt < tApp)) tApp = lt
      if (l.toStatus === 'interview-1' && (!tI1 || lt < tI1)) tI1 = lt
      if (l.toStatus === 'interview-2' && (!tI2 || lt < tI2)) tI2 = lt
      if (l.toStatus === 'offer' && (!tOff || lt < tOff)) tOff = lt
    }
    if (!tI1 && interviews.length > 0) tI1 = new Date(interviews[0].time).getTime()
    if (!tI2 && interviews.length > 1) tI2 = new Date(interviews[1].time).getTime()

    if (tApp && tI1 && tI1 >= tApp) {
      const d = Math.round(((tI1 - tApp) / DAY_MS) * 10) / 10
      if (d >= 0 && d <= 60) durations.appliedToI1.push(d)
    }
    if (tI1 && tI2 && tI2 >= tI1) {
      const d = Math.round(((tI2 - tI1) / DAY_MS) * 10) / 10
      if (d >= 0 && d <= 60) durations.i1ToI2.push(d)
    }
    if (tI2 && tOff && tOff >= tI2) {
      const d = Math.round(((tOff - tI2) / DAY_MS) * 10) / 10
      if (d >= 0 && d <= 60) durations.i2ToOffer.push(d)
    }
    if (tApp && tOff && tOff >= tApp) {
      const d = Math.round(((tOff - tApp) / DAY_MS) * 10) / 10
      if (d >= 0 && d <= 90) durations.fullCycle.push(d)
    }

    if (status === 'rejected') {
      const rejectLog = logs.slice().reverse().find(l => l.toStatus === 'rejected')
      const prev = rejectLog?.fromStatus || ''
      if (prev === 'applied' || (!prev && !passed.has('interview-1') && passed.has('applied'))) {
        rejectionBreakdown['简历初筛未通过']++
      } else if (prev === 'interview-1' || (!prev && passed.has('interview-1') && !passed.has('interview-2'))) {
        rejectionBreakdown['技术一面未通过']++
      } else if (prev === 'interview-2' || (!prev && passed.has('interview-2'))) {
        rejectionBreakdown['复试/终面未通过']++
      } else {
        rejectionBreakdown['意向阶段放弃']++
      }
    }

    const lastTime = job.statusUpdatedAt
      ? new Date(job.statusUpdatedAt).getTime()
      : (job.appliedAt ? new Date(job.appliedAt).getTime() : new Date(job.createdAt).getTime())
    const waitingDays = Math.floor((now - lastTime) / DAY_MS)

    if (status === 'applied' && waitingDays >= 7) {
      stagnantJobs.push({
        id: job.id,
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        salary: job.salary,
        platform: job.platform,
        applyStatus: 'applied',
        daysWaiting: waitingDays,
        riskLevel: waitingDays >= 14 ? 'danger' : 'warning',
        reason: waitingDays >= 14 ? `已投递 ${waitingDays} 天无进展（疑似停招/HR未活跃）` : `已投递 ${waitingDays} 天未响应，建议适时跟进`
      })
    } else if ((status === 'interview-1' || status === 'interview-2') && waitingDays >= 5) {
      stagnantJobs.push({
        id: job.id,
        jobId: job.jobId,
        title: job.title,
        companyName: job.companyName,
        salary: job.salary,
        platform: job.platform,
        applyStatus: status,
        daysWaiting: waitingDays,
        riskLevel: waitingDays >= 10 ? 'danger' : 'warning',
        reason: `面试流程已停留 ${waitingDays} 天未更新，建议主动向HR询问反馈`
      })
    }

    logs.forEach(l => {
      const ld = new Date(l.createdAt)
      const dayNr = (ld.getDay() + 6) % 7
      const mon = new Date(ld.getFullYear(), ld.getMonth(), ld.getDate() - dayNr)
      const k = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
      const item = weeklyMap.get(k)
      if (item) {
        if (l.toStatus === 'applied') item.applied++
        if (l.toStatus === 'interview-1' || l.toStatus === 'interview-2') item.interview++
        if (l.toStatus === 'offer') item.offer++
      }
    })
  }

  const sAppToI1 = calcAvg(durations.appliedToI1)
  const sI1ToI2 = calcAvg(durations.i1ToI2)
  const sI2ToOff = calcAvg(durations.i2ToOffer)
  const sFull = calcAvg(durations.fullCycle)

  const interviewRate = cumApplied > 0 ? Math.round((cumInterview1 / cumApplied) * 1000) / 10 : 0
  const interview2Rate = cumInterview1 > 0 ? Math.round((cumInterview2 / cumInterview1) * 1000) / 10 : 0
  const overallOfferRate = cumApplied > 0 ? Math.round((cumOffer / cumApplied) * 1000) / 10 : 0

  const funnelSteps = [
    { key: 'to-apply', name: '意向储备', count: cumToApply, current: currentDist['to-apply'] },
    { key: 'applied', name: '已发起投递', count: cumApplied, current: currentDist['applied'] },
    { key: 'interview-1', name: '初试/一面', count: cumInterview1, current: currentDist['interview-1'] },
    { key: 'interview-2', name: '复试/二面', count: cumInterview2, current: currentDist['interview-2'] },
    { key: 'offer', name: '斩获 Offer', count: cumOffer, current: currentDist['offer'] }
  ]

  stagnantJobs.sort((a, b) => b.daysWaiting - a.daysWaiting)

  return {
    kpi: {
      totalTracked: jobs.length,
      totalApplied: cumApplied,
      totalInterviews: cumInterview1,
      totalOffers: cumOffer,
      totalRejected: cumRejected,
      interviewRate,
      interview2Rate,
      overallOfferRate,
      avgDaysToInterview: sAppToI1.avg,
      avgCycleDays: sFull.avg
    },
    funnelSteps,
    currentDist,
    durations: [
      { stage: '投递 ➔ 首次约面', avgDays: sAppToI1.avg, count: sAppToI1.count, tip: '投递后至一面响应周期' },
      { stage: '一面 ➔ 二面推进', avgDays: sI1ToI2.avg, count: sI1ToI2.count, tip: '初试至复试流转周期' },
      { stage: '二面 ➔ 终面Offer', avgDays: sI2ToOff.avg, count: sI2ToOff.count, tip: '终试至正式发录用周期' },
      { stage: '全流程求职周期', avgDays: sFull.avg, count: sFull.count, tip: '从发起投递至最终落地' }
    ],
    rejectionBreakdown: Object.entries(rejectionBreakdown).map(([name, value]) => ({ name, value })),
    weeklyTimeline: Array.from(weeklyMap.values()),
    stagnantJobs: stagnantJobs.slice(0, 15)
  }
}

