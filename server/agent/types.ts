import type { PrismaClient } from '@prisma/client'

export interface AgentContext {
  prisma: PrismaClient
  event: any
  defaultResume?: string
  resumes?: Array<{
    id: string
    title: string
    targetRole?: string | null
    isDefault: boolean
    content: string
  }>
}

export interface AgentToolParamProperty {
  type: string
  description: string
  enum?: string[]
  items?: { type: string }
}

export interface AgentTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, AgentToolParamProperty>
    required?: string[]
  }
  execute: (params: any, context: AgentContext) => Promise<any>
}

export interface AgentStep {
  step: number
  thought: string
  toolName?: string
  toolParams?: any
  observation?: any
  error?: string
}

export interface AgentCard {
  type: 'job_list' | 'job_detail' | 'greeting' | 'funnel_summary' | 'batch_scan_result' | 'question_list'
  title: string
  data: any
}

export interface AgentRunResult {
  success: boolean
  answer: string
  steps: AgentStep[]
  cards: AgentCard[]
  error?: string
}
