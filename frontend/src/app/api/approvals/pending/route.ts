import { NextResponse } from 'next/server'
import { fetchPendingStepRuns } from '@/lib/engine/db'

export async function GET() {
  try {
    const pending = await fetchPendingStepRuns()
    return NextResponse.json({ approvals: pending }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ approvals: [], error: message }, { status: 500 })
  }
}
