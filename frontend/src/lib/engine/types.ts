export type OrgRole = 'owner' | 'editor' | 'viewer'

export type StepType = 
  | 'llm_call' 
  | 'http_request' 
  | 'db_write' 
  | 'notify' 
  | 'conditional_branch' 
  | 'approval_gate'

export type TriggerType = 'manual' | 'webhook' | 'scheduled' | 'database_event'

export type RunStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'paused' 
  | 'waiting' 
  | 'cancelled'

export interface WorkflowStep {
  id: string
  workflow_id: string
  position: number
  name: string
  type: StepType
  config: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: string
  org_id: string
  name: string
  description?: string
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  usage_calls: number
  usage_limit: number
  usage_period_start: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  triggered_by?: string
  trigger_type: TriggerType
  status: RunStatus
  input: Record<string, any>
  output: Record<string, any>
  error?: Record<string, any>
  started_at?: string
  completed_at?: string
  created_at: string
}

export interface StepRun {
  id: string
  workflow_run_id: string
  workflow_step_id: string
  status: RunStatus
  input: Record<string, any>
  output: Record<string, any>
  error?: Record<string, any>
  attempt_count: number
  approved_by?: string
  approved_at?: string
  started_at?: string
  completed_at?: string
  created_at: string
}

export interface TriggerWorkflowRunInput {
  workflow_id: string
  input?: Record<string, any>
}

export interface TriggerWorkflowRunOutput {
  run_id?: string
  status: RunStatus
  message: string
  output?: Record<string, any>
}

export interface ApproveStepRunInput {
  step_run_id: string
}

export interface ApproveStepRunOutput {
  step_run_id?: string
  status: RunStatus
  message: string
}

export interface HasuraActionPayload<T> {
  action: {
    name: string
  }
  input: T
  session_variables?: {
    'x-hasura-user-id'?: string
    'x-hasura-role'?: string
    [key: string]: string | undefined
  }
}
