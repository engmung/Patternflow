'use client'

import { getCampaignProperties } from '@/lib/posthogEvents'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { Suspense, useEffect, useRef } from 'react'

// Initialize once at module scope (client only). Runs before hydration
// effects, so the pageview effect below can rely on it without extra state.
const postHogEnabled =
  typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY

if (postHogEnabled) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    person_profiles: 'identified_only',
    capture_pageview: false,
    session_recording: {
      // Pattern Lab sends the user's BYOK Gemini key to this host. Strip the
      // request from session replay so a key can never leak via a URL query
      // string or captured payload.
      maskNetworkRequestFn: (request) => {
        if (request.url?.includes('generativelanguage.googleapis.com')) {
          return { ...request, url: 'https://generativelanguage.googleapis.com/(redacted)' }
        }
        return request
      },
    },
  })
}

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
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView enabled={postHogEnabled} />
      </Suspense>
      {children}
    </PHProvider>
  )
}
