'use client'

import { getCampaignProperties } from '@/lib/posthogEvents'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { Suspense, useEffect, useRef, useState } from 'react'

let postHogInitialized = false

function PostHogPageView({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const previousUrl = useRef('')
  const search = searchParams.toString()

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const currentPath = `${pathname}${search ? `?${search}` : ''}`
    if (previousUrl.current === currentPath) return
    previousUrl.current = currentPath

    posthog.capture('$pageview', {
      $current_url: window.location.href,
      ...getCampaignProperties(),
    })
  }, [enabled, pathname, search])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return

    if (!postHogInitialized) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        ui_host: 'https://us.posthog.com',
        defaults: '2026-01-30',
        person_profiles: 'identified_only',
        capture_pageview: false,
      })
      postHogInitialized = true
    }

    setIsReady(true)
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView enabled={isReady} />
      </Suspense>
      {children}
    </PHProvider>
  )
}
