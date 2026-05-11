import posthog from 'posthog-js';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export function getCampaignProperties() {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const properties: Record<string, string> = {};

  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) properties[key] = value;
  });

  return properties;
}

export function captureEvent(eventName: string, properties: EventProperties = {}) {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.capture(eventName, {
    ...getCampaignProperties(),
    path: window.location.pathname,
    url: window.location.href,
    referrer: document.referrer || undefined,
    ...properties,
  });
}
