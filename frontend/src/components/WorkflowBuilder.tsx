'use client'

import React, { useState } from 'react'

interface StepConfig {
  [key: string]: any
}

interface Step {
  id: string
  position: number
  name: string
  type: 'llm_call' | 'http_request' | 'conditional_branch' | 'approval_gate' | 'db_write' | 'notify'
  config: StepConfig
}

interface WorkflowItem {
  id: string
  name: string
  description: string
  active: boolean
  steps: Step[]
}

interface WorkflowBuilderProps {
  userRole: string
  onRunTriggered: (runId: string) => void
}

export function WorkflowBuilder({ userRole, onRunTriggered }: WorkflowBuilderProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    {
      id: 'wf-demo-001',
      name: 'Customer Support Sentiment & Escalation',
      description: 'Analyze sentiment via LLM, route via conditional branch, and seek owner approval for high risk actions.',
      active: true,
      steps: [
        {
          id: 'step-1',
          position: 1,
          name: 'LLM Sentiment Analysis',
          type: 'llm_call',
          config: { provider: 'groq', model: 'llama-3.3-70b-versatile', prompt: 'Analyze sentiment: {{input.ticket_text}}' }
        },
        {
          id: 'step-2',
          position: 2,
          name: 'HTTP Fetch Metadata',
          type: 'http_request',
          config: { method: 'GET', url: 'https://httpbin.org/get?user={{input.user_id}}' }
        },
        {
          id: 'step-3',
          position: 3,
          name: 'Evaluate Risk Branch',
          type: 'conditional_branch',
          config: { condition: { path: 'text', operator: 'contains', value: 'urgent' }, if_true_position: 4, if_false_position: 5 }
        },
        {
          id: 'step-4',
          position: 4,
          name: 'Owner Approval Gate',
          type: 'approval_gate',
          config: { required_role: 'owner', message: 'Owner approval required for urgent escalation.' }
        },
        {
          id: 'step-5',
          position: 5,
          name: 'DB Audit Log',
          type: 'db_write',
          config: { table: 'audit_logs', action: 'insert', payload: { status: 'processed' } }
        },
        {
          id: 'step-6',
          position: 6,
          name: 'Slack Notification',
          type: 'notify',
          config: { channel: 'slack', recipient: '#alerts', template: 'Workflow completed for {{input.user_id}}' }
        }
      ]
    }
  ])

  const [selectedWfId, setSelectedWfId] = useState<string>('wf-demo-001')
  const [inputText, setInputText] = useState<string>('Customer is expressing urgent dissatisfaction with delayed order #4920')
  const [userId, setUserId] = useState<string>('user-owner-a')
  const [executing, setExecuting] = useState<boolean>(false)
  const [executionResult, setExecutionResult] = useState<any>(null)

  // New step form
  const [newStepName, setNewStepName] = useState('')
  const [newStepType, setNewStepType] = useState<Step['type']>('llm_call')

  const currentWf = workflows.find(w => w.id === selectedWfId) || workflows[0]

  const handleRunWorkflow = async () => {
    if (userRole === 'viewer') {
      alert('Permission Denied: Viewers cannot execute workflows.')
      return
    }

    setExecuting(true)
    setExecutionResult(null)

    try {
      const res = await fetch('/api/actions/trigger-workflow-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': 'nhost-admin-secret'
        },
        body: JSON.stringify({
          action: { name: 'triggerWorkflowRun' },
          input: {
            workflow_id: currentWf.id,
            input: { ticket_text: inputText, user_id: userId }
          },
          session_variables: {
            'x-hasura-user-id': userId,
            'x-hasura-role': userRole
          }
        })
      })

      const data = await res.json()
      setExecutionResult(data)
      if (data.run_id) {
        onRunTriggered(data.run_id)
      }
    } catch (err: any) {
      setExecutionResult({ status: 'failed', message: err.message || 'Execution error' })
    } finally {
      setExecuting(false)
    }
  }

  const handleAddStep = () => {
    if (!newStepName) return
    if ((newStepType === 'db_write' || newStepType === 'notify') && userRole !== 'owner') {
      alert(`Permission Denied: Creating "${newStepType}" steps requires the "owner" role. Current role: "${userRole}".`)
      return
    }

    const nextPos = (currentWf.steps.length > 0 ? Math.max(...currentWf.steps.map(s => s.position)) : 0) + 1
    const newStep: Step = {
      id: `step-${Date.now()}`,
      position: nextPos,
      name: newStepName,
      type: newStepType,
      config: newStepType === 'llm_call' ? { prompt: 'Analyze: {{input.text}}' } :
              newStepType === 'http_request' ? { method: 'GET', url: 'https://httpbin.org/get' } :
              newStepType === 'conditional_branch' ? { condition: { path: 'text', operator: 'contains', value: 'positive' } } :
              newStepType === 'approval_gate' ? { required_role: 'owner', message: 'Sign-off required' } :
              newStepType === 'db_write' ? { table: 'audit_logs', action: 'insert' } :
              { channel: 'slack', recipient: '#alerts', template: 'Alert: {{input.text}}' }
    }

    setWorkflows(prev => prev.map(w => w.id === currentWf.id ? { ...w, steps: [...w.steps, newStep] } : w))
    setNewStepName('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">{currentWf.name}</h2>
          <p className="text-zinc-400 text-xs mt-1">{currentWf.description}</p>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
            currentWf.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            {currentWf.active ? 'Active' : 'Inactive'}
          </span>
          <button
            onClick={handleRunWorkflow}
            disabled={executing || userRole === 'viewer'}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
          >
            {executing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Executing...</span>
              </>
            ) : (
              <span>Trigger Execution Run</span>
            )}
          </button>
        </div>
      </div>

      {/* Execution Payload Input Form */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Run Trigger Input Payload</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <label className="block text-zinc-400 mb-1">Authenticated User ID (x-hasura-user-id)</label>
            <input
              type="text"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-zinc-400 mb-1">Input Text (ticket_text)</label>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-zinc-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Execution Result Alert */}
      {executionResult && (
        <div className={`p-4 border rounded-xl text-xs font-mono space-y-2 ${
          executionResult.status === 'completed' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' :
          executionResult.status === 'paused' ? 'bg-amber-950/40 border-amber-800/60 text-amber-300' :
          'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          <div className="flex items-center justify-between font-bold">
            <span>Execution Status: {executionResult.status?.toUpperCase()}</span>
            {executionResult.run_id && <span className="text-[10px] text-zinc-400">Run ID: {executionResult.run_id}</span>}
          </div>
          <p>{executionResult.message}</p>
        </div>
      )}

      {/* Steps Pipeline View */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white tracking-tight">Ordered Workflow Steps ({currentWf.steps.length})</h3>
        </div>

        <div className="space-y-3">
          {currentWf.steps.map((step) => (
            <div key={step.id} className="bg-zinc-900 border border-zinc-800/90 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-zinc-700 transition-all">
              <div className="flex items-center space-x-3">
                <span className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 font-mono font-bold text-xs flex items-center justify-center border border-zinc-700">
                  {step.position}
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">{step.name}</h4>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                    Type: <span className="text-indigo-400 font-semibold">{step.type}</span>
                  </p>
                </div>
              </div>

              {/* Step Type Badges */}
              <div className="flex items-center space-x-2 text-[10px] font-mono">
                {step.type === 'llm_call' && (
                  <span className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-md">
                    LLM: {step.config?.model || 'groq'}
                  </span>
                )}
                {step.type === 'http_request' && (
                  <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-md">
                    HTTP {step.config?.method || 'GET'}
                  </span>
                )}
                {step.type === 'conditional_branch' && (
                  <span className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-md">
                    Branch Target: {step.config?.if_true_position} / {step.config?.if_false_position}
                  </span>
                )}
                {step.type === 'approval_gate' && (
                  <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-md">
                    Role Gate: {step.config?.required_role || 'owner'}
                  </span>
                )}
                {step.type === 'db_write' && (
                  <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md">
                    DB Write (Owner Only)
                  </span>
                )}
                {step.type === 'notify' && (
                  <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-md">
                    Notify (Owner Only)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Step Form */}
      <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Configure New Step</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Step Name (e.g. Email Alert)"
            value={newStepName}
            onChange={e => setNewStepName(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={newStepType}
            onChange={e => setNewStepType(e.target.value as Step['type'])}
            className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
          >
            <option value="llm_call">llm_call (LLM API Prompt)</option>
            <option value="http_request">http_request (Outbound HTTP)</option>
            <option value="conditional_branch">conditional_branch (Path Evaluator)</option>
            <option value="approval_gate">approval_gate (Human Pause)</option>
            <option value="db_write">db_write (Restricted: Owner Only)</option>
            <option value="notify">notify (Restricted: Owner Only)</option>
          </select>
          <button
            onClick={handleAddStep}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold text-xs py-2.5 rounded-lg transition-all cursor-pointer"
          >
            + Add Step to Pipeline
          </button>
        </div>
        {(newStepType === 'db_write' || newStepType === 'notify') && userRole !== 'owner' && (
          <p className="text-[11px] text-amber-400 font-mono">
            ⚠️ Restricted Step: Creating "{newStepType}" steps requires the "owner" role. Current context: "{userRole}".
          </p>
        )}
      </div>
    </div>
  )
}
