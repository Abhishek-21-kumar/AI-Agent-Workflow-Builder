import { NextRequest, NextResponse } from 'next/server'
import { runWorkflow } from '@/lib/engine/runner'
import { fetchWorkflowWithOrgAndSteps } from '@/lib/engine/db'

/**
 * Scheduled Cron Trigger Execution Endpoint.
 *
 * Endpoint: POST /api/triggers/scheduled
 * Header: x-hasura-admin-secret
 *
 * Executed by cron schedulers / system automation to process scheduled workflow triggers.
 */
export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'nhost-admin-secret'
    const providedSecret = request.headers.get('x-hasura-admin-secret')
      || request.headers.get('x-nhost-admin-secret')

    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { message: 'Unauthorized: Request must include valid admin secret.' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const workflowId = body.workflow_id

    if (!workflowId) {
      return NextResponse.json(
        { message: 'Bad request: workflow_id is required.' },
        { status: 400 }
      )
    }

    // Load workflow
    let workflowDetails
    try {
      workflowDetails = await fetchWorkflowWithOrgAndSteps(workflowId)
    } catch {
      return NextResponse.json(
        { message: 'Workflow not found.' },
        { status: 404 }
      )
    }

    const { workflow } = workflowDetails

    if (!workflow.active) {
      return NextResponse.json(
        { message: 'Workflow is inactive.' },
        { status: 400 }
      )
    }

    // Trigger scheduled run
    const result = await runWorkflow(
      workflowId,
      workflow.created_by,
      { _scheduled_at: new Date().toISOString(), ...body.input },
      'scheduled'
    )

    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    console.error('[Scheduled Trigger Error]:', err.message)
    return NextResponse.json(
      { message: 'Internal server error processing scheduled trigger.' },
      { status: 500 }
    )
  }
}
