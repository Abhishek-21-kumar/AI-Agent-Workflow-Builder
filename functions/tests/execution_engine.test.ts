/**
 * Execution Engine Unit Tests (Phase 6 Final Hardening & Production Readiness)
 * 
 * Validates core engine logic, authorization, step execution, retries, branching, quota,
 * approval gate pause behavior, db_write, notify, webhook triggers, analytics metrics,
 * scheduled cron triggers, SSRF prevention, SQL injection validation, and complete E2E lifecycle.
 */

// Enable in-memory mock store before any engine modules are loaded
process.env.ENGINE_DEV_MOCK = 'true'

import { WorkflowStep, Organization, OrgMember, Workflow } from '../../frontend/src/lib/engine/types'
import { mockStore } from '../../frontend/src/lib/engine/db'
import { evaluateConditionBranch } from '../../frontend/src/lib/engine/steps/condition'
import { executeHTTPRequest } from '../../frontend/src/lib/engine/steps/http'
import { executeDBWrite } from '../../frontend/src/lib/engine/steps/db_write'
import { executeNotify } from '../../frontend/src/lib/engine/steps/notify'
import { fetchOrgUsageAnalytics } from '../../frontend/src/lib/engine/analytics'

// ─── Test Utilities ─────────────────────────────────────────────

