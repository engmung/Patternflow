// ── The lab's one door to the community ──────────────────────────────────────
// Everything the Pattern Lab takes from the community site comes through
// here: the publish and send-to-device modals, the "is there a community /
// a build service" switches, the handoff a community page leaves when it
// opens a pattern in the lab, and the .pfs file reader. No other file under
// pattern-lab/ imports @/components/community or @/lib/community (ESLint
// holds that line), so the seam between the two is this file and nothing
// else — swapping the community out means changing eight re-exports.

export { default as PublishModal } from "@/components/community/PublishModal";
export { default as SendModuleModal } from "@/components/community/SendModuleModal";
export { buildsConfigured, communityConfigured } from "@/lib/community/apiBase";
export { clearLabHandoff, readLabHandoff } from "@/lib/community/handoff";
export { readPerformanceFile } from "@/lib/community/performanceFile";
export { CODE_MAX } from "@/lib/community/validate";
