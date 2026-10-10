import type { CaseId } from '@/components/sections/build-cases-data';
import { OFFICIAL_MODEL } from './cases/official';
import { BESOIOBIY_MODEL } from './cases/besoiobiy-printed';
import { SIMONEPDA_MODEL } from './cases/simonepda-lasercut';
import { MBCHARS_MODEL } from './cases/mbchars-horizontal-desktop-printed';

// The device the product preview shows, one model per case on the Build
// panel's switch. Each model is a single GLB built by tools/case-models from
// files in this repository (its README says how), in the frame the guide's
// models share: one unit is 10 mm, the device stands facing +z with the knobs
// at the top right, the LED panel on the left.
//
// Every model has the same Patternflow in it, so the preview finds its parts
// by name, whichever case it is:
//   l           the LED panel; the pattern shaders draw on its front face
//   c1..c4      the knobs, origin on the encoder axis at the knob's base, axis
//               +z. Named after the encoder nets as case-v39.glb names them:
//               seen from the front c1 top-left, c2 top-right, c3 bottom-left,
//               c4 bottom-right (K2, K1, K4, K3 on the device)
//   pcb_v39     the v3.9 board; its children keep pcb-v39.glb's names
//   devkit      the ESP32-S3 DevKit on its sockets ("module" is the ESP32)
// Every other top-level node is a part of the case itself.

export type Vec3 = [number, number, number];

/** A material's look, as tools/case-models/lib/looks.mjs writes them. */
export interface CaseLook {
  /** sRGB hex. */
  color: string;
  roughness: number;
  /** Below 1, the material is drawn see-through. */
  opacity?: number;
}

/** One way a case can be made, when it can be made in more than one material. */
export interface CaseFinish {
  id: string;
  /** On the switch in the preview. */
  label: string;
  /**
   * Material name → look, laid over the file's own. The first finish is the
   * file as built and needs none.
   */
  looks?: Record<string, CaseLook>;
}

export interface CaseModel {
  id: CaseId;
  /** The GLB, under public/. */
  url: string;
  /**
   * Where each top-level node goes when the device is drawn apart (Build step
   * 3 at full separation), model units from where it sits assembled. Nodes
   * not listed stay put. The case's own parts, the LED panel, the knobs, the
   * board and the DevKit alike.
   */
  explode: Record<string, Vec3>;
  /** When the case comes in more than one material: the first is the file's. */
  finishes?: CaseFinish[];
  /**
   * Top-level nodes that come with the case but are not on the device as it
   * stands, like feet for laying it flat: drawn with the parts to make (Build
   * step 1) and on Assemble (step 3), and not on the device once it is
   * powered.
   */
  loose?: string[];
}

export const CASE_MODELS: Record<CaseId, CaseModel> = {
  official: OFFICIAL_MODEL,
  'besoiobiy-printed': BESOIOBIY_MODEL,
  'simonepda-lasercut': SIMONEPDA_MODEL,
  'mbchars-horizontal-desktop-printed': MBCHARS_MODEL,
};

/** Where the Draco decoder comes from: the same copy the guide's models use. */
export const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/** The parts every model has, by name (see above). */
export const LED_NODE = 'l';
export const KNOB_NODES = ['c1', 'c2', 'c3', 'c4'] as const;
export const PCB_NODE = 'pcb_v39';
export const DEVKIT_NODE = 'devkit';
