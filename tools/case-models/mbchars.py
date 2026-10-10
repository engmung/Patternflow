#!/usr/bin/env python3
"""mbchars' horizontal desktop case, put together, as the shell of its preview model.

    python mbchars.py
    node assemble.mjs mbchars-horizontal-desktop-printed build/mbchars-horizontal-desktop-printed/shell.glb build/mbchars-horizontal-desktop-printed/placement.json

MIT, like the rest of tools/. The model it makes is a drawing of Mykyta
Bilous' (mbchars') case and takes the case's license (CC BY-SA 4.0, README.md).

hardware/case/remixes/mbchars-horizontal-desktop-printed/stl/ has one STL per
part, each as it prints, and nothing assembled: no scene file, no step. The
three front sections (outer frame, inner frame, control section) print face
down, so their STLs share one frame, the case's own: the front face on the
bed at z = 0, the depth up +z, and seen from above, from behind, the control
section at the left (the README's rear view, images/01_frame_connections.png).
In that frame:

1. The front sections go side by side along x, the control section, then the
   inner frame, then the outer frame, all three with y and z as they print.
   Each joint is held by a joint bar under a pair of lugs, one lug on each
   section, and an M3 screw through each lug into the bar's insert, so the
   lug holes either side of a joint are as far apart as the bar's two
   inserts (36 mm). That sets where each section goes; the faces that meet at
   each joint are then checked to touch.

2. The joint bars go under the lug pairs, inserts toward the back (as the
   bar prints, so translations only), their back face on the lugs' front.

3. The rear covers turn face up (they print face down) and close the back:
   their 3 mm plate on the sections' back rim, each with its eight
   countersunk holes over eight of the sixteen inserts in the sections'
   bosses. Which way a cover turns, and where it goes, is found by trying
   both half turns that bring its face up and every offset that puts a hole
   on an insert; one of each fits all eight holes.

4. The USB retainer goes on its boss in the control section (the one insert
   that is neither a cover's nor a joint bar's), its slot over the insert
   and its tongue on the boss, as it prints (screw face up, toward the back).
   The slot lets it slide 0.8 mm to suit the module's length (README); the
   model has it in the middle.

5. The stands hold the case by its bottom edge in a slot as wide as the case
   is deep, the short lip in front and the tall side behind, which the case
   leans back on: the slot is tilted, so the case stands leaning back at that
   angle on a table. A stand goes "at each lower end" (README); the author's
   front photo has each one's middle about 30 mm in from the end.

Then the result is checked against the remix README and the board: about
411 × 176 × 42 mm without the knobs and stands, the four encoder holes on the
board's 31 × 30.5 mm grid, an opening a 320 × 160 mm panel fits, every cover
hole on an insert, and no two parts overlapping (boolean intersections, by
manifold3d).

The knob in stl/ is the official knob (hardware/case/knobs/knobs_20mm.stl),
which is checked; so the model takes the official knob, as assemble.mjs makes
it, in white, the colour the README prints it in. The four optional alignment
pins sit inside the joints, where nothing shows them; they are left out.

Into the model frame (README.md): one unit is 10 mm, the device faces +z
with the knobs at the top and the panel on the left. The case frame looks at
the case from behind, so that is a half turn about y. The case's outline is
centred where the official case's is and its front face is set where the
official's is. This case holds the panel the long way across, a quarter turn
from the other three, so placement.json turns the panel too (ledTurn): a
quarter turn clockwise seen from the front, which puts the top of the
pattern's 128 × 64 frame at the top, as the author mounts the panel (its
arrows point up in images/photo_rear_assembly.jpg).

Each part is one node, white PLA or orange PLA as the README's print table
colours it, with normals that keep a printed part's edges hard and its round
surfaces smooth (besoiobiy.py's crease_shaded). placement.json says where
this case holds the board, the panel and the knobs:
    board      added to the official board's placement, so that the
               encoders are centred on the four holes and bear on the inside
               of the control section's 3 mm front, as in the official case;
    led        the panel node's translation: centred in the frame's opening,
               its LED face flush with the front (the panel sits in the frame
               on tabs 17.8 mm behind the front, 0.8 mm deeper than the panel
               model);
    ledTurn    the quarter turn above;
    knobs      "official", standing 0.8 mm off the front as on the official
               case (knobBaseZ), in "pla_white" (knobLook).

Deterministic: the same input files give the same output bytes.
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np
import shapely
import trimesh

from besoiobiy import CREASE_DEG, crease_shaded, official_numbers, with_material

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
REMIX = REPO / "hardware/case/remixes/mbchars-horizontal-desktop-printed"
OFFICIAL_KNOBS = REPO / "hardware/case/knobs/knobs_20mm.stl"

# The front sections, in order from the control end (the case frame's left).
FRONT = {
    "control_section": "control_section.stl",
    "inner_frame": "white_inner_frame.stl",
    "outer_frame": "white_outer_frame.stl",
}
COVERS = {
    "rear_control_cover": "rear_control_cover.stl",
    "rear_display_cover": "rear_display_cover.stl",
}
JOINT_BAR = "joint_bar.stl"
RETAINER = "usb_retainer.stl"
STAND = "stand.stl"
KNOB = "knob.stl"

# The README's print table: plates 03, 07 and 08 orange, the rest white.
# lib/looks.mjs gives each its look.
ORANGE = {"control_section", "usb_retainer", "stand_left", "stand_right"}
WHITE_PLA = "pla_white"
ORANGE_PLA = "pla_orange"
KNOB_LOOK = "pla_white"

# What the remix README says, in mm: "approximately 411 × 176 × 42 mm"
# without the knobs and stands, and where the stands go.
README_SIZE = (411.0, 176.0, 42.0)
README_SIZE_TOLERANCE = 1.0
# The panel the case holds, 320 × 160 mm (lib/frame.mjs, LED_SIZE): the
# opening has to take it, with at most this much to spare each way.
PANEL = (320.0, 160.0)
OPENING_PLAY = 2.0
# The middle of each stand from its end of the case, read off
# images/photo_front.jpg (the README says only "at each lower end").
STAND_INSET = 30.0

# Hole sizes, mm: the 3.4 mm clearance holes for the M3 screws (the lugs, the
# covers' countersinks below their heads) and the 4.5 mm pilots the README
# gives for the inserts.
CLEARANCE_HOLE = 3.4
INSERT_HOLE = 4.5
ENCODER_HOLE = 7.4

# Model units per mm, and the half turn about y from the case frame (seen
# from behind, front at z = 0) to the model frame (seen from the front).
MM = 0.1
CASE_TO_MODEL = np.diag([-1.0, 1.0, -1.0])

# The official case in the model frame (besoiobiy.py has the same): the
# centre of its outline and the inside of its 3 mm front.
OFFICIAL_OUTLINE_CENTRE = (-0.1817, 16.2446)
OFFICIAL_INSIDE_FRONT_Z = 1.2628

# Pieces closer than this (mm³) count as not overlapping: faces that touch
# exactly give a sliver of rounding error.
OVERLAP_TOLERANCE = 1.0
# Two positions this close (mm) are the same.
SAME = 0.05


def require(ok: bool, message: str) -> None:
    """Stops the build when the files are not what this script expects."""
    if not ok:
        sys.exit(f"mbchars.py: {message}")


def load(path: Path) -> trimesh.Trimesh:
    mesh = trimesh.load_mesh(path)
    require(mesh.is_watertight and len(mesh.split(only_watertight=False)) == 1, f"{path.name} is not one closed part")
    return mesh


def signature(mesh: trimesh.Trimesh) -> np.ndarray:
    """Numbers that do not change when a part is moved or turned."""
    return np.concatenate(
        [[len(mesh.faces), mesh.area, abs(mesh.volume)], np.sort(np.abs(mesh.principal_inertia_components))]
    )


def is_official_knob(knob: trimesh.Trimesh) -> bool:
    want = signature(knob)
    return any(
        np.allclose(signature(piece), want, rtol=1e-4, atol=1e-3)
        for piece in trimesh.load_mesh(OFFICIAL_KNOBS).split(only_watertight=False)
    )


def planes(mesh: trimesh.Trimesh, axis: int, sign: int) -> list[tuple[float, float]]:
    """The flat faces facing along ±axis: (level, area) per level, mm."""
    facing = mesh.face_normals[:, axis] * sign > 0.9999
    levels = np.round(mesh.triangles_center[facing, axis], 2)
    out: dict[float, float] = {}
    for level, area in zip(levels, mesh.area_faces[facing]):
        out[level] = out.get(level, 0.0) + area
    return sorted((float(k), float(v)) for k, v in out.items())


def largest_plane(mesh: trimesh.Trimesh, axis: int, sign: int) -> float:
    return max((area, level) for level, area in planes(mesh, axis, sign))[1]


def circles(mesh: trimesh.Trimesh, z: float, diameter: float) -> list[np.ndarray]:
    """The round holes of a given size in a slice across z, by their centres."""
    section = mesh.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    if section is None:
        return []
    out = []
    for loop in section.discrete:
        ring = shapely.Polygon(loop[:, :2])
        x0, y0, x1, y1 = ring.bounds
        if abs(x1 - x0 - diameter) < SAME and abs(y1 - y0 - diameter) < SAME:
            out.append(np.array([ring.centroid.x, ring.centroid.y]))
    return out


def holes(mesh: trimesh.Trimesh, diameter: float, step: float = 0.25) -> list[dict]:
    """
    Every round hole of a given size along z: its centre and the depths it
    runs between (to the nearest step), found by slicing the part every step.
    """
    found: list[dict] = []
    for z in np.arange(mesh.bounds[0, 2] + step / 2, mesh.bounds[1, 2], step):
        for c in circles(mesh, float(z), diameter):
            hole = next((h for h in found if np.allclose(h["at"], c, atol=SAME) and z - h["to"] <= step * 1.5), None)
            if hole is None:
                found.append({"at": c, "from": float(z), "to": float(z)})
            else:
                hole["to"] = float(z)
    for h in found:
        h["from"] -= step / 2
        h["to"] += step / 2
    return sorted(found, key=lambda h: (round(h["at"][0], 2), round(h["at"][1], 2)))


def level_around(mesh: trimesh.Trimesh, at, radius: float, sign: int, near: float) -> float:
    """
    The flat face facing ±z within radius of a point (xy) whose level is
    nearest `near`: the exact depth of a face a slice only brackets.
    """
    facing = mesh.face_normals[:, 2] * sign > 0.9999
    close = np.linalg.norm(mesh.triangles_center[:, :2] - np.asarray(at), axis=1) <= radius
    levels = np.unique(np.round(mesh.triangles_center[facing & close, 2], 2))
    require(len(levels) > 0, f"no flat face within {radius} mm of {np.round(at, 2).tolist()}")
    return float(levels[np.argmin(np.abs(levels - near))])


def material_at(mesh: trimesh.Trimesh, z: float) -> shapely.Geometry:
    """A slice through a part at depth z, as the area that is solid (mm)."""
    section = mesh.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    solid = shapely.Polygon()
    for loop in section.discrete:
        solid = solid.symmetric_difference(shapely.Polygon(loop[:, :2]))
    return solid


def moved(mesh: trimesh.Trimesh, matrix: np.ndarray) -> trimesh.Trimesh:
    out = mesh.copy()
    out.apply_transform(matrix)
    return out


def translation(v) -> np.ndarray:
    return trimesh.transformations.translation_matrix(np.asarray(v, dtype=float))


def front_sections(parts: dict[str, trimesh.Trimesh], bar: trimesh.Trimesh) -> tuple[dict, dict]:
    """
    Where each front section goes along x (step 1), and the joint bars' places
    (step 2): {name: 4×4}, and the joints as {name: (left, right, lug holes)}.
    """
    inserts = holes(bar, INSERT_HOLE)
    require(len(inserts) == 2, f"{JOINT_BAR}: {len(inserts)} insert holes, expected two")
    pitch = inserts[1]["at"][0] - inserts[0]["at"][0]
    require(abs(inserts[0]["at"][1] - inserts[1]["at"][1]) < SAME, "the joint bar's inserts are not along its length")
    # The inserts open on the bar's back (its top as it prints), toward the lugs.
    require(all(abs(h["to"] - bar.bounds[1, 2]) < 0.2 for h in inserts), "the joint bar's inserts do not open on its top")

    # Each section's lug holes: at its far end (from the control section) on
    # the left of a joint, at its near end on the right.
    lugs = {name: holes(mesh, CLEARANCE_HOLE) for name, mesh in parts.items()}
    names = list(FRONT)
    offsets = {names[0]: 0.0}
    joints = {}
    for left, right in zip(names, names[1:]):
        far = [h for h in lugs[left] if h["at"][0] > parts[left].centroid[0]]
        near = [h for h in lugs[right] if h["at"][0] < parts[right].centroid[0]]
        require(len(far) == 2 and len(near) == 2, f"{left}/{right}: {len(far)} and {len(near)} lug holes, expected two each")
        require(
            np.allclose(sorted(h["at"][1] for h in far), sorted(h["at"][1] for h in near), atol=SAME),
            f"{left}/{right}: the lugs are not level",
        )
        offsets[right] = offsets[left] + far[0]["at"][0] + pitch - near[0]["at"][0]
        joints[f"{left}/{right}"] = (left, right, far, near)
    placed = {name: translation([offsets[name], 0, 0]) for name in names}

    # The bars: inserts under the left section's lug holes, back face on the lugs.
    bars = {}
    insert_at = inserts[0]["at"]
    for key, (left, right, far, near) in joints.items():
        for hole in far:
            lug_front = level_around(parts[left], hole["at"], CLEARANCE_HOLE, -1, hole["from"])
            at = [offsets[left] + hole["at"][0] - insert_at[0], hole["at"][1] - insert_at[1], lug_front - bar.bounds[1, 2]]
            # The other insert lands under the right section's lug.
            other = np.array(at[:2]) + inserts[1]["at"]
            require(
                any(np.allclose(other, [offsets[right] + h["at"][0], h["at"][1]], atol=SAME) for h in near),
                f"{key}: the bar's second insert is not under the lug",
            )
            side = "top" if hole["at"][1] > parts[left].bounds.mean(axis=0)[1] else "bottom"
            # In the model the control section is on the right: name the
            # joints as a reader sees them, from the front.
            joint = "right" if left == "control_section" else "left"
            bars[f"joint_bar_{joint}_{side}"] = translation(at)
    return placed, {"bars": bars, "pitch": pitch, "offsets": offsets}


def covers(
    covers_raw: dict[str, trimesh.Trimesh], case: dict[str, trimesh.Trimesh], insert_holes: list[np.ndarray]
) -> dict[str, np.ndarray]:
    """Each cover's 4×4 (step 3): face up, plate on the rim, every hole on an insert."""
    rim = max(mesh.bounds[1, 2] for mesh in case.values())
    out = {}
    for name, cover in covers_raw.items():
        fits = []
        # The two half turns that bring a face-down cover face up.
        for turn_name, axis in (("about x", [1, 0, 0]), ("about y", [0, 1, 0])):
            turn = trimesh.transformations.rotation_matrix(np.pi, axis)
            turned = moved(cover, turn)
            # Its plate's inside face (the largest facing the front) on the rim.
            dz = rim - largest_plane(turned, 2, -1)
            turned.apply_translation([0, 0, dz])
            # The screw holes, through the middle of the plate.
            mine = circles(turned, rim + 1.5, CLEARANCE_HOLE)
            require(len(mine) == 8, f"{name}: {len(mine)} screw holes, expected eight")
            for a, b in itertools.product(insert_holes, mine):
                d = a - b
                if all(any(np.allclose(m + d, i, atol=SAME) for i in insert_holes) for m in mine):
                    fits.append((turn_name, translation([d[0], d[1], dz]) @ turn, d))
        unique = {(t, round(d[0], 2), round(d[1], 2)): m for t, m, d in fits}
        require(len(unique) == 1, f"{name}: {len(unique)} ways to put its holes on the inserts, expected one")
        out[name] = next(iter(unique.values()))
    return out


