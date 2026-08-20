import { getPrisma } from '#prisma'
import { processBossJobDetail } from './boss'
import { processDefaultJobDetail } from './default'
import { process51JobDetail } from './51job'
import { processLiepinJobDetail } from './liepin'
import { processZhilianJobDetail } from './zhilian'

type JobDetailProcessor = (detail: any, rawPlatform: string, prisma: ReturnType<typeof getPrisma>) => Promise<any>

const processors: Record<string, JobDetailProcessor> = {
  'Boss直聘': processBossJobDetail,
  '51job': process51JobDetail,
  '猎聘': processLiepinJobDetail,
  '智联': processZhilianJobDetail,
}

export function getJobDetailProcessor(platform: string): JobDetailProcessor {
  return processors[platform] || processDefaultJobDetail
}
