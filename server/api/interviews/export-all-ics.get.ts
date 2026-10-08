import { getPrisma } from '#prisma'

function formatIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

function escapeIcsText(str: string): string {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export default defineEventHandler(async (event) => {
  const prisma = getPrisma(event)
  const now = new Date()

  // 默认导出所有未来待参加以及近7天内的面试
  const date7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const interviews = await prisma.interview.findMany({
    where: {
      time: { gte: date7dAgo }
    },
    orderBy: { time: 'asc' },
    include: {
      job: {
        select: {
          title: true,
          companyName: true,
          companyFullName: true,
          location: true
        }
      }
    }
  })

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Dashboard Local//All Interviews Schedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ]

  for (const interview of interviews) {
    const company = interview.job?.companyFullName || interview.job?.companyName || '目标企业'
    const title = interview.job?.title || '目标岗位'
    const startTime = new Date(interview.time)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)

    const summary = `【求职面试】${company} · ${interview.round} (${interview.type})`
    const description = [
      `岗位：${title}`,
      `公司：${company}`,
      `轮次：${interview.round}`,
      `形式：${interview.type}`,
      `会议信息/地点：${interview.note || '无'}`,
      interview.debrief ? `复盘：${interview.debrief}` : ''
    ].filter(Boolean).join('\n')

    const location = interview.type === '现场' ? (interview.note || interview.job?.location || '') : (interview.note || '线上视频会议')

    icsLines.push(
      'BEGIN:VEVENT',
      `UID:interview-${interview.id}@jobdashboard.local`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(startTime)}`,
      `DTEND:${formatIcsDate(endTime)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText(location)}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:面试开始前 30 分钟提醒',
      'END:VALARM',
      'END:VEVENT'
    )
  }

  icsLines.push('END:VCALENDAR')

  const icsContent = icsLines.join('\r\n')
  const filename = `all-upcoming-interviews-${new Date().toISOString().slice(0, 10)}.ics`

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)

  return icsContent
})
