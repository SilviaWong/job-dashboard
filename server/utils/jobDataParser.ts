/**
 * 结构化数据解析工具
 * 用于在入库或清洗阶段，将非结构化字符串（薪资、工作经验、地理位置、标签等）转换为数值型和标准字段
 */

export interface ParsedSalary {
  salaryMin: number | null
  salaryMax: number | null
  salaryAvg: number | null
  salaryMonths: number
}

export interface ParsedExperience {
  expMinYears: number
  expMaxYears: number | null
}

/**
 * 解析薪资字符串为统一的千元/月 (K/月) 数值
 * 样例支持：
 * - "15-25K·14薪" -> min: 15, max: 25, avg: 20, months: 14
 * - "20-35K" -> min: 20, max: 35, avg: 27.5, months: 12
 * - "1.5-2.5万" -> min: 15, max: 25, avg: 20, months: 12
 * - "20-30万/年" -> min: 16.67, max: 25, avg: 20.83, months: 12
 * - "300-500元/天" -> min: 6.6, max: 11, avg: 8.8, months: 12
 * - "5000-8000元/月" -> min: 5, max: 8, avg: 6.5, months: 12
 * - "面议" -> null
 */
export function parseSalaryRange(salaryStr?: string | null): ParsedSalary {
  const result: ParsedSalary = {
    salaryMin: null,
    salaryMax: null,
    salaryAvg: null,
    salaryMonths: 12
  }

  if (!salaryStr || typeof salaryStr !== 'string') {
    return result
  }

  const str = salaryStr.trim().toUpperCase()
  if (!str || str.includes('面议') || str === '0') {
    return result
  }

  // 1. 提取薪期（如 14薪、16薪）
  const monthsMatch = str.match(/(?:[·\s]|^)(\d{2})薪/)
  if (monthsMatch) {
    result.salaryMonths = parseInt(monthsMatch[1], 10) || 12
  }

  let min = 0
  let max = 0

  // 2. K 单位解析 (如: 15-25K, 20K)
  const kRangeMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*K/i)
  if (kRangeMatch) {
    min = parseFloat(kRangeMatch[1])
    max = parseFloat(kRangeMatch[2])
  } else {
    const singleKMatch = str.match(/^(\d+(?:\.\d+)?)\s*K/i)
    if (singleKMatch) {
      min = max = parseFloat(singleKMatch[1])
    }
  }

  // 3. 万 单位解析 (如: 1.5-2.5万, 20-30万/年)
  if (min === 0 && max === 0) {
    const isAnnual = str.includes('/年') || str.includes('年薪') || str.includes('万/年')
    const wRangeMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*万/)
    if (wRangeMatch) {
      const rawMin = parseFloat(wRangeMatch[1])
      const rawMax = parseFloat(wRangeMatch[2])
      if (isAnnual || rawMin >= 10) {
        // 年薪模式：如 20-30万/年 或 10-20万，换算为每月千元
        const months = result.salaryMonths || 12
        min = Number(((rawMin * 10) / months).toFixed(2))
        max = Number(((rawMax * 10) / months).toFixed(2))
      } else {
        // 月薪模式：如 1.5-2.5万/月，1万 = 10K
        min = Number((rawMin * 10).toFixed(2))
        max = Number((rawMax * 10).toFixed(2))
      }
    } else {
      const singleWMatch = str.match(/^(\d+(?:\.\d+)?)\s*万/)
      if (singleWMatch) {
        const raw = parseFloat(singleWMatch[1])
        if (isAnnual || raw >= 10) {
          const months = result.salaryMonths || 12
          min = max = Number(((raw * 10) / months).toFixed(2))
        } else {
          min = max = Number((raw * 10).toFixed(2))
        }
      }
    }
  }

  // 4. 元/天 单位解析 (如: 200-400元/天, 按每月22个工作日折算为千元/月)
  if (min === 0 && max === 0) {
    const dRangeMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*元\/天/)
    if (dRangeMatch) {
      min = Number(((parseFloat(dRangeMatch[1]) * 22) / 1000).toFixed(2))
      max = Number(((parseFloat(dRangeMatch[2]) * 22) / 1000).toFixed(2))
    } else {
      const singleDMatch = str.match(/(\d+(?:\.\d+)?)\s*元\/天/)
      if (singleDMatch) {
        min = max = Number(((parseFloat(singleDMatch[1]) * 22) / 1000).toFixed(2))
      }
    }
  }

  // 5. 元/月 单位解析 (如: 6000-8000元/月, 8000元)
  if (min === 0 && max === 0) {
    const mRangeMatch = str.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*(?:元(?:\/月)?|元)/)
    if (mRangeMatch) {
      min = Number((parseFloat(mRangeMatch[1]) / 1000).toFixed(2))
      max = Number((parseFloat(mRangeMatch[2]) / 1000).toFixed(2))
    } else {
      const singleMMatch = str.match(/(\d+(?:\.\d+)?)\s*元(?:\/月)?/)
      if (singleMMatch) {
        min = max = Number((parseFloat(singleMMatch[1]) / 1000).toFixed(2))
      }
    }
  }

  if (min > 0 || max > 0) {
    result.salaryMin = min
    result.salaryMax = max
    result.salaryAvg = Number(((min + max) / 2).toFixed(2))
  }

  return result
}

/**
 * 解析经验要求为结构化年限范围
 * 样例支持：
 * - "3-5年" -> minYears: 3, maxYears: 5
 * - "1-3年" -> minYears: 1, maxYears: 3
 * - "5-10年" -> minYears: 5, maxYears: 10
 * - "10年以上" -> minYears: 10, maxYears: null
 * - "1年以内" -> minYears: 0, maxYears: 1
 * - "应届生" / "在校" -> minYears: 0, maxYears: 0
 * - "不限" -> minYears: 0, maxYears: null
 */
export function parseExperienceYears(expStr?: string | null): ParsedExperience {
  if (!expStr || typeof expStr !== 'string') {
    return { expMinYears: 0, expMaxYears: null }
  }

  const str = expStr.trim()
  if (str.includes('应届') || str.includes('实习') || str.includes('在校')) {
    return { expMinYears: 0, expMaxYears: 0 }
  }

  if (str.includes('10年') || str.includes('十年')) {
    return { expMinYears: 10, expMaxYears: null }
  }

  const rangeMatch = str.match(/(\d+)-(\d+)年/)
  if (rangeMatch) {
    return {
      expMinYears: parseInt(rangeMatch[1], 10) || 0,
      expMaxYears: parseInt(rangeMatch[2], 10) || null
    }
  }

  const singleUnderMatch = str.match(/(\d+)年以内/)
  if (singleUnderMatch) {
    return {
      expMinYears: 0,
      expMaxYears: parseInt(singleUnderMatch[1], 10) || 1
    }
  }

  const singleAboveMatch = str.match(/(\d+)年以上/)
  if (singleAboveMatch) {
    return {
      expMinYears: parseInt(singleAboveMatch[1], 10) || 1,
      expMaxYears: null
    }
  }

  const singleYearMatch = str.match(/(\d+)年/)
  if (singleYearMatch) {
    const yr = parseInt(singleYearMatch[1], 10) || 0
    return {
      expMinYears: yr,
      expMaxYears: yr
    }
  }

  return { expMinYears: 0, expMaxYears: null }
}

/**
 * 数组安全转 JSON 字符串
 */
export function safeStringifyArray(arr?: any[] | null): string | null {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return null
  }
  const cleanArr = arr.map(i => (typeof i === 'string' ? i.trim() : String(i))).filter(Boolean)
  return cleanArr.length > 0 ? JSON.stringify(cleanArr) : null
}
