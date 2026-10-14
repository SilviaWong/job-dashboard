import { resolveJobHrActive } from './hrAnalytics'
import { resolveStandardCity } from './jobDataParser'

export interface NormalizedJobData {
  /** 职位链接 (Job URL) */
  jobUrl: string;
  /** 首发/发布日期 (Publish Date) */
  publishDate: string;
  /** 页面更新日期 (Update Date) */
  updateDate: string;
  /** 爬虫抓取日期 (Spider Fetch Date) */
  spiderDate: string;
  /** 所属行业 (Company Industry) */
  companyIndustry: string;
  /** 融资阶段 (Company Stage) */
  companyStage: string;
  /** 人员规模 (Company Scale) */
  companyScale: string;
  /** 公司或品牌名称 (Brand / Company Name) */
  brandName: string;
  /** 公司全称 (Company Full Name) */
  companyFullName: string;
  /** 公司ID */
  companyId: string;
  /** HR/招聘者姓名 (HR Name) */
  hrName: string;
  /** HR/招聘者职位 (HR Position) */
  hrPosition: string;
  /** hr/招聘者所属公司名称 (HR Company Name) */
  hrCompanyName: string;
  /** 福利待遇列表 (Welfare Tags) */
  welfareList: string[];
  /** 技能标签列表 (Skill Tags) */
  skills: string[];
  /** 职位ID (Job ID) */
  jobId: string;
  /** 职位名称 (Job Name) */
  jobName: string;
  /** 薪资范围 (Salary Range) */
  salaryRange: string;
  /** 职位描述 (Job Description) */
  jobDesc: string;
  /** 经验要求 (Experience Required) */
  experience: string;
  /** 学历要求 (Degree Required) */
  degree: string;
  /** 职位类型 (Job Type) */
  positionType: string;
  /** 职位标签 (Job Tags) */
  jobTags: string[];
  /** 城市 (City) */
  city: string;
  /** 统一国家标准城市代码 (GB/T 2260 City Code) */
  cityCode?: string;
  /** 区域 (Area) */
  area: string;
  /** 商圈 (Business District) */
  businessDistrict: string;
  /** 详细工作地址 (Work Address) */
  address: string;
  /** 是否外包或猎头 (Is Headhunter/Outsourcing) */
  isHeadhunter: boolean;
  /** 代招客户公司名称 (Client Company Name) */
  clientCompanyName: string;
  /** 代招客户公司所属行业 (Client Industry) */
  clientIndustry?: string;
  /** 代招客户公司规模 (Client Scale) */
  clientScale?: string;
  /** 代招客户公司融资阶段 (Client Stage) */
  clientStage?: string;
  /** 数据来源 (Source) */
  dataSource: string;
  /** 职位状态 (Job Status) */
  jobStatus: string;
  /** HR活跃状态 (HR Active Status) */
  hrActiveStatus?: string;
  /** HR活跃评级 (HR Active Level) */
  hrActiveLevel?: string;
}

/** 提取标签的通用工厂函数，根据传入的可能属性名来提取并去重 */
const createTagExtractor = (propNames: string[]) => (tagData: any): string[] => {
  const result = new Set<string>();
  const add = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(add);
    } else if (typeof val === 'object') {
      let matched = false;
      for (const prop of propNames) {
        if (val[prop]) {
          add(val[prop]);
          matched = true;
          break;
        }
      }
      if (!matched && typeof val.name === 'string') {
        add(val.name);
      }
    } else if (typeof val === 'string') {
      val.split(/[,，、|/]/).forEach(s => {
        const clean = s.trim();
        if (clean && clean !== '[object Object]') result.add(clean);
      });
    }
  };
  add(tagData);
  return Array.from(result);
};

const extractBossTags = createTagExtractor(['name']);
const extract51JobTags = createTagExtractor(['text', 'label', 'wordText']);
const extractZhilianTags = createTagExtractor(['name', 'value', 'itemValue', 'tag', 'label', 'typeName']);
const extractLiepinTags = createTagExtractor(['tagName', 'name', 'label']);
const extractFallbackTags = createTagExtractor(['name', 'label']);

