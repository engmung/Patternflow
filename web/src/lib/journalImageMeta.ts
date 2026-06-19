export const journalImageMeta = {
  "/journal/v1-30-days/assembled-pcb-back.jpg": { width: 4032, height: 3024 },
  "/journal/v1-30-days/debugging-wires-esp32-potentiometer.jpg": { width: 4032, height: 3024 },
  "/journal/v1-30-days/first-pcb.jpg": { width: 2048, height: 2731 },
  "/journal/v1-30-days/kicad-schematic-screenshot.png": { width: 1157, height: 801 },
  "/journal/v1-30-days/led-panel-in-nature-1.jpg": { width: 1080, height: 1440 },
  "/journal/v1-30-days/led-panel-in-nature-2.jpg": { width: 1080, height: 1450 },
  "/journal/v1-30-days/participation-tv-experience.jpg": { width: 1080, height: 1920 },
  "/journal/v1-30-days/patternflow-origin-interaction.png": { width: 1635, height: 915 },
  "/journal/v1-30-days/patternflow-v1-complete.jpg": { width: 4032, height: 3024 },
  "/journal/v1-30-days/reddit-comment-1.png": { width: 736, height: 351 },
  "/journal/v1-30-days/reddit-comment-2.png": { width: 748, height: 164 },
  "/journal/v1-30-days/robot-k456.jpg": { width: 4032, height: 3024 },
  "/journal/v1-30-days/tangled-wires-led-panel.jpg": { width: 1080, height: 1456 },
  "/journal/v1-30-days/warped-3d-print.jpg": { width: 2268, height: 3085 },
  "/journal/today-is-my-birthday/diffuser-discord.png": { width: 1160, height: 471 },
  "/journal/wins-and-losses-next-step/io0-pullup-resistor.jpg": { width: 1600, height: 2134 },
  "/journal/nam-june-paik-me-patternflow/pattern-30.png": { width: 1920, height: 1280 },
  "/journal/refocus/exhibition-process.jpg": { width: 4032, height: 2268 },
  "/journal/refocus/clean-3d-print.jpg": { width: 4032, height: 2268 },
  "/journal/refocus/pcbway-delivery-1.jpg": { width: 4032, height: 2268 },
  "/journal/refocus/pcbway-delivery-2.jpg": { width: 4032, height: 2268 },
  "/journal/refocus/blender-3d-modeling.png": { width: 1268, height: 867 },
  "/journal/refocus/pcb-discord-feedback.png": { width: 834, height: 429 },
} as const;

export function getJournalImageMeta(src?: string) {
  if (!src) return { width: 1400, height: 900 };
  return journalImageMeta[src as keyof typeof journalImageMeta] ?? { width: 1400, height: 900 };
}
