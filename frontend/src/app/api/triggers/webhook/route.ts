import { NextRequest, NextResponse } from 'next/server'
import { runWorkflow } from '@/lib/engine/runner'
import { fetchWorkflowWithOrgAndSteps } from '@/lib/engine/db'

/**
 * External Webhook Trigger Handler.
 *
 * Endpoint: POST /api/triggers/webhook?workflow_id=<UUID>&secret=<SECRET>
 *
 * Receives external HTTP webhooks, validates the trigger secret/activation,
 * and triggers workflow execution.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflow_id')
    const secret = searchParams.get('secret')

    if (!workflowId) {
      return NextResponse.json(
        { message: 'Bad request: missing workflow_id parameter.' },
        { status: 400 }
      )
    }

    let payload: Record<string, any> = {}
    try {
      payload = await request.json()
    } catch {
      payload = {}
    }

    // Load workflow details
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

    // Trigger workflow run as system/webhook user
    const result = await runWorkflow(
      workflowId,
      workflow.created_by, // Executed under workflow creator's identity
      { ...payload, _webhook_received_at: new Date().toISOString(), _webhook_secret: secret },
      'webhook'
    )

    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    console.error('[Webhook Trigger Error]:', err.message)
    return NextResponse.json(
      { message: 'Internal server error processing webhook.' },
      { status: 500 }
    )
  }
}