/** 清洗 HTML 标签，转换为格式整齐、排版优美的纯文本 */
export function cleanHtmlText(text: any): string {
  if (!text) return '暂无描述';
  let str = String(text);

  // 1. 规范化换行符与转义字符
  str = str
    .replace(/\\r\\n|\\r|\\n/g, '\n')
    .replace(/\r\n|\r/g, '\n');

  // 2. 转换常见 HTML 换行与列表标签
  str = str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/?(ul|ol|div|h[1-6])[^>]*>/gi, '\n');

  // 3. 移除其它所有 HTML 标签
  str = str.replace(/<[^>]+>/g, '');

  // 4. 实体字符反转义
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 5. 逐行清理空格、合并孤立的 bullet 和序号
  const rawLines = str.split('\n');
  const cleanedLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;

    // 如果当前行仅仅是 bullet "•"、"-" 或 "·"
    if (line === '•' || line === '-' || line === '·') {
      // 寻找下一个非空行进行合并
      let nextIndex = i + 1;
      while (nextIndex < rawLines.length && !rawLines[nextIndex].trim()) {
        nextIndex++;
      }
      if (nextIndex < rawLines.length) {
        const nextContent = rawLines[nextIndex].replace(/[ \t]+/g, ' ').trim();
        if (nextContent) {
          // 如果下一行已经带有序号（如 1. 或 1、），则直接使用，无需加 •
          if (/^(\d+[\.、\)]|[一二三四五六七八九十]+[、\.])/.test(nextContent)) {
            cleanedLines.push(nextContent);
          } else {
            cleanedLines.push(`• ${nextContent}`);
          }
          i = nextIndex;
          continue;
        }
      }
      continue;
    }

    // 如果行首是 • 后面带有序号，去掉多余的 •
    if (/^•\s*(\d+[\.、\)]|[一二三四五六七八九十]+[、\.])/.test(line)) {
      line = line.replace(/^•\s*/, '');
    } else if (line.startsWith('•') && !line.startsWith('• ')) {
      line = '• ' + line.substring(1).trim();
    }

    cleanedLines.push(line);
  }

  // 6. 段落排版优化：在主要段落/标题前保留一个空行
  const formattedLines: string[] = [];
  const sectionKeywords = /^(岗位职责|任职要求|任职资格|职位要求|职位亮点|岗位要求|工作内容|加分项|福利待遇|我们提供|基本条件|软素质|其他要求|工作职责)[:：]?$/;

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];

    // 如果是小标题或主要段落，且前置非空行，增加一行空行增加层次感
    if (i > 0 && sectionKeywords.test(line)) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
    }

    formattedLines.push(line);
  }

  return formattedLines.join('\n') || '暂无描述';
}

/** Boss直聘适配器 */
function normalizeBossJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const boss_single = jobDetail || raw2 || raw?.boss_single_detail || raw || {};
  const jd = raw?.jobDetail?.zpData || boss_single?.jobDetail?.zpData || {};
  const info = jd.jobInfo || {};
  const boss = jd.bossInfo || {};
  const comp = jd.brandComInfo || {};

  const bossEncryptJobId = raw?.encryptJobId || info?.encryptId || boss_single['职位ID'] || job.jobId;

  const isHeadhunter = raw?.proxyJob === 1 || info?.proxyJob === 1 || !!(raw?.['岗位类型_外包猎头'] && String(raw['岗位类型_外包猎头']).includes('猎头')) || !!(boss_single['岗位类型_外包猎头'] && String(boss_single['岗位类型_外包猎头']).includes('猎头'));

  return {
    jobUrl: bossEncryptJobId ? `https://www.zhipin.com/job_detail/${bossEncryptJobId}.html` : '',
    publishDate: raw?.['发布时间'] || boss_single['发布时间'] || '',
    updateDate: boss_single['最后刷新时间'] || boss_single['精确更新时间'] || boss_single['页面更新时间'] || raw?.['最后刷新时间'] || raw?.['精确更新时间'] || raw?.['页面更新时间'] || '',
    spiderDate: raw?.['创建时间'] || boss_single['抓取时间'] || boss_single['创建时间'] || '',
    companyIndustry: isHeadhunter ? '人力资源服务' : (raw?.brandIndustry || comp.industryName || boss_single['公司行业'] || ''),
    companyStage: isHeadhunter ? '' : (raw?.brandStageName || comp.customerBrandStageName || comp.stageName || ''),
    companyScale: isHeadhunter ? '' : (raw?.brandScaleName || comp.scaleName || boss_single['公司规模'] || ''),
    brandName: !isHeadhunter ? (raw?.brandName || comp.brandName || comp.customerBrandName || boss_single['公司名称'] || '') : (boss.brandName || boss_single['HR所属公司'] || job.companyName || boss_single['HR职位'] || ''),
    companyFullName: !isHeadhunter ? (job?.companyFullName || boss_single['公司全称'] || raw?._fetched_companyFullName || raw?.['公司全称'] || raw?.brandName || comp.customerBrandName || comp.brandName || '') : (boss.brandName || boss_single['HR所属公司'] || job.companyName || ''),
    companyId: raw?.encryptBrandId || comp.encryptBrandId || boss_single['公司ID'] || boss.brandName || '',
    hrName: raw?.bossName || boss.name || boss_single['HR姓名'] || '',
    hrPosition: raw?.bossTitle || boss.title || boss_single['HR职位'] || '',
    hrCompanyName: boss.brandName || raw?.brandName || comp.brandName || comp.customerBrandName || boss_single['HR职位'] || '',
    welfareList: extractBossTags(raw?.welfareList || comp.labels || boss_single['公司福利']),
    skills: extractBossTags(raw?.skills || info.showSkills || boss_single['技能标签']),
    jobId: raw?.encryptJobId || info?.encryptId || boss_single['职位ID'] || job.jobId,
    jobName: raw?.jobName || info.jobName || boss_single['职位名称'] || job.jobName || '',
    salaryRange: raw?.salaryDesc || info.salaryDesc || boss_single['薪资待遇'] || '',
    jobDesc: cleanHtmlText(info.postDescription || boss_single['职位描述']),
    experience: raw?.jobExperience || info.experienceName || boss_single['工作经验'] || job.experience || '经验不限',
    degree: raw?.jobDegree || info.degreeName || boss_single['学历要求'] || job.degree || '学历不限',
    positionType: raw?.proxyJob || '',
    jobTags: extractBossTags(raw?.jobLabels),
    city: raw?.cityName || info.locationName || boss_single['工作地点'] || '',
    area: raw?.areaDistrict || '',
    businessDistrict: raw?.businessDistrict || '',
    address: info.address || boss_single['详细完整地址'] || '',
    isHeadhunter: isHeadhunter,
    clientCompanyName: isHeadhunter ? (raw?.brandName || comp.brandName || comp.customerBrandName || boss_single['客户公司'] || '') : '',
    clientIndustry: isHeadhunter ? (raw?.brandIndustry || comp.industryName || boss_single['公司行业'] || '') : '',
    clientScale: isHeadhunter ? (raw?.brandScaleName || comp.scaleName || boss_single['公司规模'] || '') : '',
    clientStage: isHeadhunter ? (raw?.brandStageName || comp.customerBrandStageName || comp.stageName || '') : '',
    dataSource: 'BOSS直聘',
    jobStatus: boss_single['招聘状态'] || job.status || '',
  };
}

