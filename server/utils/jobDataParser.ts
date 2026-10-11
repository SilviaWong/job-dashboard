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

  const rangeMatch = str.match(/(\d+)-(\d+)年/)
  if (rangeMatch) {
    return {
      expMinYears: parseInt(rangeMatch[1], 10) || 0,
      expMaxYears: parseInt(rangeMatch[2], 10) || null
    }
  }

  if (str.includes('10年') || str.includes('十年')) {
    return { expMinYears: 10, expMaxYears: null }
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
 * 国家标准城市行政区划代码映射表 (GB/T 2260 6位代码)
 * 核心采集城市：上海 (310100)、杭州 (330100)、深圳 (440300)
 */
export const STANDARD_CITY_CODE_MAP: Record<string, string> = {
  // 核心三城
  '上海': '310100',
  '杭州': '330100',
  '深圳': '440300',

  // 直辖市
  '北京': '110100',
  '天津': '120100',
  '重庆': '500100',

  // 江苏省
  '南京': '320100',
  '无锡': '320200',
  '徐州': '320300',
  '常州': '320400',
  '苏州': '320500',
  '南通': '320600',
  '连云港': '320700',
  '淮安': '320800',
  '盐城': '320900',
  '扬州': '321000',
  '镇江': '321100',
  '泰州': '321200',
  '宿迁': '321300',

  // 浙江省 (除杭州外)
  '宁波': '330200',
  '温州': '330300',
  '嘉兴': '330400',
  '湖州': '330500',
  '绍兴': '330600',
  '金华': '330700',
  '衢州': '330800',
  '舟山': '330900',
  '台州': '331000',
  '丽水': '331100',

  // 广东省 (除深圳外)
  '广州': '440100',
  '韶关': '440200',
  '珠海': '440400',
  '汕头': '440500',
  '佛山': '440600',
  '江门': '440700',
  '湛江': '440800',
  '茂名': '440900',
  '肇庆': '441200',
  '惠州': '441300',
  '梅州': '441400',
  '汕尾': '441500',
  '河源': '441600',
  '阳江': '441700',
  '清远': '441800',
  '东莞': '441900',
  '中山': '442000',
  '潮州': '445100',
  '揭阳': '445200',
  '云浮': '445300',

  // 安徽省
  '合肥': '340100',
  '芜湖': '340200',
  '蚌埠': '340300',
  '淮南': '340400',
  '马鞍山': '340500',
  '淮北': '340600',
  '铜陵': '340700',
  '安庆': '340800',
  '黄山': '341000',
  '滁州': '341100',
  '阜阳': '341200',
  '宿州': '341300',
  '六安': '341500',
  '亳州': '341600',
  '池州': '341700',
  '宣城': '341800',

  // 福建省
  '福州': '350100',
  '厦门': '350200',
  '莆田': '350300',
  '三明': '350400',
  '泉州': '350500',
  '漳州': '350600',
  '南平': '350700',
  '龙岩': '350800',
  '宁德': '350900',

  // 江西省
  '南昌': '360100',
  '景德镇': '360200',
  '萍乡': '360300',
  '九江': '360400',
  '新余': '360500',
  '鹰潭': '360600',
  '赣州': '360700',
  '吉安': '360800',
  '宜春': '360900',
  '抚州': '361000',
  '上饶': '361100',

  // 山东省
  '济南': '370100',
  '青岛': '370200',
  '淄博': '370300',
  '枣庄': '370400',
  '东营': '370500',
  '烟台': '370600',
  '潍坊': '370700',
  '济宁': '370800',
  '泰安': '370900',
  '威海': '371000',
  '日照': '371100',
  '临沂': '371300',
  '德州': '371400',
  '聊城': '371500',
  '滨州': '371600',
  '菏泽': '371700',

  // 河南省
  '郑州': '410100',
  '开封': '410200',
  '洛阳': '410300',
  '平顶山': '410400',
  '安阳': '410500',
  '新乡': '410700',
  '焦作': '410800',
  '许昌': '411000',
  '南阳': '411300',
  '商丘': '411400',
  '信阳': '411500',
  '周口': '411600',
  '驻马店': '411700',

  // 湖北省
  '武汉': '420100',
  '黄石': '420200',
  '十堰': '420300',
  '宜昌': '420500',
  '襄阳': '420600',
  '鄂州': '420700',
  '荆门': '420800',
  '孝感': '420900',
  '荆州': '421000',
  '黄冈': '421100',
  '咸宁': '421200',

  // 湖南省
  '长沙': '430100',
  '株洲': '430200',
  '湘潭': '430300',
  '衡阳': '430400',
  '邵阳': '430500',
  '岳阳': '430600',
  '常德': '430700',
  '益阳': '430900',
  '郴州': '431000',
  '永州': '431100',
  '怀化': '431200',

  // 四川省
  '成都': '510100',
  '自贡': '510300',
  '泸州': '510500',
  '德阳': '510600',
  '绵阳': '510700',
  '乐山': '511100',
  '南充': '511300',
  '宜宾': '511500',

  // 陕西省
  '西安': '610100',
  '宝鸡': '610300',
  '咸阳': '610400',
  '渭南': '610500',
  '延安': '610600',
  '汉中': '610700',
  '榆林': '610800',

  // 河北省
  '石家庄': '130100',
  '唐山': '130200',
  '秦皇岛': '130300',
  '邯郸': '130400',
  '邢台': '130500',
  '保定': '130600',
  '张家口': '130700',
  '承德': '130800',
  '沧州': '130900',
  '廊坊': '131000',
  '衡水': '131100',

  // 辽宁省
  '沈阳': '210100',
  '大连': '210200',
  '鞍山': '210300',
  '抚顺': '210400',
  '本溪': '210500',
  '丹东': '210600',
  '锦州': '210700',
  '营口': '210800',

  // 其他省会及重点城市
  '太原': '140100',
  '呼和浩特': '150100',
  '长春': '220100',
  '哈尔滨': '230100',
  '南宁': '450100',
  '桂林': '450300',
  '柳州': '450200',
  '海口': '460100',
  '三亚': '460200',
  '贵阳': '520100',
  '昆明': '530100',
  '拉萨': '540100',
  '兰州': '620100',
  '西宁': '630100',
  '银川': '640100',
  '乌鲁木齐': '650100',
  '香港': '810000',
  '澳门': '820000',
  '台北': '710100'
}

/**
 * 各平台私有城市编码 -> 标准中文城市名 映射表
 * 用于当原始数据缺失中文城市名、仅有平台内部编码时兜底反查
 */
const BOSS_CITY_CODE_TO_NAME: Record<string, string> = {
  '101020100': '上海',
  '101210100': '杭州',
  '101280600': '深圳',
  '101010100': '北京',
  '101280100': '广州',
  '101190400': '苏州',
  '101190100': '南京',
  '101270100': '成都',
  '101200100': '武汉',
  '101040100': '重庆',
  '101030100': '天津',
  '101110100': '西安',
  '101120200': '青岛',
  '101220100': '合肥',
  '101221400': '六安',
  '101220500': '马鞍山',
  '101090200': '保定',
  '101090500': '唐山',
  '101091000': '邯郸',
  '101250500': '郴州',
  '101240700': '赣州',
  '101121300': '威海',
  '101210600': '台州',
  '101290100': '昆明',
  '101070200': '大连',
  '101230200': '厦门',
  '101230100': '福州',
  '101130100': '乌鲁木齐'
}

const JOB51_CITY_CODE_TO_NAME: Record<string, string> = {
  '020000': '上海',
  '080200': '杭州',
  '040000': '深圳',
  '010000': '北京',
  '030200': '广州',
  '070300': '苏州',
  '070200': '南京',
  '090200': '成都',
  '180200': '武汉',
  '060000': '重庆',
  '050000': '天津',
  '200200': '西安',
  '120300': '青岛',
  '150200': '合肥',
  '230500': '营口',
  '230300': '大连',
  '230200': '沈阳',
  '110200': '福州',
  '110300': '厦门'
}

const ZHILIAN_CITY_CODE_TO_NAME: Record<string, string> = {
  '538': '上海',
  '653': '杭州',
  '765': '深圳',
  '530': '北京',
  '763': '广州',
  '639': '苏州',
  '635': '南京',
  '801': '成都',
  '736': '武汉',
  '551': '重庆',
  '531': '天津',
  '854': '西安',
  '703': '青岛',
  '664': '合肥'
}

const LIEPIN_CITY_CODE_TO_NAME: Record<string, string> = {
  '020': '上海',
  '070020': '杭州',
  '050090': '深圳',
  '010': '北京',
  '050020': '广州',
  '060080': '苏州',
  '060020': '南京',
  '280020': '成都',
  '170020': '武汉',
  '040': '重庆',
  '030': '天津',
  '270020': '西安'
}

/**
 * 清洗并提取标准中文城市名（不含“市”后缀、不含区县商圈连字符）
 * 例如：
 * - "上海-浦东新区" -> "上海"
 * - "上海·徐汇区" -> "上海"
 * - "杭州市" -> "杭州"
 * - "深圳市-南山区" -> "深圳"
 */
export function normalizeCityName(rawCity?: string | null): string | null {
  if (!rawCity || typeof rawCity !== 'string') return null
  const trimmed = rawCity.trim()
  if (!trimmed || trimmed.includes('"') || trimmed.includes('{') || trimmed.includes('}') || trimmed.includes(']')) {
    return null
  }

  // 按常见分隔符（·、-、空格、/）拆分，取第一段城市部分
  const firstPart = trimmed.split(/[·\-\s/]+/).map(s => s.trim()).filter(Boolean)[0]
  if (!firstPart) return null

  if (
    firstPart === '未知' ||
    firstPart === '全国' ||
    firstPart === '不限' ||
    firstPart === '异地招聘' ||
    !/[\u4e00-\u9fa5]/.test(firstPart) ||
    /^(boss|boss直聘|51job|前程无忧|智联|智联招聘|猎聘|猎聘网)$/i.test(firstPart)
  ) {
    return null
  }

  // 去除末尾“市”字（如“上海市” -> “上海”）
  const clean = firstPart.length > 2 && firstPart.endsWith('市')
    ? firstPart.slice(0, -1)
    : firstPart

  return clean || null
}

/**
 * 从各平台原始 JSON 对象中按平台私有编码反查标准城市名
 */
function extractCityFromPlatformCode(rawJob: any, platform?: string): string | null {
  if (!rawJob || typeof rawJob !== 'object') return null
  const p = String(platform || rawJob.platform || rawJob['平台'] || '').toLowerCase()

  if (p.includes('boss')) {
    const locCode = String(rawJob.jobDetail?.zpData?.jobInfo?.location || rawJob.city || '')
    if (locCode && BOSS_CITY_CODE_TO_NAME[locCode]) {
      return BOSS_CITY_CODE_TO_NAME[locCode]
    }
  } else if (p.includes('51')) {
    const cityCode = String(
      rawJob.jobAreaLevelDetail?.cityCode ||
      rawJob.raw_detail_json?.detailJobInfo?.jobAreaLevelDetail?.cityCode ||
      rawJob.jobAreaCode ||
      ''
    )
    if (cityCode && JOB51_CITY_CODE_TO_NAME[cityCode]) {
      return JOB51_CITY_CODE_TO_NAME[cityCode]
    }
  } else if (p.includes('智联') || p.includes('zhilian')) {
    const cityId = String(
      rawJob.cityId ||
      rawJob.jobDetail?.detailedPosition?.positionCityId ||
      rawJob.jobDetail?.detailedPosition?.cityId ||
      rawJob.jobDetailData?.position?.workLocation?.positionCityId ||
      ''
    )
    if (cityId && ZHILIAN_CITY_CODE_TO_NAME[cityId]) {
      return ZHILIAN_CITY_CODE_TO_NAME[cityId]
    }
  } else if (p.includes('猎聘') || p.includes('liepin')) {
    const dqCode = String(rawJob.job?.dq || rawJob.dq || '')
    if (dqCode && LIEPIN_CITY_CODE_TO_NAME[dqCode]) {
      return LIEPIN_CITY_CODE_TO_NAME[dqCode]
    }
  }

  return null
}

/**
 * 根据标准城市名称（或平台原始数据）获取统一的 6 位国家标准城市代码 (GB/T 2260)
 * 上海 -> "310100", 杭州 -> "330100", 深圳 -> "440300"
 */
export function resolveCityCode(city?: string | null, rawJob?: any, platform?: string): string | null {
  const cleanCity = normalizeCityName(city) || extractCityFromPlatformCode(rawJob, platform)
  if (!cleanCity) return null
  return STANDARD_CITY_CODE_MAP[cleanCity] || null
}

/**
 * 统一解析标准城市名、国家标准城市代码 (cityCode) 与所属省份 (province)
 */
export function resolveStandardCity(
  rawCity?: string | null,
  rawJob?: any,
  platform?: string
): { city: string | null; cityCode: string | null; province: string | null } {
  let city = normalizeCityName(rawCity)

  if (!city && rawJob && typeof rawJob === 'object') {
    const p = String(platform || rawJob.platform || rawJob['平台'] || '').toLowerCase()
    if (p.includes('boss')) {
      city = normalizeCityName(
        rawJob.cityName ||
        rawJob.jobDetail?.zpData?.jobInfo?.locationName ||
        rawJob['工作地点'] ||
        rawJob.location
      )
    } else if (p.includes('51')) {
      city = normalizeCityName(
        rawJob.jobAreaLevelDetail?.cityString ||
        rawJob.raw_detail_json?.detailJobInfo?.jobAreaLevelDetail?.cityString ||
        rawJob.jobAreaString ||
        rawJob['工作地点'] ||
        rawJob.location
      )
    } else if (p.includes('智联') || p.includes('zhilian')) {
      city = normalizeCityName(
        rawJob.workCity ||
        rawJob.jobDetail?.detailedPosition?.positionWorkCity ||
        rawJob.jobDetail?.detailedPosition?.workCity ||
        rawJob.jobDeliverCache?.workCity ||
        rawJob['工作地点'] ||
        rawJob['工作城市'] ||
        rawJob.location
      )
    } else if (p.includes('猎聘') || p.includes('liepin')) {
      city = normalizeCityName(
        rawJob.job?.dqCityName ||
        rawJob.jobDetailJson?.jobLocation?.address?.addressRegion ||
        rawJob.job?.dq ||
        rawJob.jobDetailJson?.jobLocation?.address?.addressLocality ||
        rawJob['工作地点'] ||
        rawJob.location
      )
    } else {
      city = normalizeCityName(rawJob.city || rawJob.cityName || rawJob.workCity || rawJob['工作地点'] || rawJob.location)
    }

    if (!city) {
      city = extractCityFromPlatformCode(rawJob, platform)
    }
  }

  const cityCode = city ? (STANDARD_CITY_CODE_MAP[city] || null) : null
  const province = deriveProvince(city)

  return { city, cityCode, province }
}

/**
 * 根据城市推导直辖市或所属省份
 */
export function deriveProvince(city?: string | null): string | null {
  if (!city || typeof city !== 'string') return null
  const c = normalizeCityName(city) || city.trim()
  if (c.includes('北京')) return '北京'
  if (c.includes('上海')) return '上海'
  if (c.includes('天津')) return '天津'
  if (c.includes('重庆')) return '重庆'
  if (/广州|深圳|东莞|佛山|珠海|惠州|中山|江门|汕头|湛江|肇庆|茂名|揭阳|韶关|清远|阳江|梅州|河源|汕尾|潮州|云浮/.test(c)) return '广东'
  if (/杭州|宁波|温州|嘉兴|湖州|绍兴|金华|衢州|舟山|台州|丽水/.test(c)) return '浙江'
  if (/南京|苏州|无锡|常州|南通|徐州|连云港|淮安|盐城|扬州|镇江|泰州|宿迁/.test(c)) return '江苏'
  if (/成都|绵阳|德阳|宜宾|南充|泸州|乐山|自贡/.test(c)) return '四川'
  if (/武汉|襄阳|宜昌|荆州|黄冈|孝感|十堰|荆门|鄂州|黄石|咸宁/.test(c)) return '湖北'
  if (/长沙|株洲|湘潭|衡阳|岳阳|常德|郴州|邵阳|益阳|永州|怀化/.test(c)) return '湖南'
  if (/西安|咸阳|宝鸡|渭南|汉中|榆林|延安/.test(c)) return '陕西'
  if (/福州|厦门|泉州|漳州|莆田|宁德|龙岩|三明|南平/.test(c)) return '福建'
  if (/济南|青岛|烟台|潍坊|临沂|淄博|威海|济宁|泰安|日照|德州|聊城|滨州|菏泽|枣庄|东营/.test(c)) return '山东'
  if (/郑州|洛阳|南阳|许昌|周口|新乡|安阳|开封|焦作|平顶山|商丘|信阳|驻马店/.test(c)) return '河南'
  if (/合肥|芜湖|蚌埠|滁州|阜阳|马鞍山|六安|安庆|宿州|亳州|宣城|铜陵|淮南|淮北|池州|黄山/.test(c)) return '安徽'
  if (/沈阳|大连|鞍山|抚顺|本溪|营口|丹东|锦州/.test(c)) return '辽宁'
  if (/石家庄|唐山|保定|廊坊|沧州|邯郸|秦皇岛|邢台|张家口|承德|衡水/.test(c)) return '河北'
  if (/南昌|九江|赣州|宜春|吉安|上饶|景德镇|萍乡|新余|鹰潭|抚州/.test(c)) return '江西'
  if (/太原/.test(c)) return '山西'
  if (/昆明/.test(c)) return '云南'
  if (/贵阳/.test(c)) return '贵州'
  if (/南宁|桂林|柳州/.test(c)) return '广西'
  if (/海口|三亚/.test(c)) return '海南'
  if (/长春/.test(c)) return '吉林'
  if (/哈尔滨/.test(c)) return '黑龙江'
  if (/呼和浩特/.test(c)) return '内蒙古'
  if (/兰州/.test(c)) return '甘肃'
  if (/乌鲁木齐/.test(c)) return '新疆'
  if (/银川/.test(c)) return '宁夏'
  if (/西宁/.test(c)) return '青海'
  if (/拉萨/.test(c)) return '西藏'
  return null
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