def retainer_place(control: trimesh.Trimesh, retainer: trimesh.Trimesh, used: list[np.ndarray]) -> np.ndarray:
    """The USB retainer's 4×4 (step 4): slot over its insert, tongue on the boss."""
    others = [
        h for h in holes(control, INSERT_HOLE) if not any(np.linalg.norm(h["at"] - u) < 1.0 for u in used)
    ]
    require(len(others) == 1, f"{len(others)} inserts in the control section besides the covers', expected one")
    boss = others[0]
    boss_top = level_around(control, boss["at"], 1.5 * INSERT_HOLE, +1, boss["to"])
    # The slot through the tongue: the one closed loop in a slice across it
    # that is not the outline.
    top = retainer.bounds[1, 2]
    section = retainer.section(plane_origin=[0, 0, top - 1], plane_normal=[0, 0, 1])
    loops = sorted((shapely.Polygon(loop[:, :2]) for loop in section.discrete), key=lambda p: p.area)
    require(len(loops) == 2, "the retainer's tongue has no slot")
    x0, y0, x1, y1 = loops[0].bounds
    require(x1 - x0 > y1 - y0, "the retainer's slot does not run along x")
    slot = ((x0 + x1) / 2, (y0 + y1) / 2)
    # The tongue's underside: the face round the slot that faces the front.
    underside = level_around(retainer, slot, x1 - x0, -1, top)
    return translation([boss["at"][0] - slot[0], boss["at"][1] - slot[1], boss_top - underside])