/** 51job适配器 */
function normalize51Job(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const single = jobDetail || raw2 || {};
  const fallback = { ...(single || {}), ...(raw || {}) };
  const detail = raw?.raw_detail_json || single?.raw_detail_json || single || {};
  const info = detail.detailJobInfo || {};
  const hr = detail.jobHrInfo || {};
  const isHeadhunter = fallback.jobType === '1' || fallback.jobType === '2' || fallback.jobType === 1 || fallback.jobType === 2 || info.jobType === '1' || info.jobType === '2' || fallback.companyTypeString === '中介';
  const rawCoIndustry = fallback.coIndustryAllText || info.coIndustryAllText || [fallback.industryType1Str, fallback.industryType2Str].filter(Boolean).join(' ') || single['公司行业'] || '';
  const rawCoScale = fallback.companySizeString || single['公司规模'] || '';
  const rawCoStage = fallback.companyTypeString || single['企业类型'] || '';

  return {
    jobUrl: fallback.jobHref || info.jobHref || single['抓取源URL'] || '',
    publishDate: fallback.issueDateString || info.issueDate || single['发布时间'] || fallback['发布时间'] || fallback.confirmDateString || '',
    updateDate: fallback.updateDateTime || single['页面更新时间'] || fallback['页面更新时间'] || info.updateDateTime || fallback.confirmDateString || '',
    spiderDate: fallback['创建时间'] || fallback['抓取时间'] || single['抓取时间'] || '',
    companyIndustry: isHeadhunter ? '人力资源服务' : rawCoIndustry,
    companyStage: isHeadhunter ? '' : rawCoStage,
    companyScale: isHeadhunter ? '' : rawCoScale,
    brandName: fallback.companyName || info.coName || single['公司名称'] || fallback.companyFullName || job.companyName || '',
    companyFullName: fallback.companyFullName || single['公司全称'] || info.companyName || job.companyName || '',
    companyId: fallback.encCoId || single.encryCompanyId || single['公司ID'] || '',
    hrName: fallback.hrName || hr.hrName || single['HR姓名'] || '',
    hrPosition: fallback.hrPosition || hr.hrPosition || single['HR职位'] || '',
    hrCompanyName: fallback.fullCompanyName || fallback.companyName || job.companyName || '',
    welfareList: extract51JobTags(fallback.welfare || info.welfare || info.jobWelfareAllDataList || single['公司福利'] || []),
    skills: extract51JobTags(
      (info.jobKeywordList?.length ? info.jobKeywordList : null) ||
      info.jobKeywordString ||
      single['技能标签'] || []
    ),
    jobId: fallback.jobId || info.jobId || single['职位ID'] || job.jobId || '',
    jobName: fallback.jobName || info.jobName || single['职位名称'] || job.jobName || '',
    salaryRange: fallback.provideSalaryString || info.provideSalaryString || single['薪资待遇'] || '',
    jobDesc: cleanHtmlText(fallback.jobDescribe || info.jobDescribe || single['职位描述']),
    experience: fallback.workYearString || info.workYearString || single['工作经验'] || job.experience || '经验不限',
    degree: fallback.degreeString || info.degreeString || single['学历要求'] || job.degree || '学历不限',
    positionType: fallback.jobType || info.jobType || '',
    jobTags: extract51JobTags(
      (fallback.jobTags?.length ? fallback.jobTags : null) ||
      (info.jobTags?.length ? info.jobTags : null) || []
    ),
    city: fallback.jobAreaLevelDetail?.cityString || info.jobAreaLevelDetail?.cityString || fallback.jobAreaString || single['工作地点'] || '',
    area: fallback.jobAreaLevelDetail?.districtString || info.jobAreaLevelDetail?.districtString || '',
    businessDistrict: fallback.landMarkString || fallback.jobAreaLevelDetail?.landMarkString || info.jobAreaLevelDetail?.landMarkString || '',
    address: info.address || fallback._detail_address || info.companyAddress || single['详细完整地址'] || '',
    isHeadhunter: isHeadhunter,
    clientCompanyName: isHeadhunter ? (fallback.compName || info.compName || '') : '',
    clientIndustry: isHeadhunter ? rawCoIndustry : '',
    clientScale: isHeadhunter ? rawCoScale : '',
    clientStage: isHeadhunter ? rawCoStage : '',
    dataSource: '51job',
    jobStatus: single['招聘状态'] || job.status || '',
  };
}

