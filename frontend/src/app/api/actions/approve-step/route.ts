import { NextRequest, NextResponse } from 'next/server'
import { HasuraActionPayload, ApproveStepRunInput } from '@/lib/engine/types'
import {
  fetchStepRunDetails,
  verifyUserOrgRole,
  updateStepRunState,
  fetchWorkflowWithOrgAndSteps
} from '@/lib/engine/db'
import { resumeWorkflowFromPosition } from '@/lib/engine/runner'

/**
 * Hasura Action handler for approveStepRun.
 *
 * Security & Validation model:
 * - Requires x-hasura-admin-secret matching configured backend secret.
 * - Receives x-hasura-user-id from trusted Hasura session variables (JWT-verified).
 * - Verifies the step_run status is 'waiting' and workflow_run status is 'paused'.
 * - Verifies the approver is a member of the workflow's organization.
 * - Checks role against the approval_gate config's required_role (defaults to owner).
 * - Rejects re-approval of already completed or non-paused runs.
 */
export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET
    if (!expectedSecret) {
      console.error('[approveStepRun] NHOST_ADMIN_SECRET is not configured.')
      return NextResponse.json(
        { message: 'Server misconfiguration: admin secret not set.' },
        { status: 500 }
      )
    }

    const providedSecret = request.headers.get('x-hasura-admin-secret')
      || request.headers.get('x-nhost-admin-secret')

    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { message: 'Unauthorized: Request must originate from Hasura.' },
        { status: 401 }
      )
    }

    const body: HasuraActionPayload<ApproveStepRunInput> = await request.json()

    const userId = body.session_variables?.['x-hasura-user-id']
    if (!userId) {
      return NextResponse.json(
        { message: 'Unauthorized: No authenticated user session.' },
        { status: 401 }
      )
    }

    const { step_run_id } = body.input
    if (!step_run_id) {
      return NextResponse.json(
        { message: 'Bad request: step_run_id is required.' },
        { status: 400 }
      )
    }

    // 1. Load step_run, workflow_run, workflow, and step details
    let details
    try {
      details = await fetchStepRunDetails(step_run_id)
    } catch {
      return NextResponse.json(
        { step_run_id, status: 'failed', message: 'Step run not found.' },
        { status: 404 }
      )
    }

    const { stepRun, workflowRun, workflow, step } = details

    // 2. Verify step_run is waiting AND parent workflow_run is paused
    if (stepRun.status !== 'waiting') {
      return NextResponse.json(
        { step_run_id, status: stepRun.status, message: `Step run is not awaiting approval. Current status: ${stepRun.status}` },
        { status: 400 }
      )
    }

    if (workflowRun.status !== 'paused') {
      return NextResponse.json(
        { step_run_id, status: workflowRun.status, message: `Cannot approve step: Workflow run is in status "${workflowRun.status}" (must be "paused").` },
        { status: 400 }
      )
    }

    // 3. Verify approver is a member of the workflow's organization
    const member = await verifyUserOrgRole(userId, workflow.org_id)
    if (!member) {
      return NextResponse.json(
        { step_run_id, status: 'failed', message: 'Unauthorized: You are not a member of this workflow\'s organization.' },
        { status: 403 }
      )
    }

    // 4. Check required role from approval_gate config
    const requiredRole = step.config?.required_role || 'owner'
    const roleHierarchy: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
    const memberLevel = roleHierarchy[member.role] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 3

    if (memberLevel < requiredLevel) {
      return NextResponse.json(
        { step_run_id, status: 'failed', message: `Unauthorized: Approval requires "${requiredRole}" role. Your role: "${member.role}".` },
        { status: 403 }
      )
    }

    // 5. Approve the step run
    await updateStepRunState(stepRun.id, 'completed', {
      approved: true,
      approved_by_user: userId,
      approved_by_role: member.role,
      message: 'Approval granted.'
    }, undefined, stepRun.attempt_count, userId)

    // 6. Resume workflow execution from the next step
    let workflowDetails
    try {
      workflowDetails = await fetchWorkflowWithOrgAndSteps(workflow.id)
    } catch {
      return NextResponse.json(
        { step_run_id: stepRun.id, status: 'completed', message: 'Step approved. Could not resume workflow (workflow not found).' },
        { status: 200 }
      )
    }

    const resumeResult = await resumeWorkflowFromPosition(
      workflowRun.id,
      workflowDetails.steps,
      step.position,
      stepRun.output,
      workflow.org_id
    )

    return NextResponse.json({
      step_run_id: stepRun.id,
      status: resumeResult.status,
      message: `Step approved. ${resumeResult.message}`
    }, { status: 200 })

  } catch (err: any) {
    console.error('[approveStepRun] Internal error:', err.message)
    return NextResponse.json(
      { step_run_id: '', status: 'failed', message: 'Internal server error.' },
      { status: 500 }
    )
  }
}
