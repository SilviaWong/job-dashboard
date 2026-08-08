import type { JobProcessor } from './types'
import { processBossJob } from './boss'
import { processLiepinJob } from './liepin'
import { processZhilianJob } from './zhilian'
import { process51Job } from './51job'
import { processDefaultJob } from './default'

export function getJobProcessor(platform: string): JobProcessor {
  switch (platform) {
    case 'Boss直聘':
      return processBossJob
    case '猎聘':
      return processLiepinJob
    case '智联':
      return processZhilianJob
    case '51job':
      return process51Job
    default:
      return processDefaultJob
  }
}