/** 智联招聘适配器 */
function normalizeZhilianJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const single = jobDetail || raw2 || {};
  const fallback = { ...(single || {}), ...(raw || {}) };
  const jobDeliverCache = fallback.jobDeliverCache || raw2?.jobDeliverCache || {};
  const jobDetailData = fallback.jobDetailData || jobDeliverCache.jobDetailData || {};
  const position = jobDetailData.position || {};
  const base = position.base || {};
  const staff = jobDetailData.staff || fallback.staff || {};

  const jobDetailInfo = jobDetail?.jobDetail || jobDetail || raw2?.jobDetail || fallback.jobDetail || {};
  const detailedCompany = jobDetailInfo.detailedCompany || {};
  const detailedPosition = jobDetailInfo.detailedPosition || {};

  // 智联招聘中用于标识职位是公司直招还是猎头/代招
  // 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
  const jobType = fallback['职位类型'] || fallback.proxyModel?.recruitPosition || detailedPosition.recruitPosition || jobDeliverCache.proxyModel?.recruitPosition || 0

  let compName = ''
  let compfullName = ''

  if (jobType === 0 || jobType === '0') {
    compName = fallback['公司名称'] || detailedCompany.companyShotName || detailedCompany.companyName || fallback.companyName || jobDeliverCache.companyName || ''
    compfullName = fallback['公司全称'] || detailedCompany.companyName || fallback.companyName || jobDeliverCache.companyName || compName || ''
  } else {
    // 猎头
    compName = fallback['公司名称'] || staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || fallback.staff?.companyName || ''
    compfullName = fallback['公司全称'] || staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || fallback.staff?.companyName || compName || ''
  }

  // 提取薪资范围字符串
  let salaryStr = fallback['薪资待遇'] || fallback.salary60 || base.salary || jobDetailData.position?.base?.salary || detailedPosition.salary || fallback.salary || jobDeliverCache.salary60 || ''
  if (!salaryStr && (fallback.salaryReal || base.salaryReal)) {
    salaryStr = fallback.salaryReal || base.salaryReal
  }

  // 提取并解析地理位置
  let rawCity = fallback.workCity || detailedPosition.positionWorkCity || detailedPosition.workCity || jobDeliverCache.workCity || ''
  let rawDistrict = fallback.cityDistrict || detailedPosition.cityDistrict || detailedPosition.positionCityDistrict || jobDeliverCache.cityDistrict || ''
  const locationRaw = fallback['工作地点'] || fallback['工作城市'] || job.location || ''

  if ((!rawCity || !rawDistrict) && locationRaw) {
    if (locationRaw.includes('·')) {
      const parts = locationRaw.split('·').map((s: string) => s.trim()).filter(Boolean)
      if (!rawCity && parts[0]) rawCity = parts[0]
      if (!rawDistrict && parts[1]) rawDistrict = parts[1]
    } else if (locationRaw.includes(' ')) {
      const parts = locationRaw.split(/\s+/).map((s: string) => s.trim()).filter(Boolean)
      if (!rawCity && parts[0]) rawCity = parts[0]
      if (!rawDistrict && parts[1]) rawDistrict = parts[1]
    } else if (!rawCity) {
      rawCity = locationRaw
    }
  }

  // 提取详细地址
  let address = fallback['详细完整地址'] || jobDetailData.position?.workLocation?.workAddress || detailedPosition.workAddress || detailedPosition.workLocation?.workAddress || position.workLocation?.address || ''
  if (!address && fallback.cardCustomJson) {
    try {
      const parsedCustom = typeof fallback.cardCustomJson === 'string' ? JSON.parse(fallback.cardCustomJson) : fallback.cardCustomJson
      if (parsedCustom?.address) address = parsedCustom.address
    } catch (e) {}
  }

  // 提取福利待遇
  const welfareSet = new Set<string>()
  if (Array.isArray(fallback['公司福利'])) fallback['公司福利'].forEach((w: any) => w && welfareSet.add(String(w).trim()))
  if (typeof fallback['公司福利'] === 'string') fallback['公司福利'].split(/[,，、]/).forEach((w: any) => w.trim() && welfareSet.add(w.trim()))
  if (Array.isArray(fallback.welfareList)) fallback.welfareList.forEach((w: any) => w && welfareSet.add(String(w).trim()))
  if (Array.isArray(fallback.welfareTags)) fallback.welfareTags.forEach((w: any) => w && welfareSet.add(String(w).trim()))
  if (Array.isArray(detailedPosition.welfareTags)) detailedPosition.welfareTags.forEach((w: any) => w && welfareSet.add(String(w).trim()))
  if (Array.isArray(fallback.jobKnowledgeWelfareFeatures)) fallback.jobKnowledgeWelfareFeatures.forEach((w: any) => w && welfareSet.add(String(w).trim()))
  if (fallback.jobKeyword?.keywords && Array.isArray(fallback.jobKeyword.keywords)) {
    fallback.jobKeyword.keywords.forEach((k: any) => { if (k?.itemValue?.trim()) welfareSet.add(k.itemValue.trim()) })
  }
  if (jobDetailData.customAttributeInfo?.welfareItems && Array.isArray(jobDetailData.customAttributeInfo.welfareItems)) {
    jobDetailData.customAttributeInfo.welfareItems.forEach((w: any) => {
      const val = typeof w === 'string' ? w : (w?.itemValue || w?.name || w?.value)
      if (val?.trim()) welfareSet.add(val.trim())
    })
  }

  // 提取技能标签
  const rawSkills: any[] = []
  if (fallback['技能标签']) {
    rawSkills.push(fallback['技能标签'])
  }
  if (Array.isArray(fallback.jobSkillTags)) {
    rawSkills.push(...fallback.jobSkillTags)
  }
  if (fallback.skillLabel) {
    rawSkills.push(fallback.skillLabel)
  }
  if (detailedPosition.skillLabel) {
    rawSkills.push(detailedPosition.skillLabel)
  }
  if (Array.isArray(jobDetailData.position?.desc?.labels)) {
    rawSkills.push(...jobDetailData.position.desc.labels)
  }
  if (Array.isArray(detailedPosition.labels)) {
    rawSkills.push(...detailedPosition.labels)
  }

  const finalJobId = fallback['职位ID'] || fallback.jobId || fallback.number || base.positionNumber || jobDetailData.position?.base?.positionNumber || detailedPosition.number || detailedPosition.positionNumber || jobDeliverCache.number || ''

  return {
    jobUrl: fallback['职位链接'] || fallback['干净链接'] || fallback.positionURL || fallback.positionUrl || detailedPosition.positionUrl || (finalJobId ? `https://www.zhaopin.com/jobdetail/${finalJobId}.htm` : ''),
    publishDate: fallback['发布时间'] || fallback['发布日期'] || fallback.firstPublishTime || detailedPosition.positionPublishTime || fallback.publishTime || detailedPosition.publishTime || single['发布时间'] || fallback['页面更新时间'] || single['页面更新时间'] || '',
    updateDate: single['页面更新时间'] || single['更新时间'] || fallback['页面更新时间'] || fallback['更新时间'] || fallback.publishTime || detailedPosition.publishTime || detailedPosition.positionUpdateTimeText || '',
    spiderDate: fallback['创建时间'] || fallback['抓取时间'] || single['抓取时间'] || '',
    companyIndustry: Number(jobType) > 0 ? '人力资源服务' : (fallback['公司行业'] || fallback.industryName || detailedCompany.industryNameLevel || detailedCompany.industryLevel || detailedCompany.industryName || ''),
    companyStage: Number(jobType) > 0 ? '' : (fallback['融资阶段'] || fallback.financingStage?.name || detailedCompany.financingStageName || ''),
    companyScale: Number(jobType) > 0 ? '' : (fallback['公司规模'] || fallback.companySize || detailedCompany.companySize || detailedCompany.size || ''),
    brandName: job.companyName || compName || '',
    companyFullName: job.companyFullName || compfullName || compName || '',
    companyId: fallback['公司ID'] || fallback.companyNumber || detailedCompany.companyNumber || detailedPosition.companyNumber || jobDeliverCache.companyNumber || '',
    hrName: fallback['HR姓名'] || staff.staffName || fallback.staffCard?.staffName || jobDetailData.staff?.staffName || detailedPosition.staff?.staffName || '',
    hrPosition: fallback['HR职位'] || staff.hrJob || fallback.staffCard?.hrJob || jobDetailData.staff?.hrJob || detailedPosition.staff?.hrJob || '',
    hrCompanyName: staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || compName || '',
    welfareList: Array.from(welfareSet),
    skills: extractZhilianTags(rawSkills),
    jobId: String(finalJobId),
    jobName: fallback['职位名称'] || fallback.name || fallback.list_jobName || fallback.jobName || base.positionName || jobDetailData.position?.base?.positionName || detailedPosition.name || detailedPosition.positionName || base.name || jobDeliverCache.name || '',
    salaryRange: String(salaryStr),
    jobDesc: cleanHtmlText(fallback['职位描述'] || fallback.jobDesc || jobDetailData.position?.desc?.description || detailedPosition.description || detailedPosition.jobDesc),
    experience: fallback['工作经验'] || base.positionWorkingExp || fallback.workingExp || jobDetailData.position?.base?.positionWorkingExp || detailedPosition.positionWorkingExp || detailedPosition.workingExp || '经验不限',
    degree: fallback['学历要求'] || base.education || fallback.education || jobDetailData.position?.base?.education || detailedPosition.education || jobDeliverCache.education || '学历不限',
    positionType: String(jobType),
    jobTags: extractZhilianTags(fallback.showSkillTags || fallback.searchTagList || []),
    city: rawCity,
    area: rawDistrict,
    businessDistrict: fallback.streetName || position.workLocation?.streetName || detailedPosition.streetName || detailedPosition.tradingArea || '',
    address: address,
    isHeadhunter: Number(jobType) > 0,
    clientCompanyName: Number(jobType) > 0 ? (jobDetailData.companyProxy?.companyName || fallback.companyProxy?.companyName || detailedPosition.companyProxy?.companyName || '') : '',
    clientIndustry: Number(jobType) > 0 ? (fallback['公司行业'] || fallback.industryName || detailedCompany.industryNameLevel || detailedCompany.industryLevel || detailedCompany.industryName || '') : '',
    clientScale: Number(jobType) > 0 ? (fallback['公司规模'] || fallback.companySize || detailedCompany.companySize || detailedCompany.size || '') : '',
    clientStage: Number(jobType) > 0 ? (fallback['融资阶段'] || fallback.financingStage?.name || detailedCompany.financingStageName || '') : '',
    dataSource: '智联',
    jobStatus: fallback['招聘状态'] || job.status || '',
  };
}

