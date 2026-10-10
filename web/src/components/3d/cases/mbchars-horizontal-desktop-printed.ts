import type { CaseModel } from '../caseModels';

// Mykyta Bilous' (mbchars') horizontal desktop case: tools/case-models/mbchars.py,
// from the parts in hardware/case/remixes/mbchars-horizontal-desktop-printed/stl/
// put together. The panel lies the long way across, a quarter turn from the
// other cases, in two white frames; the board is in the orange control section
// on the right. Four joint bars hold the three front sections together from
// behind, two covers close the back, and two orange stands hold it by its
// bottom edge. The knobs are the official ones, printed white.
export const MBCHARS_MODEL: CaseModel = {
  id: 'mbchars-horizontal-desktop-printed',
  url: '/cases/mbchars-horizontal-desktop-printed/model.glb',
  // Drawn apart the way it goes together, told from the inner frame, which
  // stays. The outer frame and the control section open a little at their
  // joints, so the joints show, and the joint bars come out behind them, each
  // still over its joint; whatever the control section holds (the knobs, the
  // board, the DevKit, the module's retainer) moves with it. The panel goes
  // into the frames from the front and the knobs onto the shafts from the
  // front, so both come off that way. Behind, the board comes out, the DevKit
  // comes off its sockets, and the two covers come off last, as the back of
  // the case. The stands drop off the bottom at each end.
  explode: {
    outer_frame: [-1, 0, 0],
    control_section: [1, 0, 0],
    joint_bar_left_top: [-0.5, 0, -3.5],
    joint_bar_left_bottom: [-0.5, 0, -3.5],
    joint_bar_right_top: [0.5, 0, -3.5],
    joint_bar_right_bottom: [0.5, 0, -3.5],
    l: [0, 0, 6.4],
    c1: [1, 0, 4.2],
    c2: [1, 0, 4.2],
    c3: [1, 0, 4.2],
    c4: [1, 0, 4.2],
    pcb_v39: [1, 0, -6.8],
    devkit: [1, 0, -11.2],
    usb_retainer: [1, 0, -4.5],
    rear_control_cover: [0, 0, -15.5],
    rear_display_cover: [0, 0, -15.5],
    stand_left: [-1, -2.5, 0],
    stand_right: [1, -2.5, 0],
  },
};
