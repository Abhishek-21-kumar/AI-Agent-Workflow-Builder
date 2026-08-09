'use client'

import React, { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { WorkflowBuilder } from '@/components/WorkflowBuilder'
import { RunMonitor } from '@/components/RunMonitor'
import { ApprovalGateCard } from '@/components/ApprovalGateCard'
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'workflows' | 'monitor' | 'approvals' | 'analytics'>('workflows')
  const [userRole, setUserRole] = useState<string>('owner')
  const [activeRunId, setActiveRunId] = useState<string>('')

  const handleRunTriggered = (runId: string) => {
    setActiveRunId(runId)
    setActiveTab('monitor')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole={userRole}
        setUserRole={setUserRole}
      />

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        {activeTab === 'workflows' && (
          <WorkflowBuilder
            userRole={userRole}
            onRunTriggered={handleRunTriggered}
          />
        )}

        {activeTab === 'monitor' && (
          <RunMonitor
            userRole={userRole}
            activeRunId={activeRunId}
          />
        )}

        {activeTab === 'approvals' && (
          <ApprovalGateCard
            userRole={userRole}
            onApproved={() => setActiveTab('monitor')}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard
            userRole={userRole}
          />
        )}
      </main>
    </div>
  )
}
