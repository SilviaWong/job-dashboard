import type { CompanyProcessor } from './types'
import { processBossCompany } from './boss'
import { processLiepinCompany } from './liepin'
import { processZhilianCompany } from './zhilian'
import { process51JobCompany } from './51job'
import { processDefaultCompany } from './default'

export function getCompanyProcessor(platform: string): CompanyProcessor {
  switch (platform) {
    case 'Boss直聘':
      return processBossCompany
    case '猎聘':
      return processLiepinCompany
    case '智联':
      return processZhilianCompany
    case '51job':
      return process51JobCompany
    default:
      return processDefaultCompany
  }
}