/** 格式化猎聘列表中的 refreshTime (如 "20260729094430" -> "2026-07-29T09:44:30") */
function formatLiepinRefreshTime(val: any): string {
  if (!val) return ''
  const s = String(val).trim()
  const m14 = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (m14) {
    return `${m14[1]}-${m14[2]}-${m14[3]}T${m14[4]}:${m14[5]}:${m14[6]}`
  }
  const m8 = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m8) {
    return `${m8[1]}-${m8[2]}-${m8[3]}`
  }
  if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) {
    return s
  }
  return ''
}

/** 猎聘适配器 */
function normalizeLiepinJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const baseRaw = raw || {};
  const single = jobDetail || raw2 || {};
  const fallback = { ...baseRaw, ...single };
  const comp = baseRaw.comp || single.comp || {};
  const jobInfo = baseRaw.job || single.job || {};
  const baseJdJson = baseRaw.jobDetailJson || baseRaw.jobDetail || {};
  const singleJdJson = single.jobDetail || single.jobDetailJson || {};
  const jdJson = Object.keys(singleJdJson).length > 0 ? singleJdJson : baseJdJson;

  let hrCoName = ''
  const recruiterInfo = jdJson?.supplementalDomData?.recruiterInfo || baseJdJson?.supplementalDomData?.recruiterInfo
  if (Array.isArray(recruiterInfo) && recruiterInfo.length > 0) {
    const lastItem = recruiterInfo[recruiterInfo.length - 1]
    if (typeof lastItem === 'string') {
      hrCoName = lastItem.replace(/^·\s*/, '').trim()
    }
  }

  let compFullName = job.companyFullName || comp.fullCompanyName || single['公司全称'] || hrCoName || comp.compName || single['公司名称'] || ''

  const publishDate =
    baseJdJson.datePosted ||
    baseJdJson.supplementalDomData?.cambrianPubDate ||
    singleJdJson.datePosted ||
    singleJdJson.supplementalDomData?.cambrianPubDate ||
    single['发布时间'] ||
    baseRaw['发布时间'] ||
    ''

  const updateDate =
    single['最后刷新时间'] ||
    singleJdJson.supplementalDomData?.cambrianUpDate ||
    baseJdJson.supplementalDomData?.cambrianUpDate ||
    single['精确更新时间'] ||
    single['页面更新时间'] ||
    singleJdJson.supplementalDomData?.domUpdateTime ||
    baseJdJson.supplementalDomData?.domUpdateTime ||
    formatLiepinRefreshTime(jobInfo.refreshTime) ||
    ''

  const rawLocationStr = single['工作地点'] || jobInfo.dq || jdJson.jobLocation?.address?.addressLocality || ''
  let area = jobInfo.dqAreaName || ''
  if (!area && typeof rawLocationStr === 'string' && rawLocationStr.includes('-')) {
    const parts = rawLocationStr.split('-').map((s: string) => s.trim()).filter(Boolean)
    if (parts[1]) area = parts[1]
  }

  const isHeadhunter =
    String(jobInfo.jobKind) === '1' ||
    String(single.jobKind) === '1' ||
    single['岗位类型_外包猎头'] === '猎头/代招' ||
    fallback.isHeadhunter === true

  return {
    jobUrl: jobInfo.link || jdJson.url || baseJdJson.url || single['抓取源URL'] || '',
    publishDate,
    updateDate,
    spiderDate: baseRaw['创建时间'] || baseRaw['抓取时间'] || single['抓取时间'] || single['创建时间'] || '',
    companyIndustry: isHeadhunter ? '人力资源服务' : (jdJson.industry || baseJdJson.industry || comp.compIndustry || single['公司行业'] || ''),
    companyStage: isHeadhunter ? '' : (comp.compStage || jdJson.supplementalDomData?.companyExtraInfo?.['融资阶段'] || ''),
    companyScale: isHeadhunter ? '' : (comp.compScale || single['公司规模'] || jdJson.supplementalDomData?.companyExtraInfo?.['人数规模'] || ''),
    brandName: comp.fullCompanyName || single['公司名称'] || hrCoName || comp.compName || '',
    companyFullName: compFullName,
    companyId: comp.link?.match(/\/company\/(\d+)/)?.[1] || jdJson.hiringOrganization?.sameAs?.match(/\/company\/(\d+)/)?.[1] || single['公司ID'] || '',
    hrName: baseRaw.recruiter?.recruiterName || single['HR姓名'] || '',
    hrPosition: baseRaw.recruiter?.recruiterTitle || single['HR职位'] || '',
    hrCompanyName: comp.fullCompanyName || single['HR所属公司'] || hrCoName || comp.compName || '',
    welfareList: extractLiepinTags((jdJson.supplementalDomData?.welfareTags?.length ? jdJson.supplementalDomData.welfareTags : null) || single['公司福利'] || comp.compTags || []),
    skills: extractLiepinTags(jobInfo.labels || single['技能标签'] || []),
    jobId: jobInfo.jobId || jdJson.identifier?.value || baseJdJson.identifier?.value || fallback['职位ID'] || '',
    jobName: jobInfo.title || jdJson.title || baseJdJson.title || single['职位名称'] || '',
    salaryRange: jobInfo.salary || jdJson.supplementalDomData?.salary || baseJdJson.supplementalDomData?.salary || single['薪资待遇'] || '',
    jobDesc: cleanHtmlText(single['职位描述'] || jdJson.description || jdJson.supplementalDomData?.jobDescribe || baseJdJson.description || baseJdJson.supplementalDomData?.jobDescribe),
    experience: jobInfo.requireWorkYears || jdJson.experienceRequirements || baseJdJson.experienceRequirements || single['工作经验'] || '经验不限',
    degree: jobInfo.requireEduLevel || jdJson.educationRequirements || baseJdJson.educationRequirements || single['学历要求'] || '学历不限',
    positionType: jobInfo.jobKind || single.jobKind || '',
    jobTags: extractLiepinTags((fallback.jobTags?.length ? fallback.jobTags : null) || (jobInfo.jobTags?.length ? jobInfo.jobTags : null) || []),
    city: jobInfo.dqCityName || jdJson.jobLocation?.address?.addressRegion || baseJdJson.jobLocation?.address?.addressRegion || jobInfo.dq || single['工作地点'] || jdJson.jobLocation?.address?.addressLocality || '',
    area,
    businessDistrict: fallback.businessDistrict || jobInfo.businessDistrict || '',
    address: single['详细完整地址'] || jdJson.jobLocation?.address?.streetAddress || baseJdJson.jobLocation?.address?.streetAddress || '',
    isHeadhunter,
    clientCompanyName: isHeadhunter ? (comp.compName || jdJson.hiringOrganization?.name || fallback.clientCompanyName || '') : '',
    clientIndustry: isHeadhunter ? (jdJson.industry || baseJdJson.industry || comp.compIndustry || single['公司行业'] || '') : '',
    clientScale: isHeadhunter ? (comp.compScale || single['公司规模'] || jdJson.supplementalDomData?.companyExtraInfo?.['人数规模'] || '') : '',
    clientStage: isHeadhunter ? (comp.compStage || jdJson.supplementalDomData?.companyExtraInfo?.['融资阶段'] || '') : '',
    dataSource: '猎聘',
    jobStatus: single['招聘状态'] || job.status || '',
  };
}

