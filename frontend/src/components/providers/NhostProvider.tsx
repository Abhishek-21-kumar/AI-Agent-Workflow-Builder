'use client'

import { NhostProvider as Provider } from '@nhost/nextjs'
import { nhost } from '@/lib/nhost'
import { ReactNode } from 'react'

export function NhostProviderWrapper({ children }: { children: ReactNode }) {
  return <Provider nhost={nhost}>{children}</Provider>
}
