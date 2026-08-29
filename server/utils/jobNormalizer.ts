import { resolveJobHrActive } from './hrAnalytics'

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
  /** 数据来源 (Source) */
  dataSource: string;
  /** 职位状态 (Job Status) */
  jobStatus: string;
  /** HR活跃状态 (HR Active Status) */
  hrActiveStatus?: string;
  /** HR活跃评级 (HR Active Level) */
  hrActiveLevel?: string;
}

/** 提取标签的通用工厂函数，根据传入的可能属性名来提取 */
const createTagExtractor = (propNames: string[]) => (tagData: any): string[] => {
  if (Array.isArray(tagData)) {
    return tagData.map(t => {
      if (typeof t === 'object' && t !== null) {
        for (const prop of propNames) {
          if (t[prop]) return String(t[prop]);
        }
      }
      return typeof t === 'string' ? t.trim() : String(t);
    }).filter(Boolean);
  }
  if (typeof tagData === 'string') {
    return tagData.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const extractBossTags = createTagExtractor(['name']);
const extract51JobTags = createTagExtractor(['text', 'label', 'wordText']);
const extractZhilianTags = createTagExtractor(['name', 'value', 'itemValue', 'tag', 'label']);
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
  const boss_single = jobDetail || raw?.boss_single_detail || raw || {};
  const jd = raw?.jobDetail?.zpData || {};
  const info = jd.jobInfo || {};
  const boss = jd.bossInfo || {};
  const comp = jd.brandComInfo || {};

  const bossEncryptJobId = raw?.encryptJobId || info?.encryptId || job.jobId;

  return {
    jobUrl: bossEncryptJobId ? `https://www.zhipin.com/job_detail/${bossEncryptJobId}.html` : '',
    publishDate: '',
    updateDate: boss_single['页面更新时间'] || boss_single['最后刷新时间'] || '',
    spiderDate: raw?.['创建时间'] || boss_single['抓取时间'] || '',
    companyIndustry: raw?.brandIndustry || comp.industryName || boss_single['公司行业'] || '',
    companyStage: raw?.brandStageName || comp.customerBrandStageName || comp.stageName || '',
    companyScale: raw?.brandScaleName || comp.scaleName || boss_single['公司规模'] || '',
    brandName: raw?.proxyJob === 0 ? (raw?.brandName || comp.brandName || comp.customerBrandName || boss_single['公司名称'] || '') : (boss.brandName || boss_single['HR职位'] || ''),
    companyFullName: raw?.proxyJob === 0 ? (job?.companyFullName || boss_single['公司全称'] || raw?._fetched_companyFullName || raw?.['公司全称'] || raw?.brandName || comp.customerBrandName || comp.brandName || '') : (job.companyFullName || boss.brandName || boss_single['HR职位'] || ''),
    companyId: raw?.encryptBrandId || comp.encryptBrandId || boss.brandName || '',
    hrName: raw?.bossName || boss.name || boss_single['HR姓名'] || '',
    hrPosition: raw?.bossTitle || boss.title || boss_single['HR职位'] || '',
    hrCompanyName: boss.brandName || raw?.brandName || comp.brandName || comp.customerBrandName || boss_single['HR职位'] || '',
    welfareList: extractBossTags(raw?.welfareList || comp.labels || boss_single['公司福利']),
    skills: extractBossTags(raw?.skills || info.showSkills || boss_single['技能标签']),
    jobId: raw?.encryptJobId || info?.encryptId || job.jobId,
    jobName: raw?.jobName || info.jobName || boss_single['职位名称'] || job.jobName || '',
    salaryRange: raw?.salaryDesc || info.salaryDesc || boss_single['薪资待遇'] || '',
    jobDesc: cleanHtmlText(info.postDescription || boss_single['职位描述']),
    experience: raw?.jobExperience || info.experienceName || boss_single['工作经验'] || job.experience || '经验不限',
    degree: raw?.jobDegree || info.degreeName || boss_single['学历要求'] || job.degree || '学历不限',
    positionType: raw?.proxyJob || '',
    jobTags: extractBossTags(raw?.jobLabels),
    city: raw?.cityName || info.locationName || '',
    area: raw?.areaDistrict || '',
    businessDistrict: raw?.businessDistrict || '',
    address: info.address || boss_single['详细完整地址'] || '',
    isHeadhunter: raw?.proxyJob === 1 || info?.proxyJob === 1,
    clientCompanyName: raw?.proxyJob === 1 ? (raw?.brandName || comp.customerBrandName || comp.brandName || '') : '',
    dataSource: 'BOSS直聘',
    jobStatus: boss_single['招聘状态'] || job.status || '',
  };
}

/** 51job适配器 */
function normalize51Job(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const fallback = raw || {};
  const detail = raw?.raw_detail_json || {};
  const info = detail.detailJobInfo || {};
  const hr = detail.jobHrInfo || {};
  return {
    jobUrl: fallback.jobHref || '',
    publishDate: fallback.issueDateString || info.issueDate || '',
    updateDate: fallback.updateDateTime || '',
    spiderDate: fallback['创建时间'] || fallback['抓取时间'] || '',
    companyIndustry: fallback.coIndustryAllText || info.coIndustryAllText || [fallback.industryType1Str, fallback.industryType2Str].filter(Boolean).join(' ') || '',
    companyStage: fallback.companyTypeString || '', // 51job typically provides company type instead of financing stage
    companyScale: fallback.companySizeString || '',
    brandName: fallback.companyName || info.coName || fallback.companyFullName || job.companyName || '',
    companyFullName: fallback.companyFullName || info.companyName || job.companyName || '',
    companyId: fallback.encCoId || '',
    hrName: fallback.hrName || hr.hrName || '',
    hrPosition: fallback.hrPosition || hr.hrPosition || '',
    hrCompanyName: fallback.fullCompanyName || fallback.companyName || job.companyName || '',
    welfareList: extract51JobTags(fallback.welfare || info.welfare || info.jobWelfareAllDataList || []),
    skills: extract51JobTags(
      (info.jobKeywordList?.length ? info.jobKeywordList : null) ||
      (info.jobKeywordList?.length ? info.jobKeywordList : null) ||
      info.jobKeywordString || []
    ),
    jobId: fallback.jobId || info.jobId || job.jobId || '',
    jobName: fallback.jobName || info.jobName || job.jobName || '',
    salaryRange: fallback.provideSalaryString || info.provideSalaryString || '',
    jobDesc: cleanHtmlText(fallback.jobDescribe || info.jobDescribe),
    experience: fallback.workYearString || info.workYearString || job.experience || '经验不限',
    degree: fallback.degreeString || info.degreeString || job.degree || '学历不限',
    positionType: fallback.jobType || info.jobType || '',
    jobTags: extract51JobTags(
      (fallback.jobTags?.length ? fallback.jobTags : null) ||
      (info.jobTags?.length ? info.jobTags : null) || []
    ),
    city: fallback.jobAreaLevelDetail?.cityString || info.jobAreaLevelDetail?.cityString || fallback.jobAreaString || '',
    area: fallback.jobAreaLevelDetail?.districtString || info.jobAreaLevelDetail?.districtString || '',
    businessDistrict: fallback.landMarkString || fallback.jobAreaLevelDetail?.landMarkString || info.jobAreaLevelDetail?.landMarkString || '',
    address: info.address || fallback._detail_address || info.companyAddress || '',
    isHeadhunter: fallback.jobType === '1' || fallback.jobType === '2' || fallback.companyTypeString === '中介',
    clientCompanyName: fallback.jobType === '1' || fallback.jobType === '2' ? fallback.compName : '',
    dataSource: '51job',
    jobStatus: job.status || '',
  };
}

/** 智联招聘适配器 */
function normalizeZhilianJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const fallback = raw || {};
  // const jd = fallback.jobDetailData || {};
  // const posBase = jd.position?.base || {};
  // const staff = jd.staff || {};

  // const rawData2 = raw2 || {};
  // const jobDeliverCache = rawData2.jobDeliverCache || {};
  const jobDetailData = fallback.jobDetailData || {};
  const position = jobDetailData.position || {};
  const base = position.base || {};
  const staff = jobDetailData.staff || {};

  const jobDetailInfo = fallback.jobDetail || {};
  const detailedCompany = jobDetailInfo.detailedCompany || {};
  const detailedPosition = jobDetailInfo.detailedPosition || {};

  // 智联招聘中用于标识职位是公司直招还是猎头/代招
  // 0: 公司直招, 1/2/3/4: 猎头/代招, 空: 公司直招
  let jobType = fallback.proxyModel?.recruitPosition || detailedPosition.recruitPosition || 0

  let compName = ''
  let compfullName = ''

  if (jobType === 0) {
    compName = fallback.companyName || detailedCompany.companyName || ''
    compfullName = fallback.companyName || detailedCompany.companyName || ''
  } else {
    // 猎头
    compName = staff.companyName || detailedPosition.staff?.companyName || ''
    compfullName = staff.companyName || detailedPosition.staff?.companyName || ''
  }


  return {
    jobUrl: fallback.positionUrl || detailedPosition.positionUrl || '',
    publishDate: fallback.firstPublishTime || detailedPosition.positionPublishTime || '',
    updateDate: fallback.publishTime || detailedPosition.publishTime || '',
    spiderDate: fallback['创建时间'] || fallback['抓取时间'] || '',
    companyIndustry: fallback.industryName || detailedCompany.industryNameLevel || detailedCompany.industryLevel || '',
    companyStage: fallback.financingStage?.name || detailedCompany.financingStageName || '',
    companyScale: fallback.companySize || detailedCompany.companySize || '',
    brandName: job.companyName || compName || '',
    companyFullName: job.companyFullName || compfullName || '',
    companyId: fallback.companyNumber || detailedCompany.companyNumber || detailedPosition.companyNumber || '',
    hrName: staff.staffName || fallback.staffCard?.staffName || jobDetailData.staff?.staffName || detailedPosition.staff?.staffName || '',
    hrPosition: staff.hrJob || fallback.staffCard?.hrJob || jobDetailData.staff?.hrJob || detailedPosition.staff?.hrJob || '',
    hrCompanyName: staff.companyName || jobDetailData.staff?.companyName || detailedPosition.staff?.companyName || '',
    welfareList: Array.from(new Set([
      // 来源于 fallback 的数据
      ...((fallback.jobKeyword?.keywords || []).map((k: any) => k?.itemValue).filter(Boolean)),
      ...(fallback.jobKnowledgeWelfareFeatures || [])

    ])),
    skills: extractZhilianTags(
      (fallback.jobSkillTags?.length ? fallback.jobSkillTags : null) ||
      fallback.skillLabel ||
      (jobDetailData.position?.desc?.labels?.length ? jobDetailData.position.desc.labels : null) ||
      (detailedPosition.labels?.length ? detailedPosition.labels : null) ||
      detailedPosition.skillLabel || []
    ),
    jobId: fallback.number || base.positionNumber || jobDetailData.position?.base?.positionNumber || detailedPosition.number || detailedPosition.positionNumber || '',
    jobName: fallback.name || fallback.list_name || base.positionName || jobDetailData.position?.base?.positionName || detailedPosition.name || detailedPosition.positionName || '',
    salaryRange: fallback.salary60 || base.salary || jobDetailData.position?.base?.salary || detailedPosition.salary || '',
    jobDesc: cleanHtmlText(jobDetailData.position?.desc?.description || detailedPosition.description || detailedPosition.jobDesc),
    experience: base.positionWorkingExp || fallback.workingExp || jobDetailData.position?.base?.positionWorkingExp || detailedPosition.positionWorkingExp || detailedPosition.workingExp || '经验不限',
    degree: base.education || fallback.education || jobDetailData.position?.base?.education || detailedPosition.education || '学历不限',
    positionType: jobType || '',
    jobTags: extractZhilianTags(fallback.showSkillTags || []),
    city: fallback.workCity || fallback.jobRootOrgInfo?.cityName || detailedPosition.positionWorkCity || detailedPosition.workCity || '',
    area: fallback.cityDistrict || detailedPosition.cityDistrict || detailedPosition.positionCityDistrict || '',
    businessDistrict: fallback.streetName || position.workLocation?.streetName || '',
    address: jobDetailData.position?.workLocation?.workAddress || detailedPosition.workAddress || '',
    isHeadhunter: jobType > 0 || false,
    clientCompanyName: jobDetailData.companyProxy?.companyName || detailedPosition.companyProxy?.companyName || '',
    dataSource: '智联',
    jobStatus: job.status || '',
  };
}