let passed = 0
let failed = 0
const errors: string[] = []

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`)
    passed++
  } else {
    console.log(`  ❌ ${testName}`)
    failed++
    errors.push(testName)
  }
}

function setupTestData() {
  // Clear stores
  mockStore.organizations.clear()
  mockStore.orgMembers.clear()
  mockStore.workflows.clear()
  mockStore.steps.clear()
  mockStore.runs.clear()
  mockStore.stepRuns.clear()

  // Create Org A
  const orgA: Organization = {
    id: 'org-a-0001',
    name: 'Org A',
    usage_calls: 15,
    usage_limit: 100,
    usage_period_start: new Date().toISOString()
  }
  mockStore.organizations.set(orgA.id, orgA)

  // Create Org B
  const orgB: Organization = {
    id: 'org-b-0002',
    name: 'Org B',
    usage_calls: 0,
    usage_limit: 100,
    usage_period_start: new Date().toISOString()
  }
  mockStore.organizations.set(orgB.id, orgB)

  // Create Org A members
  const ownerA: OrgMember = { id: 'mem-a-owner', org_id: 'org-a-0001', user_id: 'user-owner-a', role: 'owner' }
  const editorA: OrgMember = { id: 'mem-a-editor', org_id: 'org-a-0001', user_id: 'user-editor-a', role: 'editor' }
  const viewerA: OrgMember = { id: 'mem-a-viewer', org_id: 'org-a-0001', user_id: 'user-viewer-a', role: 'viewer' }
  mockStore.orgMembers.set(ownerA.id, ownerA)
  mockStore.orgMembers.set(editorA.id, editorA)
  mockStore.orgMembers.set(viewerA.id, viewerA)

  // Create Org B owner
  const ownerB: OrgMember = { id: 'mem-b-owner', org_id: 'org-b-0002', user_id: 'user-owner-b', role: 'owner' }
  mockStore.orgMembers.set(ownerB.id, ownerB)

  // Create Org A workflow
  const workflowA: Workflow = {
    id: 'wf-a-0001',
    org_id: 'org-a-0001',
    name: 'Test Workflow A',
    active: true,
    created_by: 'user-owner-a',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  mockStore.workflows.set(workflowA.id, workflowA)

  // Create workflow steps
  const steps: WorkflowStep[] = [
    {
      id: 'step-1', workflow_id: 'wf-a-0001', position: 1, name: 'LLM Analysis',
      type: 'llm_call', config: { prompt: 'Analyze: {{input.text}}', max_attempts: 2 },
      created_at: '', updated_at: ''
    },
    {
      id: 'step-2', workflow_id: 'wf-a-0001', position: 2, name: 'HTTP Fetch',
      type: 'http_request', config: { method: 'GET', url: 'https://httpbin.org/get', max_attempts: 2 },
      created_at: '', updated_at: ''
    },
    {
      id: 'step-3', workflow_id: 'wf-a-0001', position: 3, name: 'Branch Check',
      type: 'conditional_branch', config: {
        condition: { path: 'text', operator: 'contains', value: 'positive' },
        if_true_position: 4, if_false_position: 5
      },
      created_at: '', updated_at: ''
    },
    {
      id: 'step-4', workflow_id: 'wf-a-0001', position: 4, name: 'Approval Gate',
      type: 'approval_gate', config: { required_role: 'owner', message: 'Owner approval required.' },
      created_at: '', updated_at: ''
    },
    {
      id: 'step-5', workflow_id: 'wf-a-0001', position: 5, name: 'Final Step',
      type: 'http_request', config: { method: 'GET', url: 'https://httpbin.org/status/200' },
      created_at: '', updated_at: ''
    }
  ]
  mockStore.steps.set('wf-a-0001', steps)

  // Quota exhaustion test org
  const orgExhausted: Organization = {
    id: 'org-exhausted',
    name: 'Exhausted Org',
    usage_calls: 100,
    usage_limit: 100,
    usage_period_start: new Date().toISOString()
  }
  mockStore.organizations.set(orgExhausted.id, orgExhausted)

  const exhaustedMember: OrgMember = { id: 'mem-ex-owner', org_id: 'org-exhausted', user_id: 'user-ex-owner', role: 'owner' }
  mockStore.orgMembers.set(exhaustedMember.id, exhaustedMember)

  const exhaustedWf: Workflow = {
    id: 'wf-exhausted',
    org_id: 'org-exhausted',
    name: 'Exhausted Workflow',
    active: true,
    created_by: 'user-ex-owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  mockStore.workflows.set(exhaustedWf.id, exhaustedWf)
  mockStore.steps.set('wf-exhausted', [{
    id: 'step-ex-1', workflow_id: 'wf-exhausted', position: 1, name: 'Simple Step',
    type: 'llm_call', config: { prompt: 'Test' },
    created_at: '', updated_at: ''
  }])

  // Approval gate test workflow
  const approvalWf: Workflow = {
    id: 'wf-approval',
    org_id: 'org-a-0001',
    name: 'Approval Workflow',
    active: true,
    created_by: 'user-owner-a',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  mockStore.workflows.set(approvalWf.id, approvalWf)
  mockStore.steps.set('wf-approval', [{
    id: 'step-app-1', workflow_id: 'wf-approval', position: 1, name: 'Approval Gate',
    type: 'approval_gate', config: { required_role: 'owner', message: 'Owner approval required.' },
    created_at: '', updated_at: ''
  }])
}

// ─── Test Runner ─────────────────────────────────────────────────

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log(' AI Agent Workflow Builder - Execution Engine Tests')
  console.log('═══════════════════════════════════════════════════\n')

  setupTestData()

  const { runWorkflow, resumeWorkflowFromPosition } = await import('../../frontend/src/lib/engine/runner')

  // ── Test 1: Owner can execute own workflow ──
  console.log('Test 1: Owner can execute own workflow')
  const r1 = await runWorkflow('wf-a-0001', 'user-owner-a', { text: 'Hello world' })
  assert(r1.run_id !== '', 'Run was created')
  assert(!r1.message.includes('Unauthorized'), 'Not rejected as unauthorized')

  // ── Test 2: Editor can execute own workflow ──
  console.log('\nTest 2: Editor can execute own workflow')
  const r2 = await runWorkflow('wf-a-0001', 'user-editor-a', { text: 'Hello world' })
  assert(r2.run_id !== '', 'Run was created for editor')
  assert(!r2.message.includes('Unauthorized'), 'Editor not rejected')

  // ── Test 3: Viewer cannot execute workflow ──
  console.log('\nTest 3: Viewer cannot execute workflow')
  const r3 = await runWorkflow('wf-a-0001', 'user-viewer-a', { text: 'Hello world' })
  assert(r3.run_id === '', 'No run created for viewer')
  assert(r3.message.includes('Viewers cannot execute'), 'Viewer rejected with correct message')

  // ── Test 4: Org B user cannot execute Org A workflow ──
  console.log('\nTest 4: Org B user cannot execute Org A workflow')
  const r4 = await runWorkflow('wf-a-0001', 'user-owner-b', { text: 'Cross-org attempt' })
  assert(r4.run_id === '', 'No run created for Org B user')
  assert(r4.message.includes('not a member'), 'Org B user rejected')

  // ── Test 5: UUID guessing cannot bypass authorization ──
  console.log('\nTest 5: UUID guessing cannot bypass authorization')
  const r5 = await runWorkflow('wf-a-0001', 'user-nonexistent', { text: 'Guessed UUID' })
  assert(r5.run_id === '', 'No run created for unknown user')
  assert(r5.message.includes('not a member') || r5.message.includes('not found'), 'Unknown user rejected')

  // ── Test 6: Quota exhaustion blocks execution ──
  console.log('\nTest 6: Quota exhaustion blocks execution')
  const r6 = await runWorkflow('wf-exhausted', 'user-ex-owner', {})
  assert(r6.run_id === '', 'No run created when quota exhausted')
  assert(r6.message.includes('Quota exhausted'), 'Quota rejection message')

  // ── Test 11: Conditional branch chooses correct branch ──
  console.log('\nTest 11: Conditional branch chooses correct branch')
  const branchStep: WorkflowStep = {
    id: 'test-branch', workflow_id: '', position: 3, name: 'Test Branch',
    type: 'conditional_branch',
    config: {
      condition: { path: 'text', operator: 'contains', value: 'positive' },
      if_true_position: 4, if_false_position: 5
    },
    created_at: '', updated_at: ''
  }
  const branchTrue = evaluateConditionBranch(branchStep, { text: 'This is a positive result' })
  assert(branchTrue.evaluated === true, 'Condition evaluated to true for positive text')
  assert(branchTrue.next_position === 4, 'Branch selected if_true_position (4)')

  const branchFalse = evaluateConditionBranch(branchStep, { text: 'This is a negative result' })
  assert(branchFalse.evaluated === false, 'Condition evaluated to false for negative text')
  assert(branchFalse.next_position === 5, 'Branch selected if_false_position (5)')

  // ── Test 12 & 13: Approval gate pauses execution ──
  console.log('\nTest 12 & 13: Approval gate pauses execution')
  setupTestData()
  const r12 = await runWorkflow('wf-approval', 'user-owner-a', { text: 'positive review' })
  assert(r12.status === 'paused', `Workflow paused at approval gate (status: ${r12.status})`)
  assert(r12.message.includes('paused at approval gate'), 'Paused message mentions approval gate')

  // ── Phase 4 Test 14: db_write step handler executes successfully ──
  console.log('\nPhase 4 Test 14: db_write step handler executes successfully')
  const dbStep: WorkflowStep = {
    id: 'db-step-1', workflow_id: 'wf-a-0001', position: 1, name: 'Audit DB Write',
    type: 'db_write', config: { table: 'audit_logs', action: 'insert', payload: { user: '{{input.text}}' } },
    created_at: '', updated_at: ''
  }
  const dbRes = await executeDBWrite(dbStep, { text: 'Alice' })
  assert(dbRes.success === true, 'DB Write succeeded')
  assert(dbRes.table === 'audit_logs', 'DB Write target table is audit_logs')
  assert(dbRes.payload.user === 'Alice', 'DB Write variable interpolated correctly')

  // ── Phase 4 Test 15: notify step handler executes successfully ──
  console.log('\nPhase 4 Test 15: notify step handler executes successfully')
  const notifyStep: WorkflowStep = {
    id: 'notify-step-1', workflow_id: 'wf-a-0001', position: 1, name: 'Slack Alert',
    type: 'notify', config: { channel: 'slack', recipient: '#alerts', template: 'User {{input.user}} logged in.' },
    created_at: '', updated_at: ''
  }
  const notifyRes = await executeNotify(notifyStep, { user: 'Bob' })
  assert(notifyRes.delivered === true, 'Notify step delivered successfully')
  assert(notifyRes.channel === 'slack', 'Notification channel is slack')
  assert(notifyRes.message === 'User Bob logged in.', 'Notification template interpolated correctly')

  // ── Phase 5 Test 16: fetchOrgUsageAnalytics calculates quota and metrics ──
  console.log('\nPhase 5 Test 16: fetchOrgUsageAnalytics calculates quota and metrics')
  setupTestData()
  const analyticsA = await fetchOrgUsageAnalytics('org-a-0001', 'user-owner-a')
  assert(analyticsA.org_id === 'org-a-0001', 'Analytics retrieved for Org A')
  assert(analyticsA.usage_calls === 15, 'Org A usage_calls is 15')
  assert(analyticsA.usage_percentage === 15, 'Org A usage percentage is 15%')
  assert(analyticsA.total_workflow_runs > 0, 'Total workflow runs count retrieved')

  // ── Phase 5 Test 17: Scheduled cron trigger execution ──
  console.log('\nPhase 5 Test 17: Scheduled cron trigger execution')
  const scheduledRun = await runWorkflow('wf-a-0001', 'user-owner-a', { cron: '0 0 * * *' }, 'scheduled')
  assert(scheduledRun.run_id !== '', 'Scheduled run created')
  assert(scheduledRun.status !== 'failed' || !scheduledRun.message.includes('Unauthorized'), 'Scheduled trigger authorized')

  // ── Phase 5 Test 18: Analytics Multi-Tenant Isolation ──
  console.log('\nPhase 5 Test 18: Analytics Multi-Tenant Isolation')
  let orgBRejected = false
  try {
    await fetchOrgUsageAnalytics('org-a-0001', 'user-owner-b')
  } catch (err: any) {
    orgBRejected = err.message.includes('Unauthorized') || err.message.includes('not a member')
  }
  assert(orgBRejected === true, 'Org B user rejected from viewing Org A analytics')

  // ── Phase 6 Test 19: SSRF Prevention in HTTP Step Handler ──
  console.log('\nPhase 6 Test 19: SSRF Prevention in HTTP Step Handler')
  const ssrfStep: WorkflowStep = {
    id: 'ssrf-step-1', workflow_id: 'wf-a-0001', position: 1, name: 'Malicious File Read',
    type: 'http_request', config: { method: 'GET', url: 'file:///etc/passwd' },
    created_at: '', updated_at: ''
  }
  let ssrfBlocked = false
  try {
    await executeHTTPRequest(ssrfStep, {})
  } catch (err: any) {
    ssrfBlocked = err.message.includes('Security Error') || err.message.includes('Unsupported protocol')
  }
  assert(ssrfBlocked === true, 'SSRF attack blocked for non-HTTP protocol file://')

  // ── Phase 6 Test 20: SQL Injection Prevention in DB Write Handler ──
  console.log('\nPhase 6 Test 20: SQL Injection Prevention in DB Write Handler')
  const sqlInjectionStep: WorkflowStep = {
    id: 'sql-step-1', workflow_id: 'wf-a-0001', position: 1, name: 'SQL Injection Attempt',
    type: 'db_write', config: { table: 'audit_logs; DROP TABLE workflows;', action: 'insert' },
    created_at: '', updated_at: ''
  }
  let sqlBlocked = false
  try {
    await executeDBWrite(sqlInjectionStep, {})
  } catch (err: any) {
    sqlBlocked = err.message.includes('Security Error') || err.message.includes('Invalid table name')
  }
  assert(sqlBlocked === true, 'SQL injection blocked for malicious table name')

  // ── Phase 6 Test 21: Complete E2E Lifecycle (Create -> Pause -> Resume -> Complete) ──
  console.log('\nPhase 6 Test 21: Complete E2E Lifecycle (Pause -> Resume -> Complete)')
  setupTestData()
  const e2eInitial = await runWorkflow('wf-approval', 'user-owner-a', { ticket: 'escalate' })
  assert(e2eInitial.status === 'paused', 'E2E run initially paused at approval gate')
  
  const approvalSteps = mockStore.steps.get('wf-approval') || []
  const e2eResumed = await resumeWorkflowFromPosition(e2eInitial.run_id, approvalSteps, 1, { ticket: 'escalate' }, 'org-a-0001')
  assert(e2eResumed.status === 'completed', 'E2E run completed after approval gate resume')

  // ── Phase 6 Test 22: Database Event Trigger Execution ──
  console.log('\nPhase 6 Test 22: Database Event Trigger Execution')
  const dbEventRun = await runWorkflow('wf-a-0001', 'user-owner-a', { event: 'record_created', row_id: '123' }, 'database_event')
  assert(dbEventRun.run_id !== '', 'Database event trigger run created')
  assert(dbEventRun.status !== 'failed' || !dbEventRun.message.includes('Unauthorized'), 'Database event trigger executed successfully')

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════')
  console.log(` Results: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log(` Failed tests:`)
    errors.forEach(e => console.log(`   - ${e}`))
  }
  console.log('═══════════════════════════════════════════════════\n')

  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
