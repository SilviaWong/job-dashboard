/**
 * 职位状态枚举
 */
export enum JobStatus {
  /** 常规状态：正常抓取展示的有效职位 */
  NORMAL = 'normal',
  /** 已失效状态：原招聘平台已标记为关闭、下架或已过期、或被用户手动标记为失效的职位 */
  EXPIRED = 'expired'
}
