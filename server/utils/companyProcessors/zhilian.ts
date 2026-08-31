import { cleanCompanyName, type CompanyProcessor, extractCompanyMetadata } from './types'

/**
 * 处理并持久化从【智联招聘】平台同步过来的公司数据
 * 
 * 核心逻辑与数据流设计：
 * 1. 字段清洗与规范化：
 *    - 优先从工商信息（businessInformation.businessInformationData）中提取注册名称作为公司名称与全称；
 *    - 调用 `cleanCompanyName` 将中文括号（‘（’、‘）’）统一替换为英文括号（‘(’、‘)’），并去除所有空格。
 * 2. 统一存储位置：
 *    - 将完整的原始对象序列化后存入 `Company.rawData2` 字段。
 * 3. 多维度去重与查找：
 *    - 优先按 `companyId`（智联 companyNumber）+ `sourcePlatform` 查找已有企业；
 *    - 若无 ID 则按 `companyName` + `sourcePlatform` 匹配。
 * 4. 职位数据双向联动：
 *    - 获取到官方全称（`companyFullName`）后，同步更新 `Job` 表中属于该企业的全部职位。
 * 
 * @param company 从智联招聘接口/页面提取的原始公司数据对象
 * @param platform 平台标识符（如 'zhilian' 或 '智联招聘'）
 * @param prisma Prisma 数据库客户端实例
 */
export const processZhilianCompany: CompanyProcessor = async (company, platform, prisma) => {

  // =========================================================================
  // 第一步：字段规范化提取（公司名称、公司全称、公司ID）
  // =========================================================================
  const bussinessInfo = company.businessInformation?.businessInformationData || {}

  // 优先取工商注册名 registeredName，其次取接口返回的 companyName / name
  let cName = bussinessInfo.registeredName || company.companyName || company.name || ''
  let cFullName = bussinessInfo.registeredName || company.companyName || company.name || cName || ''
  const companyId = company.companyNumber || company.compId || company.companyId || ''

  // 统一清洗：解码 Unicode、替换中文括号为英文括号、去除所有空格
  cName = cleanCompanyName(cName)
  cFullName = cleanCompanyName(cFullName)
  // companyId = String(companyId).trim()

  // 统一平台标识为中文“智联招聘”
  const standardizedPlatform = platform === 'zhilian' ? '智联招聘' : platform
  const rawData = company.rawData || company
  const stringifiedData = JSON.stringify(rawData)
  const createdAt = new Date()
  const updatedAt = new Date()

  // 若没有有效的公司名称及ID，则视为无效数据，直接跳过
  if (!cName && !companyId) {
    return
  }

  // =========================================================================
  // 第二步：查询数据库中是否已有该企业记录
  // =========================================================================
  let existingCompany = null

  // 2.1 优先通过公司ID精确查找
  if (companyId) {
    existingCompany = await prisma.company.findFirst({
      where: { companyId: String(companyId), sourcePlatform: standardizedPlatform }
    })
  }

  // 2.2 若按ID未找到，则通过公司名称查找匹配
  if (!existingCompany && cName) {
    existingCompany = await prisma.company.findFirst({
      where: { companyName: cName, sourcePlatform: standardizedPlatform }
    })
  }

  // =========================================================================
  // 第三步：执行更新或插入逻辑（统一存入 rawData2 字段）
  // =========================================================================
  if (existingCompany) {
    // -----------------------------------------------------------------------
    // 分支 A：公司记录已存在 -> 执行 UPDATE 更新
    // -----------------------------------------------------------------------
    const meta = extractCompanyMetadata(rawData || company)
    await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        rawData2: stringifiedData,
        companyId: companyId || existingCompany.companyId,
        companyFullName: cFullName || existingCompany.companyFullName,
        updatedAt: updatedAt,
        ...(meta.industry ? { industry: meta.industry } : {}),
        ...(meta.scale ? { scale: meta.scale } : {}),
        ...(meta.stage ? { stage: meta.stage } : {}),
        ...(meta.companyType ? { companyType: meta.companyType } : {}),
        ...(meta.creditCode ? { creditCode: meta.creditCode } : {}),
        ...(meta.logo ? { logo: meta.logo } : {}),
        ...(meta.welfareList ? { welfareList: meta.welfareList } : {})
      }
    })
  } else if (cName) {
    // -----------------------------------------------------------------------
    // 分支 B：公司记录不存在 -> 执行 CREATE 新增
    // -----------------------------------------------------------------------
    const meta = extractCompanyMetadata(rawData || company)
    try {
      await prisma.company.create({
        data: {
          companyName: cName,
          companyFullName: cFullName,
          sourcePlatform: standardizedPlatform,
          companyId: companyId,
          createdAt: createdAt,
          updatedAt: updatedAt,
          rawData2: stringifiedData,
          industry: meta.industry,
          scale: meta.scale,
          stage: meta.stage,
          companyType: meta.companyType,
          creditCode: meta.creditCode,
          logo: meta.logo,
          welfareList: meta.welfareList
        }
      })
    } catch (createErr: any) {
      // 处理并发写入时的唯一索引冲突异常（P2002）
      if (createErr.code === 'P2002') {
        const newlyCreated = await prisma.company.findFirst({
          where: { companyName: cName, sourcePlatform: standardizedPlatform }
        })
        if (newlyCreated) {
          await prisma.company.update({
            where: { id: newlyCreated.id },
            data: {
              rawData2: stringifiedData,
              companyId: companyId || newlyCreated.companyId,
              companyFullName: cFullName || newlyCreated.companyFullName,
              updatedAt: updatedAt,
              ...(meta.industry ? { industry: meta.industry } : {}),
              ...(meta.scale ? { scale: meta.scale } : {}),
              ...(meta.stage ? { stage: meta.stage } : {}),
              ...(meta.companyType ? { companyType: meta.companyType } : {}),
              ...(meta.creditCode ? { creditCode: meta.creditCode } : {}),
              ...(meta.logo ? { logo: meta.logo } : {}),
              ...(meta.welfareList ? { welfareList: meta.welfareList } : {})
            }
          })
        }
      } else {
        throw createErr
      }
    }
  }

  // =========================================================================
  // 第四步：双向同步 Job 表中的职位企业全称（companyFullName）
  // =========================================================================
  if (cFullName) {
    const orConditions: any[] = []
    if (companyId) {
      orConditions.push({ companyId: String(companyId) })
    }
    if (cName) {
      orConditions.push({ companyName: cName })
    }

    // 暂时不更新到job表里的公司名称了，直接在职位详情页动态获取了，这里是针对智联平台
    // if (orConditions.length > 0) {
    //   await prisma.job.updateMany({
    //     where: {
    //       platform: standardizedPlatform,
    //       OR: orConditions
    //     },
    //     data: {
    //       companyFullName: cFullName,
    //       updatedAt: updatedAt
    //     }
    //   })
    // }
  }
}

