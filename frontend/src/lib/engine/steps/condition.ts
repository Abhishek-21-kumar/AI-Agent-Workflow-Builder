import { WorkflowStep } from '../types'

export interface ConditionRule {
  path?: string
  operator?: 'equals' | 'not_equals' | 'contains' | 'not_contains'
  value?: any
}

export interface ConditionConfig {
  condition?: ConditionRule
  if_true_position?: number
  if_false_position?: number
}

function getValueByPath(obj: any, path: string): any {
  if (!obj || !path) return obj
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === undefined || current === null) return undefined
    current = current[part]
  }
  return current
}

export function evaluateConditionBranch(
  step: WorkflowStep,
  lastStepOutput: Record<string, any> = {}
): {
  evaluated: boolean
  next_position: number
  path_value: any
  operator: string
  target_value: any
} {
  const config: ConditionConfig = step.config || {}
  const rule: ConditionRule = config.condition || {}
  const operator = rule.operator || 'contains'
  const path = rule.path || 'text'
  const targetValue = rule.value ?? ''
  const ifTruePos = config.if_true_position ?? step.position + 1
  const ifFalsePos = config.if_false_position ?? step.position + 2

  const actualValue = getValueByPath(lastStepOutput, path) ?? ''
  let evaluated = false

  const strActual = String(actualValue).toLowerCase()
  const strTarget = String(targetValue).toLowerCase()

  switch (operator) {
    case 'equals':
      evaluated = strActual === strTarget
      break
    case 'not_equals':
      evaluated = strActual !== strTarget
      break
    case 'contains':
      evaluated = strActual.includes(strTarget)
      break
    case 'not_contains':
      evaluated = !strActual.includes(strTarget)
      break
    default:
      evaluated = strActual.includes(strTarget)
      break
  }

  const nextPosition = evaluated ? ifTruePos : ifFalsePos

  return {
    evaluated,
    next_position: nextPosition,
    path_value: actualValue,
    operator,
    target_value: targetValue
  }
}
