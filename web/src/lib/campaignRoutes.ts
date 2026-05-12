export type CampaignRoute = {
  path: string;
  destination: string;
  properties: {
    utm_source: string;
    utm_campaign: string;
    utm_medium?: string;
    utm_content?: string;
  };
};

export const CAMPAIGN_ROUTES = [
  {
    path: "/r/arduino",
    destination: "/",
    properties: {
      utm_source: "reddit",
      utm_medium: "arduino",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_r_arduino",
    },
  },
  {
    path: "/r/generative",
    destination: "/",
    properties: {
      utm_source: "reddit",
      utm_medium: "generative",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_r_generative",
    },
  },
  {
    path: "/r/procedural",
    destination: "/",
    properties: {
      utm_source: "reddit",
      utm_medium: "proceduralgeneration",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_r_procedural",
    },
  },
  {
    path: "/r/somethingimade",
    destination: "/",
    properties: {
      utm_source: "reddit",
      utm_medium: "somethingimade",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_r_somethingimade",
    },
  },
  {
    path: "/hn",
    destination: "/",
    properties: {
      utm_source: "hn",
      utm_medium: "launch",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_hn",
    },
  },
  {
    path: "/ig",
    destination: "/",
    properties: {
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_ig",
    },
  },
  {
    path: "/pcbway",
    destination: "/",
    properties: {
      utm_source: "pcbway",
      utm_medium: "opensource_project",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_pcbway",
    },
  },
  {
    path: "/x",
    destination: "/",
    properties: {
      utm_source: "x",
      utm_medium: "social",
      utm_campaign: "v2_launch",
      utm_content: "shortlink_x",
    },
  },
] as const satisfies readonly CampaignRoute[];
