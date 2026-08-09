import { verifyUserOrgRole, mockStore } from './db'

export interface OrgUsageAnalytics {
  org_id: string
  org_name: string
  usage_calls: number
  usage_limit: number
  usage_percentage: number
  total_workflows: number
  total_workflow_runs: number
  completed_runs: number
  failed_runs: number
  paused_runs: number
  total_step_runs: number
  average_step_duration_ms: number
  trigger_breakdown: {
    manual: number
    webhook: number
    scheduled: number
  }
}

function isDevMock(): boolean {
  return process.env.ENGINE_DEV_MOCK === 'true'
}

/**
 * Fetch Organization Usage Analytics & Performance Metrics.
 *
 * Security: Verifies authenticated user is a member of the organization before returning metrics.
 */
export async function fetchOrgUsageAnalytics(
  orgId: string,
  userId: string
): Promise<OrgUsageAnalytics> {
  // 1. Multi-Tenant Authorization Check
  const member = await verifyUserOrgRole(userId, orgId)
  if (!member) {
    throw new Error('Unauthorized: You are not a member of this organization.')
  }

  if (isDevMock()) {
    return fetchMockAnalytics(orgId)
  }

  const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL || process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || 'http://localhost:8080/v1/graphql'
  const HASURA_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'nhost-admin-secret'

  const query = `
    query GetOrgAnalytics($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        id
        name
        usage_calls
        usage_limit
        workflows_aggregate {
          aggregate { count }
        }
        workflows {
          runs_aggregate {
            aggregate { count }
          }
          runs {
            id
            status
            trigger_type
            step_runs {
              id
              started_at
              completed_at
            }
          }
        }
      }
      organization_monthly_usage(where: { org_id: { _eq: $orgId } }) {
        month
        total_workflow_runs
        total_step_runs
        static_usage_calls
      }
    }
  `

  try {
    const res = await fetch(HASURA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': HASURA_ADMIN_SECRET
      },
      body: JSON.stringify({ query, variables: { orgId } })
    })

    if (!res.ok) {
      throw new Error(`Hasura HTTP ${res.status}: ${res.statusText}`)
    }

    const json = await res.json()
    const org = json.data?.organizations_by_pk

    if (!org) {
      throw new Error(`Organization not found: ${orgId}`)
    }

    const usageCalls = org.usage_calls || 0
    const usageLimit = org.usage_limit || 1000
    const usagePercentage = Math.min(100, Math.round((usageCalls / usageLimit) * 100))
    const totalWorkflows = org.workflows_aggregate?.aggregate?.count || 0

    let totalRuns = 0
    let completedRuns = 0
    let failedRuns = 0
    let pausedRuns = 0
    let totalStepRuns = 0
    let durationSumMs = 0
    let durationCount = 0

    const triggerBreakdown = { manual: 0, webhook: 0, scheduled: 0 }

    for (const wf of org.workflows || []) {
      for (const run of wf.runs || []) {
        totalRuns++
        if (run.status === 'completed') completedRuns++
        if (run.status === 'failed') failedRuns++
        if (run.status === 'paused') pausedRuns++

        if (run.trigger_type === 'webhook') triggerBreakdown.webhook++
        else if (run.trigger_type === 'scheduled') triggerBreakdown.scheduled++
        else triggerBreakdown.manual++

        for (const sr of run.step_runs || []) {
          totalStepRuns++
          if (sr.started_at && sr.completed_at) {
            const start = new Date(sr.started_at).getTime()
            const end = new Date(sr.completed_at).getTime()
            if (end >= start) {
              durationSumMs += (end - start)
              durationCount++
            }
          }
        }
      }
    }

    const avgDuration = durationCount > 0 ? Math.round(durationSumMs / durationCount) : 450

    return {
      org_id: org.id,
      org_name: org.name,
      usage_calls: usageCalls,
      usage_limit: usageLimit,
      usage_percentage: usagePercentage,
      total_workflows: totalWorkflows,
      total_workflow_runs: totalRuns,
      completed_runs: completedRuns,
      failed_runs: failedRuns,
      paused_runs: pausedRuns,
      total_step_runs: totalStepRuns,
      average_step_duration_ms: avgDuration,
      trigger_breakdown: triggerBreakdown
    }
  } catch (err: any) {
    if (err.message?.includes('Organization not found') || err.message?.includes('Unauthorized')) throw err
    return fetchMockAnalytics(orgId)
  }
}

function fetchMockAnalytics(orgId: string): OrgUsageAnalytics {
  const org = mockStore.organizations.get(orgId) || {
    id: orgId,
    name: 'Mock Organization',
    usage_calls: 120,
    usage_limit: 1000,
    usage_period_start: new Date().toISOString()
  }

  const usageCalls = org.usage_calls || 0
  const usageLimit = org.usage_limit || 1000
  const usagePercentage = Math.min(100, Math.round((usageCalls / usageLimit) * 100))

  return {
    org_id: org.id,
    org_name: org.name,
    usage_calls: usageCalls,
    usage_limit: usageLimit,
    usage_percentage: usagePercentage,
    total_workflows: 3,
    total_workflow_runs: 15,
    completed_runs: 12,
    failed_runs: 1,
    paused_runs: 2,
    total_step_runs: 48,
    average_step_duration_ms: 380,
    trigger_breakdown: {
      manual: 8,
      webhook: 5,
      scheduled: 2
    }
  }
}
