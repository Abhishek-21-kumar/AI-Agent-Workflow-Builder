import { WorkflowStep } from '../types'

export interface NotifyConfig {
  channel?: 'console' | 'slack' | 'email' | 'webhook'
  recipient?: string
  template?: string
  subject?: string
}

function interpolateVariables(val: any, context: Record<string, any>): any {
  if (typeof val === 'string') {
    return val.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const parts = path.split('.')
      let current: any = context
      for (const part of parts) {
        if (current === undefined || current === null) return ''
        current = current[part]
      }
      return current !== undefined && current !== null ? String(current) : ''
    })
  }
  if (typeof val === 'object' && val !== null) {
    if (Array.isArray(val)) {
      return val.map(item => interpolateVariables(item, context))
    }
    const res: Record<string, any> = {}
    for (const key of Object.keys(val)) {
      res[key] = interpolateVariables(val[key], context)
    }
    return res
  }
  return val
}

export async function executeNotify(
  step: WorkflowStep,
  stepInput: Record<string, any>,
  executionHistory: Record<string, any> = {}
): Promise<{
  delivered: boolean
  channel: string
  recipient: string
  subject?: string
  message: string
  timestamp: string
}> {
  const config: NotifyConfig = step.config || {}
  const channel = config.channel || 'console'
  const rawRecipient = config.recipient || 'system'
  const rawTemplate = config.template || 'Workflow step execution completed.'
  const rawSubject = config.subject || 'Workflow Alert'

  const contextData = { input: stepInput, ...executionHistory }
  const recipient = interpolateVariables(rawRecipient, contextData)
  const message = interpolateVariables(rawTemplate, contextData)
  const subject = interpolateVariables(rawSubject, contextData)
  const timestamp = new Date().toISOString()

  console.log(`[Notify Step] Channel: ${channel} | Recipient: ${recipient} | Message: ${message}`)

  return {
    delivered: true,
    channel,
    recipient,
    subject,
    message,
    timestamp
  }
}