/** 猎聘适配器 */
function normalizeLiepinJob(job: any, raw: any, raw2: any, companyInfo?: any, jobDetail?: any): NormalizedJobData {
  const fallback = raw2 || raw || {};
  const comp = fallback.comp || {};
  const jobInfo = fallback.job || {};
  const jdJson = fallback.jobDetailJson || {};
  let hrCoName = ''
  const recruiterInfo = jdJson?.supplementalDomData?.recruiterInfo
  if (Array.isArray(recruiterInfo) && recruiterInfo.length > 0) {
    const lastItem = recruiterInfo[recruiterInfo.length - 1]
    if (typeof lastItem === 'string') {
      hrCoName = lastItem.replace(/^·\s*/, '').trim()
    }
  }

  let compFullName = job.companyFullName || comp.fullCompanyName || hrCoName || comp.compName || ''


  return {
    jobUrl: jobInfo.link || jdJson.url || '',
    publishDate: jdJson.datePosted || jdJson.supplementalDomData?.cambrianPubDate || '',
    updateDate: jdJson.supplementalDomData?.cambrianUpDate || jdJson.supplementalDomData?.domUpdateTime || '',
    spiderDate: fallback['创建时间'] || fallback['抓取时间'] || '',
    companyIndustry: jdJson.industry || comp.compIndustry || '',
    companyStage: comp.compStage || '',
    companyScale: comp.compScale || '',
    brandName: comp.fullCompanyName || hrCoName || comp.compName || '',
    companyFullName: compFullName,
    companyId: comp.link?.match(/\/company\/(\d+)/)?.[1] || jdJson.hiringOrganization?.sameAs?.match(/\/company\/(\d+)/)?.[1] || '',
    hrName: fallback.recruiter?.recruiterName || '',
    hrPosition: fallback.recruiter?.recruiterTitle || '',
    hrCompanyName: comp.fullCompanyName || hrCoName || comp.compName || '',
    welfareList: extractLiepinTags((jdJson.supplementalDomData?.welfareTags?.length ? jdJson.supplementalDomData.welfareTags : null) || comp.compTags || []),
    skills: extractLiepinTags(jobInfo.labels || []),
    jobId: jobInfo.jobId || jdJson.identifier?.value || fallback['职位ID'] || '',
    jobName: jobInfo.title || jdJson.title || '',
    salaryRange: jobInfo.salary || jdJson.salary || '',
    jobDesc: cleanHtmlText(jdJson.description || jdJson.supplementalDomData?.jobDescribe),
    experience: jobInfo.requireWorkYears || jdJson.experienceRequirements || '经验不限',
    degree: jobInfo.requireEduLevel || jdJson.educationRequirements || '学历不限',
    positionType: jobInfo.jobKind || '',
    jobTags: extractLiepinTags((fallback.jobTags?.length ? fallback.jobTags : null) || (jobInfo.jobTags?.length ? jobInfo.jobTags : null) || []),
    city: jobInfo.dqCityName || jdJson.jobLocation?.address?.addressLocality || jobInfo.dq || '',
    area: jobInfo.dqAreaName || '',
    businessDistrict: fallback.businessDistrict || jobInfo.businessDistrict || '',
    address: jdJson.jobLocation?.address?.streetAddress || jdJson.jobLocation?.address?.addressLocality || jobInfo.dq || '',
    isHeadhunter: String(jobInfo.jobKind) === '1',
    clientCompanyName: jobInfo.jobKind === '1' ? (comp.compName || jdJson.hiringOrganization?.name) : '',
    dataSource: '猎聘',
    jobStatus: job.status || '',
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
    // 策略分发：根据平台调用专属适配器
    switch (job.platform) {
      case 'Boss直聘':
        result = normalizeBossJob(job, raw, raw2, companyInfo, jobDetail);
        break;
      case '51job':
        result = normalize51Job(job, raw, raw2, companyInfo, jobDetail);
        break;
      case '智联':
        result = normalizeZhilianJob(job, raw, raw2, companyInfo, jobDetail);
        break;
      case '猎聘':
        result = normalizeLiepinJob(job, raw, raw2, companyInfo, jobDetail);
        break;
      default:
        result = normalizeFallbackJob(job, raw, raw2, companyInfo, jobDetail);
        break;
    }
  }

  const hr = resolveJobHrActive(raw, jobDetail, job.platform);
  result.hrActiveStatus = job.hrActiveStatus || hr.hrActiveStatus || '';
  result.hrActiveLevel = job.hrActiveLevel || hr.hrActiveLevel || 'unknown';

  return result;
}
