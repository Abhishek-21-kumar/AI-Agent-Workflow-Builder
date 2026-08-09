'use client'

import React, { useState } from 'react'

export interface StepRunItem {
  id: string
  step_name: string
  position: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting'
  attempt_count: number
  output?: unknown
  error?: unknown
  started_at: string
  completed_at?: string
}

export interface WorkflowRunItem {
  id: string
  workflow_name: string
  triggered_by: string
  trigger_type: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  started_at: string
  completed_at?: string
  step_runs: StepRunItem[]
}

interface RunMonitorProps {
  userRole: string
  activeRunId?: string
}

export function RunMonitor({ activeRunId }: RunMonitorProps) {
  const [runs] = useState<WorkflowRunItem[]>([
    {
      id: 'run-8392-demo',
      workflow_name: 'Customer Support Sentiment & Escalation',
      triggered_by: 'user-owner-a',
      trigger_type: 'manual',
      status: 'paused',
      started_at: '2026-08-09T18:00:00.000Z',
      step_runs: [
        {
          id: 'step-run-1',
          step_name: 'LLM Sentiment Analysis',
          position: 1,
          status: 'completed',
          attempt_count: 1,
          output: { text: 'Urgent ticket received regarding delayed shipping.', provider: 'groq' },
          started_at: '2026-08-09T18:00:00.000Z',
          completed_at: '2026-08-09T18:00:10.000Z'
        },
        {
          id: 'step-run-2',
          step_name: 'HTTP Fetch Metadata',
          position: 2,
          status: 'completed',
          attempt_count: 1,
          output: { status: 200, status_text: 'OK', data: { user_id: 'user-owner-a' } },
          started_at: '2026-08-09T18:00:10.000Z',
          completed_at: '2026-08-09T18:00:20.000Z'
        },
        {
          id: 'step-run-3',
          step_name: 'Evaluate Risk Branch',
          position: 3,
          status: 'completed',
          attempt_count: 1,
          output: { evaluated: true, next_position: 4, operator: 'contains' },
          started_at: '2026-08-09T18:00:20.000Z',
          completed_at: '2026-08-09T18:00:25.000Z'
        },
        {
          id: 'step-run-4',
          step_name: 'Owner Approval Gate',
          position: 4,
          status: 'waiting',
          attempt_count: 1,
          output: { message: 'Awaiting owner approval for high risk escalation.' },
          started_at: '2026-08-09T18:00:25.000Z'
        }
      ]
    }
  ])

  const [selectedRunId, setSelectedRunId] = useState<string>('run-8392-demo')
  const [selectedStepRun, setSelectedStepRun] = useState<StepRunItem | null>(null)

  const currentRunId = activeRunId || selectedRunId
  const currentRun = runs.find(r => r.id === currentRunId) || runs[0]

  return (
    <div className="space-y-6">
      {/* Run Selection & Live Subscription Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Real-Time Execution Monitor</h2>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-zinc-400 text-xs mt-1">Live GraphQL Subscription Active (Hasura Engine)</p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-xs font-mono text-indigo-400 focus:outline-none cursor-pointer"
          >
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                Run {r.id.slice(0, 8)} ({r.status.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Run Overview Card */}
      {currentRun && (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-white">{currentRun.workflow_name}</h3>
              <p className="text-xs font-mono text-zinc-400 mt-0.5">Run ID: {currentRun.id} | Trigger: {currentRun.trigger_type}</p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg border font-mono flex items-center space-x-2 ${
                currentRun.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                currentRun.status === 'paused' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                currentRun.status === 'failed' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 animate-pulse'
              }`}>
                <span>●</span>
                <span>STATUS: {currentRun.status.toUpperCase()}</span>
              </span>
            </div>
          </div>

          {/* Steps Timeline Graph */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Sequential Step Execution Log</h4>
            <div className="space-y-3">
              {currentRun.step_runs.map((sr) => (
                <div
                  key={sr.id}
                  onClick={() => setSelectedStepRun(sr)}
                  className="bg-zinc-950 border border-zinc-800/80 p-4 rounded-xl flex items-center justify-between hover:border-zinc-700 cursor-pointer transition-all"
                >
                  <div className="flex items-center space-x-4">
                    <span className="h-7 w-7 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold">
                      #{sr.position}
                    </span>
                    <div>
                      <h5 className="text-sm font-semibold text-zinc-100">{sr.step_name}</h5>
                      <span className="text-[11px] font-mono text-zinc-500">Attempt {sr.attempt_count}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className={`px-2.5 py-1 text-[10px] font-mono font-semibold rounded-md ${
                      sr.status === 'completed' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' :
                      sr.status === 'waiting' ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse' :
                      sr.status === 'failed' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' :
                      'bg-indigo-500/10 border border-indigo-500/30 text-indigo-400'
                    }`}>
                      {sr.status.toUpperCase()}
                    </span>
                    <span className="text-zinc-600">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step Run Output Detail Modal / Card */}
      {selectedStepRun && (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-bold text-white">Step Output Inspection: {selectedStepRun.step_name}</h4>
            <button
              onClick={() => setSelectedStepRun(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
          <div className="space-y-3 font-mono text-xs">
            <div>
              <span className="text-zinc-500 block mb-1">Output Data JSONB:</span>
              <pre className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-emerald-400 overflow-x-auto">
                {JSON.stringify(selectedStepRun.output || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