def stand_place(stand: trimesh.Trimesh, depth: float, x_mid: float) -> tuple[np.ndarray, float]:
    """
    A stand's 4×4 (step 5), its slot's middle at x_mid along the case, and the
    angle the case leans back at. The stand prints on its side: its outline in
    xy, extruded along z.
    """
    outline = shapely.Polygon(
        max(stand.section(plane_origin=[0, 0, stand.bounds[1, 2] / 2], plane_normal=[0, 0, 1]).discrete, key=len)[:, :2]
    ).simplify(0.05)
    outline = shapely.geometry.polygon.orient(outline, 1.0)  # anticlockwise: solid on the left
    pts = np.array(outline.exterior.coords)[:-1]
    n = len(pts)
    found = []
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        prev, nxt = pts[i - 1], pts[(i + 2) % n]
        length = np.linalg.norm(b - a)
        if not depth <= length <= depth + 1.5:
            continue
        u = (b - a) / length
        side_in, side_out = a - prev, nxt - b
        # A slot: both sides square to the floor.
        if any(abs(np.dot(side, u)) > 0.01 * np.linalg.norm(side) for side in (side_in, side_out)):
            continue
        found.append((a, b, u, np.linalg.norm(side_in), np.linalg.norm(side_out)))
    require(len(found) == 1, f"{STAND}: {len(found)} slots as wide as the case is deep, expected one")
    a, b, u, h_in, h_out = found[0]
    # Anticlockwise, the solid is on the left of each step, so the open slot
    # is on the right of its floor: that way is up, out of the slot.
    up = np.array([u[1], -u[0]])
    require(up[1] > 0, "the stand's slot does not open upward")
    # The short side is the lip in front, the tall side the back the case
    # leans on. Order the floor from the front lip to the back.
    lip, back = (a, b) if h_in < h_out else (b, a)
    require(min(h_in, h_out) < max(h_in, h_out) / 2, "the stand's slot has no short lip and tall back")
    along = (back - lip) / np.linalg.norm(back - lip)
    # How far the case leans back on a table: its up, along the slot's sides,
    # from the vertical, toward the back.
    lean = float(np.degrees(np.arccos(up[1])))
    require(up[0] * along[0] > 0, "the stand leans the case forward")
    # Stand frame → case frame: `along` → +z (front to back), `up` → +y,
    # and the extrusion (z) → -x, to keep it a turn rather than a mirror.
    m = np.eye(4)
    rot = np.zeros((3, 3))
    rot[2, :2] = along
    rot[1, :2] = up
    rot[0, 2] = -1.0
    require(abs(np.linalg.det(rot) - 1) < 1e-9, "the stand's turn is a mirror")
    m[:3, :3] = rot
    # The case's bottom on the floor, its back against the tall side, the
    # stand's middle at x_mid.
    back_xy = rot[:, :2] @ back
    m[:3, 3] = [x_mid + stand.bounds[1, 2] / 2, -back_xy[1], depth - back_xy[2]]
    return m, lean


