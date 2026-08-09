'use client'

import React from 'react'

interface NavbarProps {
  activeTab: 'workflows' | 'monitor' | 'approvals' | 'analytics'
  setActiveTab: (tab: 'workflows' | 'monitor' | 'approvals' | 'analytics') => void
  userRole: string
  setUserRole: (role: string) => void
}

export function Navbar({ activeTab, setActiveTab, userRole, setUserRole }: NavbarProps) {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local'
  const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local'

  return (
    <header className="w-full bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 sticky top-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            AI
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Agent Workflow Builder</h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full">
                Phase 5 Complete
              </span>
            </div>
            <p className="text-xs text-zinc-400">Nhost + Hasura Multi-Tenant Execution Engine</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex bg-zinc-950 border border-zinc-800/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'workflows'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Workflow Builder
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center space-x-2 ${
              activeTab === 'monitor'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Monitor</span>
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'approvals'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Approval Gates
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Analytics & Usage
          </button>
        </nav>

        {/* Role & Org Context */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="text-zinc-500 font-medium">Role Context:</span>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              className="bg-transparent font-semibold text-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="owner" className="bg-zinc-900 text-zinc-100">Owner</option>
              <option value="editor" className="bg-zinc-900 text-zinc-100">Editor</option>
              <option value="viewer" className="bg-zinc-900 text-zinc-100">Viewer</option>
            </select>
          </div>

          <div className="hidden lg:flex items-center space-x-2 font-mono text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="text-zinc-500">Nhost:</span>
            <span className="text-emerald-400">{subdomain}.{region}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
