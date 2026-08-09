'use client'

import React, { useState, useEffect } from 'react'
import { OrgUsageAnalytics, fetchOrgUsageAnalytics } from '@/lib/engine/analytics'

interface AnalyticsDashboardProps {
  userRole: string
}

export function AnalyticsDashboard({ userRole }: AnalyticsDashboardProps) {
  const [orgId, setOrgId] = useState<string>('org-a-0001')
  const [userId] = useState<string>('user-owner-a')
  const [analytics, setAnalytics] = useState<OrgUsageAnalytics | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchOrgUsageAnalytics(orgId, userId)
      setAnalytics(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [orgId])

  return (
    <div className="space-y-6">
      {/* Header & Org Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Organization Analytics & Monthly Usage</h2>
            <span className="px-2.5 py-0.5 text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full">
              Phase 5 Active
            </span>
          </div>
          <p className="text-zinc-400 text-xs mt-1">Aggregated metrics from PostgreSQL <code className="text-zinc-300 font-mono">organization_monthly_usage</code> view.</p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs text-zinc-400 font-mono">Org Context:</label>
          <select
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-xs font-semibold text-emerald-400 focus:outline-none cursor-pointer"
          >
            <option value="org-a-0001">Org A (Primary Multi-Tenant)</option>
            <option value="org-b-0002">Org B (Isolated Tenant)</option>
            <option value="org-exhausted">Exhausted Org (Quota Test)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-zinc-900/40 border border-zinc-800 p-12 rounded-2xl text-center space-y-3">
          <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-xs text-zinc-400 font-mono">Querying GraphQL Analytics Engine...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-950/40 border border-rose-800/60 p-6 rounded-2xl text-xs font-mono text-rose-300">
          ⚠️ {error}
        </div>
      ) : analytics ? (
        <>
          {/* Quota Consumption Gauge Card */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Monthly Call Quota Consumption</span>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  {analytics.usage_calls.toLocaleString()} / {analytics.usage_limit.toLocaleString()}{' '}
                  <span className="text-sm font-normal text-zinc-400">calls</span>
                </h3>
              </div>

              <span className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border ${
                analytics.usage_percentage >= 100
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : analytics.usage_percentage >= 80
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {analytics.usage_percentage >= 100 ? 'QUOTA EXHAUSTED' : analytics.usage_percentage >= 80 ? 'HIGH USAGE' : 'NORMAL'}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-zinc-950 rounded-full h-3 p-0.5 border border-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  analytics.usage_percentage >= 100
                    ? 'bg-rose-500'
                    : analytics.usage_percentage >= 80
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(100, analytics.usage_percentage)}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>Used: {analytics.usage_percentage}%</span>
              <span>Remaining: {Math.max(0, analytics.usage_limit - analytics.usage_calls).toLocaleString()} calls</span>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Total Workflows</span>
              <p className="text-2xl font-bold text-white">{analytics.total_workflows}</p>
              <span className="text-[10px] text-zinc-500 font-mono">Configured pipelines</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Workflow Runs</span>
              <p className="text-2xl font-bold text-indigo-400">{analytics.total_workflow_runs}</p>
              <span className="text-[10px] text-zinc-500 font-mono">Total executions</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Total Step Runs</span>
              <p className="text-2xl font-bold text-violet-400">{analytics.total_step_runs}</p>
              <span className="text-[10px] text-zinc-500 font-mono">Granular steps</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Avg Step Duration</span>
              <p className="text-2xl font-bold text-emerald-400">{analytics.average_step_duration_ms} ms</p>
              <span className="text-[10px] text-zinc-500 font-mono">Latency benchmark</span>
            </div>
          </div>

          {/* Health & Trigger Breakdown Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Run Status Health Distribution */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Execution Health Breakdown</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center space-x-2">
                    <span>●</span> <span>Completed Runs</span>
                  </span>
                  <span className="font-mono text-white font-bold">{analytics.completed_runs}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-amber-400 font-semibold flex items-center space-x-2">
                    <span>●</span> <span>Paused Approval Gates</span>
                  </span>
                  <span className="font-mono text-white font-bold">{analytics.paused_runs}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-rose-400 font-semibold flex items-center space-x-2">
                    <span>●</span> <span>Failed Runs</span>
                  </span>
                  <span className="font-mono text-white font-bold">{analytics.failed_runs}</span>
                </div>
              </div>
            </div>

            {/* Trigger Distribution */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Trigger Type Breakdown</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-indigo-400 font-semibold">Manual Triggers</span>
                  <span className="font-mono text-white font-bold">{analytics.trigger_breakdown.manual}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-purple-400 font-semibold">External Webhooks</span>
                  <span className="font-mono text-white font-bold">{analytics.trigger_breakdown.webhook}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl text-xs">
                  <span className="text-cyan-400 font-semibold">Scheduled Cron Triggers</span>
                  <span className="font-mono text-white font-bold">{analytics.trigger_breakdown.scheduled}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