def check(case: dict[str, trimesh.Trimesh], body: list[str]) -> dict[str, object]:
    """The assembled case against the README and the board; returns what the model needs."""
    every = trimesh.util.concatenate([case[n] for n in body])
    size = every.extents
    require(
        np.allclose(size, README_SIZE, atol=README_SIZE_TOLERANCE),
        f"assembled size {np.round(size, 2).tolist()}, README says about {README_SIZE}",
    )

    for a, b in itertools.combinations(case, 2):
        lo = np.maximum(case[a].bounds[0], case[b].bounds[0])
        hi = np.minimum(case[a].bounds[1], case[b].bounds[1])
        if np.any(hi - lo <= 0):
            continue
        overlap = trimesh.boolean.intersection([case[a], case[b]], engine="manifold")
        # Faces that only touch leave a flat sliver of no volume, whose centre
        # of mass trimesh divides by that zero to find on the way.
        with np.errstate(divide="ignore", invalid="ignore"):
            volume = overlap.volume if len(overlap.faces) else 0.0
        require(volume < OVERLAP_TOLERANCE, f"{a} and {b} overlap by {volume:.1f} mm³")

    # The encoder holes through the control section's front, on the board's grid.
    control = case["control_section"]
    inside = largest_plane(control, 2, +1)
    encoders = [c for c in circles(control, inside / 2, ENCODER_HOLE)]
    require(len(encoders) == 4, f"{len(encoders)} encoder holes, expected four")
    centres = np.array(sorted((c[0], c[1]) for c in encoders))
    pitch = (float(np.ptp(centres[:, 0])), float(np.ptp(centres[:, 1])))

    # The panel's opening: the hole in a slice through the two frames just
    # behind the front, closing the hairline at their joint first.
    frames = [material_at(case[n], 1.0).buffer(0.05) for n in ("inner_frame", "outer_frame")]
    walls = shapely.unary_union(frames).buffer(-0.05)
    rings = [shapely.Polygon(r) for g in getattr(walls, "geoms", [walls]) for r in g.interiors]
    require(bool(rings), "no opening in the frames")
    x0, y0, x1, y1 = max(rings, key=lambda p: p.area).bounds
    opening = (x1 - x0, y1 - y0)
    require(
        all(PANEL[k] <= opening[k] <= PANEL[k] + OPENING_PLAY for k in range(2)),
        f"opening {np.round(opening, 2).tolist()} for a {PANEL} panel",
    )
    # The tabs the panel's back stands on: the largest flat faces facing the
    # front in the frames, behind the front face itself.
    tabs = min(
        max((area, level) for level, area in planes(case[n], 2, -1) if level > 1.0)[1]
        for n in ("inner_frame", "outer_frame")
    )

    return {
        "outline": every.bounds,
        "inside_front": inside,
        "hole_centroid": centres.mean(axis=0),
        "pitch": pitch,
        "opening": opening,
        "opening_centre": np.array([(x0 + x1) / 2, (y0 + y1) / 2]),
        "tabs": tabs,
        "overall": size,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--parts", type=Path, default=REMIX / "stl", help="the remix's stl/ folder")
    ap.add_argument(
        "--out",
        type=Path,
        default=HERE / "build/mbchars-horizontal-desktop-printed",
        help="where shell.glb and placement.json go",
    )
    args = ap.parse_args()

    knob_bases, official_front, _ = official_numbers()
    knob_pitch = (
        abs(knob_bases["c2"][0] - knob_bases["c1"][0]) / MM,
        abs(knob_bases["c1"][1] - knob_bases["c3"][1]) / MM,
    )

    raw = {name: load(args.parts / file) for name, file in {**FRONT, **COVERS}.items()}
    bar = load(args.parts / JOINT_BAR)
    retainer = load(args.parts / RETAINER)
    stand = load(args.parts / STAND)
    require(is_official_knob(load(args.parts / KNOB)), f"{KNOB} is not the official knob")

    # 1, 2: the front sections and the joint bars.
    front_raw = {name: raw[name] for name in FRONT}
    placed, joints = front_sections(front_raw, bar)
    case = {name: moved(front_raw[name], m) for name, m in placed.items()}
    for name, m in joints["bars"].items():
        case[name] = moved(bar, m)
    # The faces that meet at each joint touch.
    names = list(FRONT)
    for left, right in zip(names, names[1:]):
        ends = [level for level, area in planes(case[left], 0, +1) if area > 50]
        starts = [level for level, area in planes(case[right], 0, -1) if area > 50]
        require(
            any(abs(a - b) < 0.01 for a in ends for b in starts), f"{left} and {right} have no faces that meet"
        )

    # 3: the covers, on the inserts by the rim.
    rim = max(case[n].bounds[1, 2] for n in FRONT)
    inserts = []
    for n in FRONT:
        for h in holes(case[n], INSERT_HOLE):
            if abs(h["to"] - rim) < 0.2:
                inserts.append(h["at"])
    require(len(inserts) == 16, f"{len(inserts)} cover inserts in the sections' bosses, expected 16")
    cover_places = covers({n: raw[n] for n in COVERS}, {n: case[n] for n in FRONT}, inserts)
    for name, m in cover_places.items():
        case[name] = moved(raw[name], m)
    covered = [c for n in COVERS for c in circles(case[n], rim + 1.5, CLEARANCE_HOLE)]
    for i in inserts:
        require(sum(np.allclose(i, c, atol=SAME) for c in covered) == 1, f"insert at {np.round(i, 2)} has no cover hole")
    require(
        case["rear_control_cover"].bounds[0, 0] <= case["control_section"].bounds[0, 0] + SAME,
        "the control cover is not at the control end",
    )

    # 4: the USB retainer, on the control section's other insert.
    control_inserts = [i for i in inserts if i[0] < case["control_section"].bounds[1, 0]]
    case["usb_retainer"] = moved(retainer, retainer_place(case["control_section"], retainer, control_inserts))

    # 5: the stands, at each end.
    body = list(FRONT) + list(COVERS)
    lo = min(case[n].bounds[0, 0] for n in body)
    hi = max(case[n].bounds[1, 0] for n in body)
    depth = max(case[n].bounds[1, 2] for n in body) - min(case[n].bounds[0, 2] for n in body)
    for name, x_mid in (("stand_right", lo + STAND_INSET), ("stand_left", hi - STAND_INSET)):
        m, lean = stand_place(stand, depth, x_mid)
        case[name] = moved(stand, m)

    found = check(case, body)
    require(
        np.allclose(found["pitch"], knob_pitch, atol=SAME),
        f"encoder holes {np.round(found['pitch'], 2).tolist()} apart, the board's are {np.round(knob_pitch, 2).tolist()}",
    )

    # Into the model frame: the outline centred on the official case's, the
    # front face on the official's.
    lo3, hi3 = found["outline"]
    centre = CASE_TO_MODEL @ ((lo3 + hi3) / 2) * MM
    # The front face is at z = 0 in the case frame.
    front_z = 0.0
    offset = np.array([OFFICIAL_OUTLINE_CENTRE[0] - centre[0], OFFICIAL_OUTLINE_CENTRE[1] - centre[1], official_front])
    to_model = np.eye(4)
    to_model[:3, :3] = CASE_TO_MODEL * MM
    to_model[:3, 3] = offset

    def model_point(p) -> np.ndarray:
        return CASE_TO_MODEL @ np.asarray(p, dtype=float) * MM + offset

    holes_at = model_point([*found["hole_centroid"], 0.0])
    knob_centroid = np.mean(list(knob_bases.values()), axis=0)
    inside_front = model_point([0, 0, found["inside_front"]])[2]
    board = np.array(
        [
            holes_at[0] - knob_centroid[0],
            holes_at[1] - knob_centroid[1],
            inside_front - OFFICIAL_INSIDE_FRONT_Z,
        ]
    )
    led = model_point([*found["opening_centre"], front_z])
    knob_z = official_front + (knob_bases["c1"][2] - official_front)

    out = trimesh.Scene()
    for name in case:
        mesh = crease_shaded(moved(case[name], to_model), CREASE_DEG)
        look = ORANGE_PLA if name in ORANGE else WHITE_PLA
        out.add_geometry(with_material(mesh, look), node_name=name, geom_name=name)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "shell.glb").write_bytes(out.export(file_type="glb", include_normals=True))
    placement = {
        "board": [round(float(v), 4) for v in board],
        "led": [round(float(v), 4) for v in led],
        "ledTurn": -90,
        "knobs": "official",
        "knobBaseZ": round(float(knob_z), 4),
        "knobLook": KNOB_LOOK,
    }
    (args.out / "placement.json").write_text(json.dumps(placement, indent=2) + "\n")

    # Report, in mm unless it says units.
    size = found["overall"]
    offsets = joints["offsets"]
    print(f"front sections along x: {', '.join(f'{n} {offsets[n]:.2f}' for n in FRONT)} (lug holes {joints['pitch']:.2f} apart across each joint)")
    print(f"joint bars: {', '.join(joints['bars'])}")
    for name in COVERS:
        print(f"  {name:20s} x {case[name].bounds[0, 0]:.2f} … {case[name].bounds[1, 0]:.2f}, all eight holes on inserts")
    print(f"assembled {size[0]:.2f} × {size[1]:.2f} × {size[2]:.2f} (README: about 411 × 176 × 42), no parts overlapping")
    print(f"encoder holes {found['pitch'][0]:.2f} × {found['pitch'][1]:.2f} apart; front {found['inside_front']:.2f} thick")
    print(
        f"opening {found['opening'][0]:.2f} × {found['opening'][1]:.2f} for the 320 × 160 panel; tabs {found['tabs']:.2f} behind the front"
    )
    print(f"stands {STAND_INSET:.0f} from each end, the case leaning back {lean:.2f}°")
    print(f"model units: {json.dumps(placement)}")
    print(f"wrote {args.out / 'shell.glb'} ({len(case)} parts) and placement.json")


if __name__ == "__main__":
    main()
