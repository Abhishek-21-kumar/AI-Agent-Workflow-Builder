import { WorkflowStep } from '../types'

export interface DBWriteConfig {
  table?: string
  action?: 'insert' | 'update' | 'upsert'
  payload?: Record<string, any>
  where?: Record<string, any>
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

export async function executeDBWrite(
  step: WorkflowStep,
  stepInput: Record<string, any>,
  executionHistory: Record<string, any> = {}
): Promise<{
  success: boolean
  table: string
  action: string
  payload: Record<string, any>
  timestamp: string
}> {
  const config: DBWriteConfig = step.config || {}
  const table = config.table || 'audit_logs'
  const action = config.action || 'insert'
  const rawPayload = config.payload || stepInput.payload || stepInput

  const contextData = { input: stepInput, ...executionHistory }
  const interpolatedPayload = interpolateVariables(rawPayload, contextData)
  const timestamp = new Date().toISOString()

  // Validate table name format to prevent SQL injection in dynamic queries
  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error(`DB Write Security Error: Invalid table name "${table}".`)
  }

  console.log(`[DB Write Step] Table "${table}" (${action}):`, interpolatedPayload)

  return {
    success: true,
    table,
    action,
    payload: interpolatedPayload,
    timestamp
  }
}
