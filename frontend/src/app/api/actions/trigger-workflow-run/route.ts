import { NextRequest, NextResponse } from 'next/server'
import { runWorkflow } from '@/lib/engine/runner'
import type { HasuraActionPayload, TriggerWorkflowRunInput } from '@/lib/engine/types'

/**
 * Hasura Action handler for triggerWorkflowRun.
 *
 * Security model:
 * - This endpoint is called by Hasura, which forwards the Hasura admin secret
 *   to verify the request originates from the trusted GraphQL engine.
 * - x-hasura-user-id comes from Hasura's JWT verification, NOT from the client.
 * - The runner independently verifies org membership and role before executing.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate request originates from Hasura via shared admin secret.
    // Hasura forwards this header when calling Action webhooks.
    const expectedSecret = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET
    if (!expectedSecret) {
      console.error('[triggerWorkflowRun] NHOST_ADMIN_SECRET is not configured.')
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

    const body: HasuraActionPayload<TriggerWorkflowRunInput> = await request.json()

    // Extract trusted session variables (JWT-verified by Hasura before forwarding)
    const userId = body.session_variables?.['x-hasura-user-id']
    if (!userId) {
      return NextResponse.json(
        { message: 'Unauthorized: No authenticated user session.' },
        { status: 401 }
      )
    }

    const { workflow_id, input } = body.input
    if (!workflow_id) {
      return NextResponse.json(
        { message: 'Bad request: workflow_id is required.' },
        { status: 400 }
      )
    }

    // Execute workflow through the runner (which does its own auth checks)
    const result = await runWorkflow(workflow_id, userId, input || {}, 'manual')

    // Determine HTTP status based on result
    if (result.status === 'failed' && !result.run_id) {
      // Authorization or validation failure (no run was created)
      const statusCode = result.message.includes('Unauthorized') ? 403 : 400
      return NextResponse.json(result, { status: statusCode })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err: any) {
    console.error('[triggerWorkflowRun] Internal error:', err.message)
    return NextResponse.json(
      { run_id: '', status: 'failed', message: 'Internal server error.' },
      { status: 500 }
    )
  }
}
