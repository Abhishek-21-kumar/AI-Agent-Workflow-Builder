import { WorkflowStep, RunStatus } from './types'
import {
  fetchWorkflowWithOrgAndSteps,
  verifyUserOrgRole,
  createWorkflowRunRecord,
  updateWorkflowRunState,
  createStepRunRecord,
  updateStepRunState,
  incrementOrgUsageCall
} from './db'
import { executeLLMCall } from './steps/llm'
import { executeHTTPRequest } from './steps/http'
import { evaluateConditionBranch } from './steps/condition'
import { executeDBWrite } from './steps/db_write'
import { executeNotify } from './steps/notify'

const DEFAULT_MAX_ATTEMPTS = 2

interface RunnerResult {
  run_id: string
  status: RunStatus
  message: string
  output?: Record<string, any>
}

/**
 * Main workflow execution runner.
 *
 * Authorization flow:
 * 1. Receives trusted userId from Hasura session (x-hasura-user-id)
 * 2. Loads workflow and its organization via admin GraphQL
 * 3. Verifies userId is a member of the workflow's organization with owner/editor role
 * 4. Checks organization usage quota
 * 5. Creates workflow_run and executes steps sequentially
 * 6. Pauses on approval_gate steps
 * 7. Increments usage on successful completion
 */
export async function runWorkflow(
  workflowId: string,
  userId: string,
  input: Record<string, any> = {},
  triggerType: 'manual' | 'webhook' | 'scheduled' | 'database_event' = 'manual'
): Promise<RunnerResult> {

  // 1. Load workflow, organization, and steps
  let workflow, organization, steps
  try {
    const details = await fetchWorkflowWithOrgAndSteps(workflowId)
    workflow = details.workflow
    organization = details.organization
    steps = details.steps
  } catch {
    return { run_id: '', status: 'failed', message: 'Workflow not found.' }
  }

  // 2. Verify the authenticated user is a member with owner/editor role
  const member = await verifyUserOrgRole(userId, workflow.org_id)
  if (!member) {
    return { run_id: '', status: 'failed', message: 'Unauthorized: You are not a member of this workflow\'s organization.' }
  }
  if (member.role === 'viewer') {
    return { run_id: '', status: 'failed', message: 'Unauthorized: Viewers cannot execute workflows.' }
  }

  // 3. Verify workflow is active
  if (!workflow.active) {
    return { run_id: '', status: 'failed', message: 'Workflow is inactive and cannot be executed.' }
  }

  // 4. Check organization usage quota
  if (organization.usage_calls >= organization.usage_limit) {
    return { run_id: '', status: 'failed', message: `Quota exhausted: Organization "${organization.name}" has used ${organization.usage_calls}/${organization.usage_limit} calls this period.` }
  }

  // 5. Validate steps exist
  if (steps.length === 0) {
    return { run_id: '', status: 'failed', message: 'Workflow has no steps configured.' }
  }

  // 6. Create workflow run record
  const run = await createWorkflowRunRecord(workflowId, userId, triggerType, input)

  // 7. Execute steps sequentially
  const result = await executeStepsSequentially(run.id, steps, input, workflow.org_id)

  return {
    run_id: run.id,
    status: result.status,
    message: result.message,
    output: result.output
  }
}

/**
 * Resume a paused workflow run from a specific step position.
 * Called after an approval_gate step is approved.
 */
export async function resumeWorkflowFromPosition(
  runId: string,
  steps: WorkflowStep[],
  resumeFromPosition: number,
  lastOutput: Record<string, any>,
  orgId: string
): Promise<{ status: RunStatus; message: string; output?: Record<string, any> }> {

  // Set workflow_run back to running
  await updateWorkflowRunState(runId, 'running')

  // Find steps to execute (positions >= resumeFromPosition)
  const remainingSteps = steps.filter(s => s.position > resumeFromPosition)

  if (remainingSteps.length === 0) {
    // No more steps after approved gate — complete the run
    await updateWorkflowRunState(runId, 'completed', lastOutput)
    await incrementOrgUsageCall(orgId)
    return { status: 'completed', message: 'Workflow completed after approval.', output: lastOutput }
  }

  // Continue sequential execution
  return await executeStepsSequentially(runId, remainingSteps, lastOutput, orgId)
}

/**
 * Core sequential step execution loop.
 */