/** 兜底混合适配器 */
function normalizeFallbackJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const fallback = raw || {};
  return {
    jobUrl: fallback['职位链接'] || fallback.jobUrl || fallback.url || '',
    publishDate: fallback['发布时间'] || fallback['发布日期'] || fallback.publishDate || '',
    updateDate: fallback['更新时间'] || fallback.updateDate || '',
    spiderDate: fallback['创建时间'] || fallback.spiderDate || '',
    companyIndustry: fallback['公司行业'] || fallback.companyIndustry || '未知',
    companyStage: fallback['融资阶段'] || fallback.companyStage || '未知',
    companyScale: fallback['公司规模'] || fallback.companyScale || '未知',
    brandName: fallback['公司全称'] || fallback.brandName || job.companyName || '未知',
    companyFullName: fallback['公司全称'] || fallback.companyName || job.companyName || '未知',
    companyId: fallback.companyId || '',
    hrName: fallback['HR姓名'] || fallback.hrName || '未知',
    hrPosition: fallback['HR职位'] || fallback.hrPosition || '未知',
    hrCompanyName: fallback['公司全称'] || fallback.companyName || job.companyName || '未知',
    welfareList: extractFallbackTags(fallback['公司福利'] || fallback.welfareList),
    skills: extractFallbackTags(fallback['技能标签'] || fallback.skills),
    jobId: fallback.positionId || fallback.jobId || job.jobId || '',
    jobName: fallback.name || job.jobName || '',
    salaryRange: fallback.salary || job.salary || '未知',
    jobDesc: cleanHtmlText(fallback['职位描述'] || fallback.jobDesc),
    experience: fallback['工作经验'] || fallback.experience || job.experience || '经验不限',
    degree: fallback['学历要求'] || fallback.degree || job.degree || '学历不限',
    positionType: fallback.jobType || job.positionType || '',
    jobTags: extractFallbackTags(fallback.jobTags || job.jobTags || []),
    city: fallback.city || job.city || '',
    area: fallback.area || job.area || '',
    businessDistrict: fallback.businessDistrict || job.businessDistrict || '',
    address: fallback['详细工作地址'] || fallback.address || '',
    isHeadhunter: false,
    clientCompanyName: fallback['代招客户公司名称'] || fallback.clientCompanyName || '',
    dataSource: '兜底',
    jobStatus: job.status || '',
  };
}

