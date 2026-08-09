'use client'

import React, { useState } from 'react'

interface PendingApproval {
  step_run_id: string
  workflow_name: string
  step_name: string
  required_role: 'owner' | 'editor' | 'viewer'
  message: string
  paused_at: string
}

interface ApprovalGateCardProps {
  userRole: string
  onApproved?: () => void
}

export function ApprovalGateCard({ userRole, onApproved }: ApprovalGateCardProps) {
  const [pendingList, setPendingList] = useState<PendingApproval[]>([
    {
      step_run_id: 'step-run-4',
      workflow_name: 'Customer Support Sentiment & Escalation',
      step_name: 'Owner Approval Gate',
      required_role: 'owner',
      message: 'High risk ticket requires owner sign-off before DB update & notification.',
      paused_at: '2026-08-09T18:00:25.000Z'
    }
  ])

  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<{ id: string; status: 'success' | 'error'; text: string } | null>(null)

  const handleApprove = async (item: PendingApproval) => {
    // Role check
    const roleHierarchy: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }
    const userLevel = roleHierarchy[userRole] || 0
    const requiredLevel = roleHierarchy[item.required_role] || 3

    if (userLevel < requiredLevel) {
      setResultMsg({
        id: item.step_run_id,
        status: 'error',
        text: `Permission Denied: Approval requires "${item.required_role}" role. Your active role is "${userRole}".`
      })
      return
    }

    setApprovingId(item.step_run_id)
    setResultMsg(null)

    try {
      const res = await fetch('/api/actions/approve-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': 'nhost-admin-secret'
        },
        body: JSON.stringify({
          action: { name: 'approveStepRun' },
          input: { step_run_id: item.step_run_id },
          session_variables: {
            'x-hasura-user-id': 'user-owner-a',
            'x-hasura-role': userRole
          }
        })
      })

      const data = await res.json()

      if (res.ok) {
        setResultMsg({
          id: item.step_run_id,
          status: 'success',
          text: `Approved successfully! ${data.message || 'Workflow resumed.'}`
        })
        setPendingList(prev => prev.filter(p => p.step_run_id !== item.step_run_id))
        if (onApproved) onApproved()
      } else {
        setResultMsg({
          id: item.step_run_id,
          status: 'error',
          text: data.message || 'Approval failed.'
        })
      }
    } catch (err: unknown) {
      setResultMsg({
        id: item.step_run_id,
        status: 'error',
        text: err instanceof Error ? err.message : 'Error communicating with server.'
      })
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-white tracking-tight">Asynchronous Approval Gates</h2>
        <p className="text-zinc-400 text-xs mt-1">Human-in-the-loop authorization gates pausing workflow execution until sign-off.</p>
      </div>

      {pendingList.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-2xl text-center space-y-2">
          <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-lg font-bold">
            ✓
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">No Pending Approvals</h3>
          <p className="text-xs text-zinc-400">All workflow execution gates have been resolved.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingList.map((item) => {
            const isAuthorized = (userRole === 'owner') || (userRole === 'editor' && item.required_role !== 'owner')
            return (
              <div
                key={item.step_run_id}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4 hover:border-zinc-700 transition-all shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-semibold">
                      {item.workflow_name}
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">{item.step_name}</h3>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-semibold rounded-md">
                      Required Role: {item.required_role.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-800/80 p-3.5 rounded-xl font-sans">
                  {item.message}
                </p>

                {resultMsg && resultMsg.id === item.step_run_id && (
                  <div className={`p-3 rounded-lg text-xs font-mono border ${
                    resultMsg.status === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}>
                    {resultMsg.text}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-zinc-400 font-mono">
                    Paused: {new Date(item.paused_at).toLocaleTimeString()}
                  </span>

                  <button
                    onClick={() => handleApprove(item)}
                    disabled={approvingId === item.step_run_id}
                    className={`px-5 py-2 rounded-xl font-semibold text-xs transition-all flex items-center space-x-2 cursor-pointer ${
                      isAuthorized
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {approvingId === item.step_run_id ? (
                      <span>Processing Approval...</span>
                    ) : (
                      <span>Approve & Resume Workflow</span>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
