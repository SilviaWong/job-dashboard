import { cleanCompanyName, type CompanyProcessor } from './types'

/**
 * 处理并持久化从【猎聘】平台同步过来的公司数据
 * 
 * 核心逻辑与数据流设计：
 * 1. 字段清洗与规范化：
 *    - 提取 `compName` / `compFullName` / `compId`；
 *    - 调用 `cleanCompanyName` 将中文括号（‘（’、‘）’）统一替换为英文括号（‘(’、‘)’），并去除所有空格。
 * 2. 统一存储位置与来源判断：
 *    - 将完整企业信息对象序列化后存入 `Company.rawData2` 字段。
 *    - `liepin_companies_db_v1`（列表来源）：若已有 rawData2 则跳过不更新。
 *    - `liepin_company_details`（主页详情）：强制刷新 rawData2 为全量详情数据。
 * 3. 多维度去重与查找：
 *    - 优先按 `companyId` + `sourcePlatform`（'猎聘'）查找已有企业；
 *    - 若无 ID 则按 `companyFullName` 或 `companyName` + `sourcePlatform` 进行匹配。
 * 4. 职位数据双向联动：
 *    - 获取到官方全称（`companyFullName`）后，同步更新 `Job` 表中属于该企业的全部职位。
 * 
 * @param company 从猎聘提取的原始公司数据对象（liepin_companies_db_v1 或 liepin_company_details）
 * @param platform 平台标识符（如 'liepin' 或 '猎聘'）
 * @param prisma Prisma 数据库客户端实例
 */
export const processLiepinCompany: CompanyProcessor = async (company, platform, prisma) => {

  // =========================================================================
  // 第一步：字段规范化提取（简称、全称、公司ID，并自动处理 Unicode 转码、括号与去空格）
  // =========================================================================
  let cName = company.compName || company['公司名称'] || company.companyName || company['公司简称'] || ''
  let cFullName = company.compFullName || company['公司全称'] || company.companyFullName || cName || ''
  let companyId = company.compId || company['公司ID'] || company.companyId || ''

  cName = cleanCompanyName(cName)
  cFullName = cleanCompanyName(cFullName)
  companyId = String(companyId).trim()

  // 统一平台标识为中文“猎聘”
  const standardizedPlatform = (platform === 'liepin' || platform === '猎聘') ? '猎聘' : platform
  const stringifiedData = JSON.stringify(company)
  const createdAt = new Date()
  const updatedAt = new Date()

  // 若没有有效的公司名称、全称及ID，则视为无效数据，直接跳过
  if (!cName && !companyId && !cFullName) {
    return
  }

  // =========================================================================
  // 第二步：识别数据来源类型
  // =========================================================================
  // 1. liepin_company_details（来自企业详情主页） -> 权重高，强制更新
  // 2. liepin_companies_db_v1（来自列表/常规检索） -> 权重低，若已有 rawData2 则跳过
  const dataSource = String(company.dataSource || company['数据来源'] || '').trim()
  const isDetailSource = dataSource === 'liepin_company_details' ||
    dataSource === 'liepin_company_page' ||
    Boolean(company.businessInfo || company.products)

  // =========================================================================
  // 第三步：查询数据库中是否已有该企业记录
  // =========================================================================
  let existingCompany = null

  // 3.1 优先通过公司ID精确查找
  if (companyId) {
    existingCompany = await prisma.company.findFirst({
      where: { companyId: String(companyId), sourcePlatform: standardizedPlatform }
    })
  }

  // 3.2 若按ID未找到，则通过公司全称或公司简称查找匹配
  if (!existingCompany && (cFullName || cName)) {
    existingCompany = await prisma.company.findFirst({
      where: {
        sourcePlatform: standardizedPlatform,
        OR: [
          ...(cFullName ? [{ companyFullName: cFullName }] : []),
          ...(cName ? [{ companyName: cName }] : [])
        ]
      }
    })
  }

  // =========================================================================
  // 第四步：执行更新或插入逻辑
  // =========================================================================
  if (existingCompany) {
    // -----------------------------------------------------------------------
    // 分支 A：公司记录已存在
    // 1. 来源是普通列表 liepin_companies_db_v1：
    //    若 rawData2 字段已经有值，则不操作（不更新，直接跳过）；
    //    若 rawData2 字段为空，才补齐更新。
    // 2. 来源是企业详情 liepin_company_details：
    //    强制更新 rawData2 为最新的全量详情数据，并更新全称与ID。
    // -----------------------------------------------------------------------
    if (!isDetailSource && existingCompany.rawData2) {
      // 来源是 liepin_companies_db_v1，且已有 rawData2，跳过不更新
      // console.log(`[Liepin Company Processor] 来源为 ${dataSource || 'liepin_companies_db_v1'}，企业 [${existingCompany.companyName}] 已存在且 rawData2 不为空，跳过更新`)
    } else {
      await prisma.company.update({
        where: { id: existingCompany.id },
        data: {
          rawData2: stringifiedData,
          companyId: companyId || existingCompany.companyId,
          companyFullName: cFullName || existingCompany.companyFullName,
          companyName: cName || existingCompany.companyName,
          updatedAt: updatedAt
        }
      })
    }
  } else if (cName || cFullName) {
    // -----------------------------------------------------------------------
    // 分支 B：公司记录不存在 -> 执行 CREATE 新增
    // -----------------------------------------------------------------------
    try {
      await prisma.company.create({
        data: {
          companyName: cName || cFullName,
          companyFullName: cFullName || cName,
          sourcePlatform: standardizedPlatform,
          companyId: companyId,
          createdAt: createdAt,
          updatedAt: updatedAt,
          rawData2: stringifiedData
        }
      })
    } catch (createErr: any) {
      // 处理唯一索引冲突异常（P2002），防止并发写入时报错
      if (createErr.code === 'P2002') {
        const newlyCreated = await prisma.company.findFirst({
          where: {
            sourcePlatform: standardizedPlatform,
            OR: [
              ...(cFullName ? [{ companyFullName: cFullName }] : []),
              ...(cName ? [{ companyName: cName }] : [])
            ]
          }
        })
        if (newlyCreated) {
          if (!isDetailSource && newlyCreated.rawData2) {
            // 已有 rawData2 且来源为列表，跳过
          } else {
            await prisma.company.update({
              where: { id: newlyCreated.id },
              data: {
                rawData2: stringifiedData,
                companyId: companyId || newlyCreated.companyId,
                companyFullName: cFullName || newlyCreated.companyFullName,
                companyName: cName || newlyCreated.companyName,
                updatedAt: updatedAt
              }
            })
          }
        }
      } else {
        throw createErr
      }
    }
  }

  // =========================================================================
  // 第五步：双向同步 Job 表中的职位企业全称（companyFullName）
  // =========================================================================
  if (cFullName) {
    const orConditions: any[] = []
    if (companyId) {
      orConditions.push({ companyId: String(companyId) })
    }
    if (cName) {
      orConditions.push({ companyName: cName })
    }

    if (orConditions.length > 0) {
      await prisma.job.updateMany({
        where: {
          platform: standardizedPlatform,
          OR: orConditions
        },
        data: {
          companyFullName: cFullName,
          updatedAt: updatedAt
        }
      })
    }
  }
}