/**
 * 将原始职位数据清洗并映射为标准化格式
 * @param job 职位数据库记录基本信息
 * @param raw 职位原始 JSON 数据
 * @returns NormalizedJobData 清洗后的标准数据
 */
export function normalizeJobData(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  let result: NormalizedJobData;
  if (!raw) {
    result = normalizeFallbackJob(job, raw, companyInfo);
  } else {
    // 策略分发：根据平台调用专属适配器，支持中英文名称自动映射
    const p = String(job.platform || raw?.platform || '').toLowerCase()
    if (p.includes('boss')) {
      result = normalizeBossJob(job, raw, raw2, companyInfo, jobDetail);
    } else if (p.includes('51job') || p.includes('51')) {
      result = normalize51Job(job, raw, raw2, companyInfo, jobDetail);
    } else if (p.includes('智联') || p.includes('zhilian')) {
      result = normalizeZhilianJob(job, raw, raw2, companyInfo, jobDetail);
    } else if (p.includes('猎聘') || p.includes('liepin')) {
      result = normalizeLiepinJob(job, raw, raw2, companyInfo, jobDetail);
    } else {
      result = normalizeFallbackJob(job, raw, raw2, companyInfo, jobDetail);
    }
  }

  // 统一归一化城市名与国家标准 6 位城市代码 (GB/T 2260)
  const resolvedCity = resolveStandardCity(result.city || job?.city || job?.location, raw || raw2 || job, job?.platform || raw?.platform);
  if (resolvedCity.city) {
    result.city = resolvedCity.city;
  }
  result.cityCode = resolvedCity.cityCode || '';

  const hr = resolveJobHrActive(raw, jobDetail, job.platform);
  result.hrActiveStatus = job.hrActiveStatus || hr.hrActiveStatus || '';
  result.hrActiveLevel = job.hrActiveLevel || hr.hrActiveLevel || 'unknown';

  return result;
}
