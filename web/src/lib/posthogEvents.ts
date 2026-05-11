import posthog from 'posthog-js';
import { CAMPAIGN_ROUTES } from './campaignRoutes';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

const CAMPAIGN_STORAGE_KEY = 'patternflow_campaign';

function getPropertiesFromSearch(params: URLSearchParams) {
  const properties: Record<string, string> = {};

  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) properties[key] = value;
  });

  return properties;
}

function getPropertiesFromPath(pathname: string) {
  return CAMPAIGN_ROUTES.find((route) => route.path === pathname)?.properties ?? {};
}

function readStoredCampaign() {
  try {
    const value = window.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY);
    return value ? JSON.parse(value) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function storeCampaign(properties: Record<string, string>) {
  try {
    window.sessionStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(properties));
  } catch {
    // Ignore private browsing / storage-disabled sessions.
  }
}

export function getCampaignProperties() {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const directProperties = {
    ...getPropertiesFromPath(window.location.pathname),
    ...getPropertiesFromSearch(params),
  };

  if (Object.keys(directProperties).length > 0) {
    storeCampaign(directProperties);
    return directProperties;
  }

  return readStoredCampaign();
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
