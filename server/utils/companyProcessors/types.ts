import { PrismaClient } from '@prisma/client'

export type CompanyProcessor = (company: any, platform: string, prisma: PrismaClient) => Promise<void>

/**
 * 规范化公司名称与公司全称：
 * 1. 处理 Unicode 转义（如 \uXXXX）与 URL 编码；
 * 2. 将中文括号（‘（’、‘）’）替换为英文括号（‘(’、‘)’）；
 * 3. 去除所有空格。
 */
export function cleanCompanyName(str: string): string {
  if (!str) return ''
  let res = String(str)
  if (res.includes('\\u') || res.includes('\\U')) {
    try {
      res = res.replace(/\\u([0-9a-fA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    } catch (e) {
      try {
        res = JSON.parse(`"${res.replace(/"/g, '\\"')}"`)
      } catch (err) {}
    }
  }
  if (res.includes('%')) {
    try {
      res = decodeURIComponent(res)
    } catch (e) {}
  }
  return res
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .trim()
}