async function executeStepsSequentially(
  runId: string,
  steps: WorkflowStep[],
  initialInput: Record<string, any>,
  orgId: string
): Promise<{ status: RunStatus; message: string; output?: Record<string, any> }> {

  let currentInput = { ...initialInput }
  let lastOutput: Record<string, any> = {}
  const executionHistory: Record<string, any> = { workflow_input: initialInput }

  // Track position-based index for conditional branching
  let stepIndex = 0

  while (stepIndex < steps.length) {
    const step = steps[stepIndex]

    // Handle approval_gate: pause execution
    if (step.type === 'approval_gate') {
      const stepRun = await createStepRunRecord(runId, step.id, currentInput)
      await updateStepRunState(stepRun.id, 'waiting', { message: 'Awaiting approval', gate_config: step.config })
      await updateWorkflowRunState(runId, 'paused', lastOutput)
      return {
        status: 'paused',
        message: `Workflow paused at approval gate: "${step.name}" (step position ${step.position}). Approval required to continue.`,
        output: lastOutput
      }
    }

    // Execute step with retry (clamped between 1 and 5 attempts)
    const maxAttempts = Math.min(Math.max(1, step.config?.max_attempts ?? DEFAULT_MAX_ATTEMPTS), 5)
    const stepRun = await createStepRunRecord(runId, step.id, currentInput)
    let stepResult: { output: Record<string, any>; nextPosition?: number } | null = null
    let lastError: any = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await updateStepRunState(stepRun.id, 'running', {}, undefined, attempt)

        stepResult = await executeStep(step, currentInput, executionHistory)

        // Success
        lastOutput = stepResult.output
        executionHistory[`step_${step.position}`] = lastOutput
        executionHistory[`step_${step.name}`] = lastOutput

        await updateStepRunState(stepRun.id, 'completed', stepResult.output, undefined, attempt)
        lastError = null
        break
      } catch (err: any) {
        lastError = { message: err.message || String(err), attempt }

        if (attempt < maxAttempts) {
          // Will retry
          await updateStepRunState(stepRun.id, 'running', {}, lastError, attempt)
        } else {
          // Final attempt failed
          await updateStepRunState(stepRun.id, 'failed', {}, lastError, attempt)
        }
      }
    }

    if (lastError) {
      // Step failed after all retries — mark workflow as failed
      await updateWorkflowRunState(runId, 'failed', lastOutput, {
        failed_step: step.name,
        failed_step_position: step.position,
        error: lastError
      })
      return {
        status: 'failed',
        message: `Workflow failed at step "${step.name}" (position ${step.position}) after ${maxAttempts} attempts: ${lastError.message}`,
        output: lastOutput
      }
    }

    // Handle conditional branching
    if (step.type === 'conditional_branch' && stepResult?.nextPosition !== undefined) {
      const branchTargetIdx = steps.findIndex(s => s.position === stepResult!.nextPosition)
      if (branchTargetIdx >= 0) {
        stepIndex = branchTargetIdx
        currentInput = lastOutput
        continue
      }
      // If branch target position not found, fall through to next sequential step
    }

    // Move to next step
    currentInput = lastOutput
    stepIndex++
  }

  // All steps completed
  await updateWorkflowRunState(runId, 'completed', lastOutput)
  await incrementOrgUsageCall(orgId)
  return { status: 'completed', message: 'Workflow completed successfully.', output: lastOutput }
}

/**
 * Execute a single step based on its type.
 */
async function executeStep(
  step: WorkflowStep,
  input: Record<string, any>,
  executionHistory: Record<string, any>
): Promise<{ output: Record<string, any>; nextPosition?: number }> {

  switch (step.type) {
    case 'llm_call': {
      const result = await executeLLMCall(step, input, executionHistory)
      return { output: result }
    }

    case 'http_request': {
      const result = await executeHTTPRequest(step, input, executionHistory)
      return { output: result }
    }

    case 'conditional_branch': {
      const result = evaluateConditionBranch(step, input)
      return {
        output: result,
        nextPosition: result.next_position
      }
    }

    case 'db_write': {
      const result = await executeDBWrite(step, input, executionHistory)
      return { output: result }
    }

    case 'notify': {
      const result = await executeNotify(step, input, executionHistory)
      return { output: result }
    }

    case 'approval_gate': {
      // This case is handled upstream in the runner loop before reaching executeStep.
      // If we reach here, it means the approval gate was called incorrectly.
      throw new Error('approval_gate should be handled by the runner loop, not executeStep.')
    }

    default:
      throw new Error(`Unsupported step type: ${step.type}`)
  }
}
