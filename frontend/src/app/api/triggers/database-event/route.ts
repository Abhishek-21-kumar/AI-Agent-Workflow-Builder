import { NextRequest, NextResponse } from 'next/server'
import { runWorkflow } from '@/lib/engine/runner'
import { fetchWorkflowWithOrgAndSteps } from '@/lib/engine/db'

/**
 * Hasura Database Event Trigger Endpoint.
 *
 * Endpoint: POST /api/triggers/database-event
 * Header: x-hasura-admin-secret
 *
 * Triggered by Hasura Event Triggers when a new record is inserted into `public.workflow_events`.
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

    // Handle both Hasura Event Trigger envelope ({ event: { data: { new: ... } } }) and raw POST
    const eventNew = body.event?.data?.new || body
    const workflowId = eventNew.workflow_id || body.workflow_id
    const payload = eventNew.payload || body.payload || {}
    const eventName = eventNew.event_name || 'database_event'

    if (!workflowId) {
      return NextResponse.json(
        { message: 'Bad request: workflow_id is required in event payload.' },
        { status: 400 }
      )
    }

    // Load workflow and verify active status
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

    // Trigger workflow run with 'database_event' trigger type
    const result = await runWorkflow(
      workflowId,
      workflow.created_by,
      { _event_name: eventName, ...payload },
      'database_event'
    )

    return NextResponse.json({
      event_name: eventName,
      ...result,
      info: 'Database Event Trigger executed successfully.'
    }, { status: 200 })

  } catch (err: unknown) {
    console.error('[Database Event Trigger Error]:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { message: 'Internal server error processing database event trigger.' },
      { status: 500 }
    )
  }
}
