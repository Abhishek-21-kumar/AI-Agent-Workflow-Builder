import { Workflow, WorkflowStep, Organization, OrgMember, WorkflowRun, StepRun, RunStatus, TriggerType } from './types'

const HASURA_SUBDOMAIN = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'jvbfbauzspkhupdgbaii'
const HASURA_REGION = process.env.NEXT_PUBLIC_NHOST_REGION || 'ap-south-1'
const DEFAULT_HASURA_URL = HASURA_SUBDOMAIN === 'local' 
  ? 'http://localhost:8080/v1/graphql' 
  : `https://${HASURA_SUBDOMAIN}.hasura.${HASURA_REGION}.nhost.run/v1/graphql`

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL || process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || DEFAULT_HASURA_URL
const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'nhost-admin-secret'

/**
 * When true, the engine uses an in-memory mock store instead of Hasura.
 * Must be explicitly opted-in via environment variable. NEVER auto-fallback.
 */
function isDevMock(): boolean {
  return process.env.ENGINE_DEV_MOCK === 'true'
}

async function hasuraGraphQL(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET
    },
    body: JSON.stringify({ query, variables })
  })

  if (!res.ok) {
    throw new Error(`Hasura HTTP ${res.status}: ${res.statusText}`)
  }

  const json = await res.json()
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Hasura GraphQL Error: ${json.errors[0].message}`)
  }
  return json.data
}

// In-memory fallback store — only active when ENGINE_DEV_MOCK=true
const mockStore = {
  organizations: new Map<string, Organization>(),
  orgMembers: new Map<string, OrgMember>(),
  workflows: new Map<string, Workflow>(),
  steps: new Map<string, WorkflowStep[]>(),
  runs: new Map<string, WorkflowRun>(),
  stepRuns: new Map<string, StepRun>()
}

/**
 * Throws if Hasura is unreachable and dev mock is not explicitly enabled.
 * Prevents silent fallback to in-memory storage in production.
 */
function requireBackendOrMock(operation: string): void {
  if (!isDevMock()) {
    throw new Error(
      `[${operation}] Hasura backend is unreachable and ENGINE_DEV_MOCK is not enabled. ` +
      `Set ENGINE_DEV_MOCK=true for local development without Hasura, or configure NHOST_GRAPHQL_URL.`
    )
  }
}

export async function fetchWorkflowWithOrgAndSteps(workflowId: string): Promise<{
  workflow: Workflow
  organization: Organization
  steps: WorkflowStep[]
}> {
  if (isDevMock()) {
    return fetchWorkflowFromMock(workflowId)
  }

  const query = `
    query GetWorkflowDetails($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        org_id
        name
        description
        active
        created_by
        created_at
        updated_at
        organization {
          id
          name
          usage_calls
          usage_limit
          usage_period_start
        }
        steps(order_by: { position: asc }) {
          id
          workflow_id
          position
          name
          type
          config
          created_at
          updated_at
        }
      }
    }
  `

  try {
    const data = await hasuraGraphQL(query, { workflowId })
    const wf = data?.workflows_by_pk
    if (!wf) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }
    return {
      workflow: {
        id: wf.id,
        org_id: wf.org_id,
        name: wf.name,
        description: wf.description,
        active: wf.active,
        created_by: wf.created_by,
        created_at: wf.created_at,
        updated_at: wf.updated_at
      },
      organization: wf.organization,
      steps: wf.steps || []
    }
  } catch (err: any) {
    // If Hasura is unreachable (network error, not a GraphQL "not found"), check mock
    if (err.message?.includes('Workflow not found')) throw err
    requireBackendOrMock('fetchWorkflowWithOrgAndSteps')
    return fetchWorkflowFromMock(workflowId)
  }
}

function fetchWorkflowFromMock(workflowId: string) {
  if (!mockStore.workflows.has(workflowId)) {
    throw new Error(`Workflow not found: ${workflowId}`)
  }
  const wf = mockStore.workflows.get(workflowId)!
  const org = mockStore.organizations.get(wf.org_id)
  if (!org) throw new Error(`Organization not found for workflow: ${workflowId}`)
  const steps = mockStore.steps.get(workflowId) || []
  return { workflow: wf, organization: org, steps }
}

export async function verifyUserOrgRole(userId: string, orgId: string): Promise<OrgMember | null> {
  if (isDevMock()) {
    return verifyUserOrgRoleFromMock(userId, orgId)
  }

  try {
    const query = `
      query GetOrgMember($orgId: uuid!, $userId: uuid!) {
        org_members(where: { org_id: { _eq: $orgId }, user_id: { _eq: $userId } }) {
          id
          org_id
          user_id
          role
        }
      }
    `
    const data = await hasuraGraphQL(query, { orgId, userId })
    const members = data?.org_members || []
    if (members.length === 0) return null
    return members[0]
  } catch (_err: any) {
    requireBackendOrMock('verifyUserOrgRole')
    return verifyUserOrgRoleFromMock(userId, orgId)
  }
}

function verifyUserOrgRoleFromMock(userId: string, orgId: string): OrgMember | null {
  for (const member of mockStore.orgMembers.values()) {
    if (member.org_id === orgId && member.user_id === userId) {
      return member
    }
  }
  return null
}

export async function createWorkflowRunRecord(
  workflowId: string,
  triggeredBy: string | undefined,
  triggerType: TriggerType,
  input: Record<string, any>
): Promise<WorkflowRun> {
  const runId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (isDevMock()) {
    const run: WorkflowRun = {
      id: runId, workflow_id: workflowId, triggered_by: triggeredBy,
      trigger_type: triggerType, status: 'running', input: input || {},
      output: {}, started_at: now, created_at: now
    }
    mockStore.runs.set(runId, run)
    console.warn(`[DEV_MOCK] Created workflow_run ${runId} in memory (not persisted to database).`)
    return run
  }

  try {
    const mutation = `
      mutation CreateRun($object: workflow_runs_insert_input!) {
        insert_workflow_runs_one(object: $object) {
          id
          workflow_id
          triggered_by
          trigger_type
          status
          input
          output
          error
          started_at
          created_at
        }
      }
    `
    const data = await hasuraGraphQL(mutation, {
      object: {
        id: runId,
        workflow_id: workflowId,
        triggered_by: triggeredBy,
        trigger_type: triggerType,
        status: 'running',
        input: input || {},
        output: {},
        started_at: now
      }
    })
    return data.insert_workflow_runs_one
  } catch (err: any) {
    requireBackendOrMock('createWorkflowRunRecord')
    // If we reach here, USE_DEV_MOCK must be true (requireBackendOrMock passed)
    const run: WorkflowRun = {
      id: runId, workflow_id: workflowId, triggered_by: triggeredBy,
      trigger_type: triggerType, status: 'running', input: input || {},
      output: {}, started_at: now, created_at: now
    }
    mockStore.runs.set(runId, run)
    return run
  }
}

export async function updateWorkflowRunState(
  runId: string,
  status: RunStatus,
  output: Record<string, any> = {},
  error?: Record<string, any>
): Promise<void> {
  const now = new Date().toISOString()
  const isFinal = status === 'completed' || status === 'failed' || status === 'cancelled'

  if (isDevMock()) {
    if (mockStore.runs.has(runId)) {
      const run = mockStore.runs.get(runId)!
      run.status = status
      run.output = output
      if (error) run.error = error
      if (isFinal) run.completed_at = now
    }
    return
  }

  try {
    const mutation = `
      mutation UpdateRun($runId: uuid!, $status: run_status!, $output: jsonb!, $error: jsonb, $completedAt: timestamptz) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $runId }
          _set: {
            status: $status
            output: $output
            error: $error
            completed_at: $completedAt
          }
        ) {
          id
        }
      }
    `
    await hasuraGraphQL(mutation, {
      runId,
      status,
      output,
      error: error || null,
      completedAt: isFinal ? now : null
    })
  } catch (_err: any) {
    requireBackendOrMock('updateWorkflowRunState')
  }
}

export async function createStepRunRecord(
  workflowRunId: string,
  workflowStepId: string,
  input: Record<string, any>,
  attemptCount: number = 1
): Promise<StepRun> {
  const stepRunId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (isDevMock()) {
    const stepRun: StepRun = {
      id: stepRunId, workflow_run_id: workflowRunId, workflow_step_id: workflowStepId,
      status: 'running', input: input || {}, output: {},
      attempt_count: attemptCount, started_at: now, created_at: now
    }
    mockStore.stepRuns.set(stepRunId, stepRun)
    return stepRun
  }

  try {
    const mutation = `
      mutation CreateStepRun($object: step_runs_insert_input!) {
        insert_step_runs_one(object: $object) {
          id
          workflow_run_id
          workflow_step_id
          status
          input
          output
          attempt_count
          started_at
          created_at
        }
      }
    `
    const data = await hasuraGraphQL(mutation, {
      object: {
        id: stepRunId,
        workflow_run_id: workflowRunId,
        workflow_step_id: workflowStepId,
        status: 'running',
        input: input || {},
        output: {},
        attempt_count: attemptCount,
        started_at: now
      }
    })
    return data.insert_step_runs_one
  } catch (err: any) {
    requireBackendOrMock('createStepRunRecord')
    const stepRun: StepRun = {
      id: stepRunId, workflow_run_id: workflowRunId, workflow_step_id: workflowStepId,
      status: 'running', input: input || {}, output: {},
      attempt_count: attemptCount, started_at: now, created_at: now
    }
    mockStore.stepRuns.set(stepRunId, stepRun)
    return stepRun
  }
}

export async function updateStepRunState(
  stepRunId: string,
  status: RunStatus,
  output: Record<string, any> = {},
  error?: Record<string, any>,
  attemptCount?: number,
  approvedBy?: string
): Promise<void> {
  const now = new Date().toISOString()
  const isFinal = status === 'completed' || status === 'failed' || status === 'cancelled'

  if (isDevMock()) {
    if (mockStore.stepRuns.has(stepRunId)) {
      const sr = mockStore.stepRuns.get(stepRunId)!
      sr.status = status
      sr.output = output
      if (error) sr.error = error
      if (attemptCount) sr.attempt_count = attemptCount
      if (approvedBy) { sr.approved_by = approvedBy; sr.approved_at = now }
      if (isFinal) sr.completed_at = now
    }
    return
  }

  try {
    const mutation = `
      mutation UpdateStepRun(
        $stepRunId: uuid!
        $status: run_status!
        $output: jsonb!
        $error: jsonb
        $attemptCount: Int
        $approvedBy: uuid
        $approvedAt: timestamptz
        $completedAt: timestamptz
      ) {
        update_step_runs_by_pk(
          pk_columns: { id: $stepRunId }
          _set: {
            status: $status
            output: $output
            error: $error
            attempt_count: $attemptCount
            approved_by: $approvedBy
            approved_at: $approvedAt
            completed_at: $completedAt
          }
        ) {
          id
        }
      }
    `
    await hasuraGraphQL(mutation, {
      stepRunId,
      status,
      output,
      error: error || null,
      attemptCount: attemptCount || 1,
      approvedBy: approvedBy || null,
      approvedAt: approvedBy ? now : null,
      completedAt: isFinal ? now : null
    })
  } catch (_err: any) {
    requireBackendOrMock('updateStepRunState')
  }
}

export async function fetchStepRunDetails(stepRunId: string): Promise<{
  stepRun: StepRun
  workflowRun: WorkflowRun
  workflow: Workflow
  step: WorkflowStep
}> {
  if (isDevMock()) {
    return fetchStepRunDetailsFromMock(stepRunId)
  }

  try {
    const query = `
      query GetStepRunDetails($stepRunId: uuid!) {
        step_runs_by_pk(id: $stepRunId) {
          id
          workflow_run_id
          workflow_step_id
          status
          input
          output
          error
          attempt_count
          approved_by
          approved_at
          started_at
          completed_at
          created_at
          workflow_step {
            id
            workflow_id
            position
            name
            type
            config
            created_at
            updated_at
          }
          workflow_run {
            id
            workflow_id
            triggered_by
            trigger_type
            status
            input
            output
            error
            started_at
            completed_at
            created_at
            workflow {
              id
              org_id
              name
              description
              active
              created_by
              created_at
              updated_at
            }
          }
        }
      }
    `
    const data = await hasuraGraphQL(query, { stepRunId })
    const sr = data?.step_runs_by_pk
    if (!sr) {
      throw new Error(`Step run not found: ${stepRunId}`)
    }
    return {
      stepRun: {
        id: sr.id,
        workflow_run_id: sr.workflow_run_id,
        workflow_step_id: sr.workflow_step_id,
        status: sr.status,
        input: sr.input,
        output: sr.output,
        error: sr.error,
        attempt_count: sr.attempt_count,
        approved_by: sr.approved_by,
        approved_at: sr.approved_at,
        started_at: sr.started_at,
        completed_at: sr.completed_at,
        created_at: sr.created_at
      },
      workflowRun: sr.workflow_run,
      workflow: sr.workflow_run.workflow,
      step: sr.workflow_step
    }
  } catch (err: any) {
    if (err.message?.includes('Step run not found')) throw err
    requireBackendOrMock('fetchStepRunDetails')
    return fetchStepRunDetailsFromMock(stepRunId)
  }
}

function fetchStepRunDetailsFromMock(stepRunId: string) {
  if (!mockStore.stepRuns.has(stepRunId)) {
    throw new Error(`Step run not found: ${stepRunId}`)
  }
  const sr = mockStore.stepRuns.get(stepRunId)!
  const wr = mockStore.runs.get(sr.workflow_run_id)
  if (!wr) throw new Error(`Workflow run not found for step run: ${stepRunId}`)
  const wf = mockStore.workflows.get(wr.workflow_id)
  if (!wf) throw new Error(`Workflow not found for run: ${wr.workflow_id}`)
  const steps = mockStore.steps.get(wf.id) || []
  const step = steps.find(s => s.id === sr.workflow_step_id) || steps[0]
  if (!step) throw new Error(`Workflow step not found for step run: ${stepRunId}`)
  return { stepRun: sr, workflowRun: wr, workflow: wf, step }
}

export async function incrementOrgUsageCall(orgId: string): Promise<void> {
  if (isDevMock()) {
    if (mockStore.organizations.has(orgId)) {
      mockStore.organizations.get(orgId)!.usage_calls += 1
    }
    return
  }

  try {
    const mutation = `
      mutation IncrementOrgUsage($orgId: uuid!) {
        update_organizations_by_pk(
          pk_columns: { id: $orgId }
          _inc: { usage_calls: 1 }
        ) {
          id
          usage_calls
        }
      }
    `
    await hasuraGraphQL(mutation, { orgId })
  } catch (_err: any) {
    requireBackendOrMock('incrementOrgUsageCall')
  }
}

export async function fetchPendingStepRuns(): Promise<Array<{
  step_run_id: string
  workflow_name: string
  step_name: string
  required_role: 'owner' | 'editor' | 'viewer'
  message: string
  paused_at: string
}>> {
  if (isDevMock()) {
    const list: any[] = []
    for (const sr of mockStore.stepRuns.values()) {
      if (sr.status === 'waiting') {
        const wr = mockStore.runs.get(sr.workflow_run_id)
        const wf = wr ? mockStore.workflows.get(wr.workflow_id) : undefined
        const steps = wf ? mockStore.steps.get(wf.id) || [] : []
        const step = steps.find(s => s.id === sr.workflow_step_id)
        list.push({
          step_run_id: sr.id,
          workflow_name: wf?.name || 'Customer Support Sentiment & Escalation',
          step_name: step?.name || 'Owner Approval Gate',
          required_role: (step?.config?.required_role as any) || 'owner',
          message: step?.config?.message || 'High risk ticket requires sign-off.',
          paused_at: sr.created_at || new Date().toISOString()
        })
      }
    }
    return list
  }

  try {
    const query = `
      query GetPendingStepRuns {
        step_runs(
          where: {
            status: { _eq: "waiting" }
            workflow_run: { status: { _eq: "paused" } }
          }
          order_by: { created_at: desc }
        ) {
          id
          status
          created_at
          workflow_step {
            id
            name
            position
            config
          }
          workflow_run {
            id
            status
            workflow {
              id
              name
            }
          }
        }
      }
    `
    const data = await hasuraGraphQL(query)
    const runs = data?.step_runs || []
    return runs.map((sr: any) => ({
      step_run_id: sr.id,
      workflow_name: sr.workflow_run?.workflow?.name || 'Customer Support Sentiment & Escalation',
      step_name: sr.workflow_step?.name || 'Owner Approval Gate',
      required_role: sr.workflow_step?.config?.required_role || 'owner',
      message: sr.workflow_step?.config?.message || 'Owner approval required for urgent escalation.',
      paused_at: sr.created_at
    }))
  } catch (_err) {
    return []
  }
}

export { mockStore }
