#!/usr/bin/env python3
"""Jonathan Lassoff's Patternflood box as a 3D shell, made from its cut files.

    python patternflood.py                   # writes build/jof-patternflood/
    python patternflood.py --dxf <dir> --out <dir>

Then `node assemble.mjs jof-patternflood build/jof-patternflood/shell.glb
build/jof-patternflood/placement.json` writes the model (README.md). MIT, like
the rest of tools/.

The box's own model is a FeatureScript part studio in Onshape; what this
repository has of it is the cut files it exports,
tools/case-models/source/jof-patternflood/dxf/ (copied from jof/patternflood): one DXF per part, millimetres,
every outline and hole a closed path of LINEs, ARCs and CIRCLEs, each part
drawn as seen from outside the box. This script reads the outside of the box
from them:

  bezel-outer.dxf   the front: 293 x 373 mm, the 256 mm square window, the four
                    7 mm encoder bores and the light slits round them
  bezel-inner.dxf   the sheet glued behind it, inset to fit between the walls,
                    pocketed at the knobs
  wall-*.dxf        the four walls, finger-jointed to the front and to each
                    other, 60.7 mm deep
  back-cover.dxf    the removable back, inset between the walls

Every part is its outline as drawn, holes and fingers included, extruded by
the sheet's 3.18 mm and stood where it goes. The model frame is the one every
case model shares (README.md): one unit is 10 mm, the device stands facing +z
with +y up. The box stands upright as built: the panel at the top, the knobs
below it on the left.

What the cut files do not say, and what this script assumes instead:

  - Which way round each wall goes. A wall's DXF is drawn from outside, but
    not which end is up. The script tries each wall four ways (turned half
    round, and mirrored) and keeps the one whose fingers meet the front's and
    the neighbouring walls' notches: the least overlap, measured with
    manifold3d. It says so if a wall only fits mirrored.
  - The front sits where the official case's does (z 1.5635) and the box is
    centred on x = 0; the page centres every case anyway.
  - The LED panels: four 128 mm P2 panels, 2 x 2, 14.5 mm deep, as one block
    centred on the window, its face against the back of the outer sheet (the
    inner sheet's window is as large, so the face sits 3.18 mm back from the
    front). It is the node "l", built the way the page's LED shader expects
    the official panel's: in its own frame its face looks along -y, and the
    node is turned a quarter about x to stand it up. The face's UVs put a
    pattern's x left to right and its row 0 at the top, and the page draws
    the patterns on 128 x 128 LEDs for this case (caseModels.ts, ledGrid), as
    the device runs upstream's patterns at 128 x 128.
  - The push buttons: on the top wall's four keyed holes, a black bezel and a
    domed cap each, in the Rev 2.7 photo's colours; their sizes are by eye.
  - The knobs: 1" (25.4 mm) skirted knobs, 16 mm tall, standing 2.5 mm off
    the front on the jam nut, one on each encoder bore.
  - Inside, every sheet is placed by what the cut files say of it. The side
    walls' mortises place the three panel braces (the middle one three
    sheets), the two rail C and the shelf; rails B and A stack behind rail C,
    the back cover's doubler is flush with rail A between the rail stacks,
    and the walls' doublers run from the front's inner sheet back, as
    enclosure-lasercut.md has them. The electronics tray hangs on the middle
    brace's screws, a spacer ring behind it, and the boards sit on its nut
    pockets (the Colorlight's and the Pi's hole patterns fit them exactly).
    The two knob ribs are the guess: their holes put them at the knobs'
    height, but where along x is by eye (RIB_X).
  - The bought parts are drawn plainly from the numbers Patternflood's
    repository records, not from vendor models: the Mean Well LRS-50-5 on the
    bottom wall's two screws, its terminals toward the inlet; the inlet in
    the right wall's cutout; the Colorlight 5A-75B and the Pi 5 from the board
    constants in enclosure.fs; an EC11 and its 4991 behind each knob.
  - The wiring is schematic: mains from the inlet to the supply, 5 V to the
    panels and the card, the four HUB75 ribbons, the Pi's Ethernet to the
    card, the knobs' I2C chain and the buttons' leads. Its routes are
    plausible, not measured. There is no Patternflow board in this build.
  - The etched art is art.py's decals, laid on the etched parts' outer faces
    as textures (ART); each knob's light is a paper ring behind its slits,
    and the slits filled with light.

Materials, named for lib/looks.mjs: every sheet is "birch_face" on its two big
faces and "birch_edge" on its laser-cut edges; the knobs and the buttons'
bezels are "pla_black", their caps "button_blue", "button_orange" and
"button_red"; the bought parts and the wiring take the looks lib/looks.mjs
lists for them (metal*, pcb_*, wire_*, ...). One
node per part, flat shaded. The output is deterministic: run it twice, get the
same bytes.
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import struct
from pathlib import Path

import io

import manifold3d
import numpy as np
import shapely
import trimesh
from PIL import Image
from shapely.geometry import LineString, Polygon
from shapely.geometry.polygon import orient

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DEFAULT_DXF = HERE / "source/jof-patternflood/dxf"
DEFAULT_OUT = HERE / "build/jof-patternflood"

MODEL = 0.1  # millimetres to model units (one unit is 10 mm)
SHEET = 3.18  # the birch the cut files are compensated for (#thickness)
DEPTH = 60.7  # front face to back edge: the walls' width
FRONT_Z = 15.635  # the official case's front face, mm
CENTRE_Y = 162.677  # the official LED panel's middle, mm

PANEL = 256.0  # 2 x 2 panels of 128 mm
PANEL_DEPTH = 14.5
KNOB_LIFT = 2.5  # the knob's base off the front: the jam nut
# The knob's profile, (radius, height) mm, from its base up: a 1" skirt, a
# tapered body and a chamfered top.
KNOB_PROFILE = [(0, 0), (12.7, 0), (12.7, 1.6), (11.2, 3.0), (10.4, 3.2), (9.6, 15.2), (8.8, 16.0), (0, 16.0)]

# The push buttons (BUILD.md §1: 12 mm, waterproof, a keyed lip), as they
# stand on the top wall: a black bezel ring, then a domed cap in the button's
# colour. Sizes are the build photo's, by eye.
BUTTON_BEZEL = [(0, 0), (9.5, 0), (9.5, 1.6), (8.6, 2.6), (0, 2.6)]
BUTTON_CAP_R = 7.0
BUTTON_CAP_BASE = 2.6
BUTTON_CAP_RISE = 3.2
# Left to right seen from the front, as BUILD.md §7.3 fits them: previous,
# select, next, and sleep alone at the right end. The colours are the Rev 2.7
# photo's (the guide calls sleep's black; the build's cap is red).
BUTTONS = [("button_previous", "button_blue"), ("button_select", "button_orange"),
           ("button_next", "button_blue"), ("button_sleep", "button_red")]

ARC_STEP = math.radians(7.5)

# The etched art: art.py's decals (Patternflood's hardware/laser/art/), each a
# transparent PNG over exactly its part's DXF frame, the burn in its alpha.
# Laid on the part's outer face as a greyscale texture that darkens the
# birch where the laser burned it. Part node -> (decal, texture size, the
# face's outward normal). The sizes are powers of two, whatever the part's
# shape (the UVs stretch to fit), so every browser mipmaps them: a texture
# of fine lines that is not mipmapped shimmers into streaks at an angle.
# The bottom wall is not etched.
ART_DIR = HERE / "source/jof-patternflood/art"
ART = {
    "bezel_outer": ("bezel-outer", (1024, 1024), (0, 0, 1)),
    "back_cover": ("back-cover", (512, 512), (0, 0, -1)),
    "wall_left": ("wall-left", (128, 1024), (-1, 0, 0)),
    "wall_right": ("wall-right-iec", (128, 1024), (1, 0, 0)),
    "wall_top": ("wall-top", (1024, 256), (0, 1, 0)),
}
BURN = 0.2  # the birch's colour times this, in linear light, where the burn is full

# --- the bought parts, drawn plainly from the numbers Patternflood's repository
# records for them (hardware/cad/featurescript/enclosure.fs and
# hardware/cad/vendor/README.md); none is a vendor model.

# Mean Well LRS-50-5: 99 x 82 x 30, its side M3 holes 10 and 84 mm from the
# terminal end at mid-depth, five terminals at a 9.3 mm pitch, their screws
# facing out of the terminal end. Frame: X from the terminal end, Y up from
# the side that screws to the bottom wall, Z back from the front.
PSU = (99.0, 82.0, 30.0)
PSU_HOLE_X = 10.0
PSU_TERMINALS_Y = [29.75 + 9.3 * i for i in range(5)]  # +V, -V, earth, N, L from the bottom
PSU_TERMINAL_Z = 12.6
# The IEC inlet (AC-14-F16A): a 48.6 x 58.2 flange, 34 deep behind it.
IEC_FLANGE = (58.2, 48.6, 3.0)
IEC_DEPTH = 34.0
# Colorlight 5A-75B, in its own frame (component side up, mm), from enclosure.fs.
CL_W, CL_H = 91.76, 143.67
CL_HOLES = [(5.11, 139.08), (86.51, 139.35), (16.07, 3.81), (76.44, 3.96)]
CL_HUBS = [(11.72, 98.59, 65), (12.11, 71.88, 65), (11.84, 44.53, 65), (11.80, 16.95, 65),
           (80.28, 98.72, 115), (80.30, 71.53, 115), (80.39, 44.26, 115), (80.39, 17.15, 115)]
CL_RJ45 = (29.5, 117.0, 63.5, 147.2, 13.5)
CL_TERM = (66.0, 130.0, 86.5, 144.0, 10.0)
CL_JSTS = [(2.5, 110.0, 9.0, 124.5, 6.0), (83.5, 113.0, 91.5, 128.0, 6.0)]
# Raspberry Pi 5, in its own frame, and its envelopes [x0, y0, x1, y1, height].
PI_W, PI_H = 85.0, 56.0
PI_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI_PARTS = [((64.0, 1.5, 87.5, 54.5, 16.0), "metal"), ((6.0, -1.5, 48.0, 7.5, 3.6), "metal"),
            ((7.0, 50.0, 58.0, 55.0, 8.5), "pla_black"), ((3.0, 4.0, 61.0, 52.0, 14.0), "metal_alu")]
PCB = 1.6
ENCODER = (13.0, 6.5)       # the EC11's body, square and deep
ENCODER_BOARD = 25.4        # the 4991, square
# The two knob ribs stand at the knobs' height between the bottom wall and
# the shelf; their x is not in the cut files, so they are placed by eye:
# one between the knob columns, one beside them.
RIB_X = (-95.0, -50.0)
# Each panel's power socket: beside its input header, this far toward the
# panel's outer edge (in the gap between the braces).
POWER_SOCKET_OUT = 14.0
# Each knob's light: its 4991's NeoPixel behind a paper diffuser in the inner
# sheet's pocket, showing through the twelve slits round the knob (13.1 to
# 16.4 mm from its axis). The paper is a ring, one material per knob, k0 to k3,
# so the page can light each the colour the device does (caseModels.ts, knobLights).
GLOW_RING = (12.4, 17.2)


def box(x0, x1, y0, y1, z0, z1) -> trimesh.Trimesh:
    b = trimesh.creation.box(extents=(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)))
    b.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return b


# How far back a wire may go: the back doubler's front face (set by build_inside).
Z_FLOOR = [-math.inf]


def spline(points, sag: float = 0.0, step: float = 5.0, floor: float | None = None) -> np.ndarray:
    """A wire's path: a centripetal Catmull-Rom curve through points, about step mm apart,
    each span sagging under its weight by sag times its length where it runs level, and
    kept in front of Z_FLOOR (a curve can overshoot its points at a bend)."""
    P = [np.asarray(p, dtype=float) for p in points]
    P = [P[0] + (P[0] - P[1]) * 0.01] + P + [P[-1] + (P[-1] - P[-2]) * 0.01]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-6) ** 0.5
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-6) ** 0.5
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-6) ** 0.5
        span = float(np.linalg.norm(p2 - p1))
        level = 1 - abs(p2[1] - p1[1]) / max(span, 1e-6)
        n = max(2, int(span / step))
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            c = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2
            c[1] -= sag * span * level * math.sin(math.pi * k / n)
            out.append(c)
    out.append(P[-2])
    out = np.array(out)
    out[:, 2] = np.maximum(out[:, 2], Z_FLOOR[0] if floor is None else floor)
    return out


def frames(path: np.ndarray, hint=(0.0, 0.0, 1.0), start_normal=None):
    """Tangents and a parallel-transported normal and binormal along a path; the
    normal starts across hint, or along start_normal where that is given."""
    d = np.gradient(path, axis=0)
    t = d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    if start_normal is not None:
        n = np.asarray(start_normal, dtype=float) - t[0] * (np.asarray(start_normal, dtype=float) @ t[0])
    else:
        n = np.cross(t[0], hint)
    if np.linalg.norm(n) < 1e-6:
        n = np.cross(t[0], (1.0, 0.0, 0.0))
    n /= np.linalg.norm(n)
    normals = [n]
    for i in range(1, len(t)):
        n = n - t[i] * (n @ t[i])
        n /= max(np.linalg.norm(n), 1e-9)
        normals.append(n)
    normals = np.array(normals)
    return t, normals, np.cross(t, normals)


def sweep(path: np.ndarray, profile: np.ndarray, hint=(0.0, 0.0, 1.0), start_normal=None, normals=None) -> trimesh.Trimesh:
    """A profile (k x 2, in the path's normal and binormal) swept along a path, its ends capped;
    the normals transported along it, or given (one per point, square to the path)."""
    if normals is None:
        _, nrm, bin_ = frames(path, hint, start_normal)
    else:
        t, _, _ = frames(path)
        nrm = normals
        bin_ = np.cross(t, nrm)
    k = len(profile)
    rings = path[:, None, :] + profile[None, :, 0, None] * nrm[:, None, :] + profile[None, :, 1, None] * bin_[:, None, :]
    verts = rings.reshape(-1, 3)
    faces = []
    for i in range(len(path) - 1):
        for j in range(k):
            a, b = i * k + j, i * k + (j + 1) % k
            faces += [(a, b, a + k), (b, b + k, a + k)]
    # caps
    base = len(verts)
    verts = np.vstack([verts, path[0], path[-1]])
    last = (len(path) - 1) * k
    for j in range(k):
        faces.append((base, (j + 1) % k, j))
        faces.append((base + 1, last + j, last + (j + 1) % k))
    return trimesh.Trimesh(verts, np.array(faces), process=False)


def wire(points, radius: float, sag: float = 0.04) -> trimesh.Trimesh:
    """One loose wire through points."""
    sides = 8 if radius > 1 else 6
    ang = np.linspace(0, 2 * math.pi, sides + 1)[:-1]
    return sweep(spline(points, sag), np.stack([np.cos(ang), np.sin(ang)], 1) * radius)


RIBBON_WAYS, RIBBON_PITCH = 16, 1.27     # a HUB75 cable: 16 conductors at 0.05"


def ribbon_normals(path: np.ndarray, start_width, width, end_width, twist_over: float = 0.3) -> np.ndarray:
    """A ribbon's width along a path: start_width in its first plug, turning to width
    over the first twist_over of its length, and to end_width, its last plug's, over
    the last."""
    t, _, _ = frames(path)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    s_ = seg / seg[-1]
    ease = lambda f: f * f * (3 - 2 * f)
    a, b, c = (np.asarray(v, float) for v in (start_width, width, end_width))
    if a @ b < 0:
        a = -a                                      # the short way round
    if c @ b < 0:
        c = -c
    f0 = ease(np.clip(s_ / twist_over, 0, 1))
    f1 = ease(np.clip((s_ - (1 - twist_over)) / twist_over, 0, 1))
    n = ((1 - f0) * (1 - f1))[:, None] * a + (f0 * (1 - f1))[:, None] * b + f1[:, None] * c
    n -= t * np.sum(n * t, axis=1, keepdims=True)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def clearance_to_sheets(pieces, sheets: dict) -> list[str]:
    """The pieces that cut into a sheet of the box: any vertex inside a sheet, holes and all."""
    hits = []
    for name, sheet_pieces in sheets.items():
        for mesh, _ in sheet_pieces:
            origin, eu, ev = mesh.metadata["frame"]
            ew, poly = mesh.metadata["ew"], mesh.metadata["poly"]
            lo, hi = mesh.bounds
            for k, (piece, mat) in enumerate(pieces):
                v = piece.vertices
                near = np.all((v > lo - 0.01) & (v < hi + 0.01), axis=1)
                if not near.any():
                    continue
                rel = v[near] - origin
                w_ = rel @ ew
                inside = (w_ > 0.05) & (w_ < SHEET - 0.05)
                if inside.any() and shapely.contains_xy(poly, (rel @ eu)[inside], (rel @ ev)[inside]).any():
                    hits.append(f"{mat}#{k} in {name}")
    return hits


# Every ribbon's path and frames, for clearance_to_ribbons.
RIBBONS: list = []


def clearance_to_ribbons(pieces, skip=("ribbon_grey", "ribbon_red")) -> list[str]:
    """The pieces that cut into a ribbon: any vertex of theirs inside one's slab."""
    from scipy.spatial import cKDTree
    hits = []
    for path, nrm, bin_, tan in RIBBONS:
        tree = cKDTree(path)
        for k, (mesh, mat) in enumerate(pieces):
            if mat in skip:
                continue
            v = mesh.vertices
            _, idx = tree.query(v)
            rel = v - path[idx]
            u = np.abs(np.sum(rel * nrm[idx], 1))
            w_ = np.abs(np.sum(rel * bin_[idx], 1))
            a_ = np.abs(np.sum(rel * tan[idx], 1))
            if np.any((u < RIBBON_WAYS * RIBBON_PITCH / 2) & (w_ < 0.52) & (a_ < 0.6)):
                hits.append(f"{mat}#{k}")
    return hits


def ribbon(points, start_width, width, end_width, sag: float = 0.0, floor: float = -math.inf):
    """A 16-way ribbon cable through points: its width along start_width at its first
    plug, turning to width; a ridge over each conductor on both faces, and the
    red stripe down pin 1's edge. Returns (mesh, material) pairs."""
    path = spline(points, sag, step=6.0, floor=floor)
    nrm = ribbon_normals(path, start_width, width, end_width)
    # finely, for the clearance check
    fine = np.linspace(0, len(path) - 1, max(2, int(np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1)) / 0.5)))
    fp = np.array([np.interp(fine, np.arange(len(path)), path[:, k]) for k in range(3)]).T
    fn = np.array([np.interp(fine, np.arange(len(path)), nrm[:, k]) for k in range(3)]).T
    ft, _, _ = frames(fp)
    fn -= ft * np.sum(fn * ft, 1, keepdims=True)
    fn /= np.linalg.norm(fn, axis=1, keepdims=True)
    RIBBONS.append((fp, fn, np.cross(ft, fn), ft))
    half = RIBBON_WAYS * RIBBON_PITCH / 2
    centres = -half + RIBBON_PITCH / 2 + RIBBON_PITCH * np.arange(RIBBON_WAYS)
    top = [(-half, 0.3)]
    for c in centres:
        top += [(c, 0.52), (c + RIBBON_PITCH / 2, 0.3)]
    profile = np.array(top + [(x, -y) for x, y in reversed(top)])
    out = [(sweep(path, profile, normals=nrm), "ribbon_grey")]
    # Pin 1's conductor, red: along the same frames, at the first ridge.
    ang = np.linspace(0, 2 * math.pi, 7)[:-1]
    out.append((sweep(path + nrm * centres[0], np.stack([np.cos(ang), np.sin(ang)], 1) * 0.55), "ribbon_red"))
    return out


def bundle(points, radius: float, count: int, twist: float = 0.08, sag: float = 0.04, ties_every: float = 0.0):
    """count wires laid round each other along points, twisting one turn every 1/twist mm,
    with a cable tie every ties_every mm; returns the wires' meshes and the ties'."""
    path = spline(points, sag)
    _, nrm, bin_ = frames(path)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    r = radius * (1.0 if count == 2 else 1.18)
    ang = np.linspace(0, 2 * math.pi, (8 if radius > 1 else 6) + 1)[:-1]
    profile = np.stack([np.cos(ang), np.sin(ang)], 1) * radius
    wires = []
    for c in range(count):
        th = seg * twist * 2 * math.pi + c * 2 * math.pi / count
        p = path + r * (np.cos(th)[:, None] * nrm + np.sin(th)[:, None] * bin_)
        wires.append(sweep(p, profile))
    ties = []
    if ties_every:
        t_dirs = np.gradient(path, axis=0)
        for at in np.arange(ties_every / 2, seg[-1] - 5, ties_every):
            i = int(np.searchsorted(seg, at))
            tie = trimesh.creation.torus(major_radius=r + radius + 0.4, minor_radius=0.55, major_sections=16, minor_sections=6)
            z = t_dirs[i] / np.linalg.norm(t_dirs[i])
            tie.apply_transform(trimesh.geometry.align_vectors((0, 0, 1), z))
            tie.apply_translation(path[i])
            ties.append(tie)
    return wires, ties


def art_texture(stem: str, dims: tuple[int, int]) -> bytes:
    """A decal as a greyscale JPEG dims (w, h) in size: white where the birch is bare, darker where it is burned."""
    alpha = Image.open(ART_DIR / f"{stem}.decal.png").getchannel("A")
    alpha = alpha.resize(dims, Image.LANCZOS)
    lut = []
    for a in range(256):
        lin = 1 - (a / 255) * (1 - BURN)
        srgb = 12.92 * lin if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055
        lut.append(round(255 * srgb))
    out = io.BytesIO()
    alpha.point(lut).save(out, "JPEG", quality=65, optimize=True)
    return out.getvalue()


def art_primitive(pieces, n_out, material: str):
    """A part's outer face, with UVs over its drawing for its decal."""
    n_out = np.asarray(n_out, dtype=float)
    pos_all, nrm_all, uv_all = [], [], []
    for mesh, _ in pieces:
        mask = mesh.face_normals @ n_out > 0.999
        tris = mesh.vertices[mesh.faces][mask].reshape(-1, 3)
        origin, eu, ev = mesh.metadata["frame"]
        w, h = mesh.metadata["size"]
        rel = tris - origin
        uv = np.stack([(rel @ eu) / w, 1 - (rel @ ev) / h], axis=1)
        pos_all.append(tris)
        nrm_all.append(np.repeat(mesh.face_normals[mask], 3, axis=0))
        uv_all.append(uv)
    return flat(np.concatenate(pos_all), np.concatenate(nrm_all), np.concatenate(uv_all), material)


def solid_primitives(pieces, smooth: bool = False):
    """Meshes by material, flat shaded (or smooth where they bend by less than 35 degrees), one primitive per material."""
    groups: dict[str, list] = {}
    for mesh, material in pieces:
        if smooth:
            m = trimesh.graph.smooth_shade(mesh, angle=math.radians(35))
            pos, nrm = m.vertices[m.faces].reshape(-1, 3), m.vertex_normals[m.faces].reshape(-1, 3)
        else:
            pos = mesh.vertices[mesh.faces].reshape(-1, 3)
            nrm = np.repeat(mesh.face_normals, 3, axis=0)
        groups.setdefault(material, []).append((pos, nrm))
    return [flat(np.concatenate([g[0] for g in chunks]), np.concatenate([g[1] for g in chunks]), None, material)
            for material, chunks in groups.items()]


# --- reading the DXFs ---------------------------------------------------------


def read_dxf(path: Path) -> tuple[list[LineString], list[tuple[float, float, float]]]:
    """Every cut path in a DXF R12 file, as line strings, and its CIRCLEs as (x, y, r) besides."""
    text = path.read_text().splitlines()
    pairs = [(text[i].strip(), text[i + 1].strip()) for i in range(0, len(text) - 1, 2)]
    entities, cur = [], None
    for code, value in pairs:
        if code == "0":
            if cur:
                entities.append(cur)
            cur = {"type": value} if value in ("LINE", "ARC", "CIRCLE") else None
        elif cur is not None and code in ("10", "20", "11", "21", "40", "50", "51"):
            cur[code] = float(value)
    if cur:
        entities.append(cur)

    lines, circles = [], []
    for e in entities:
        if e["type"] == "LINE":
            lines.append(LineString([(e["10"], e["20"]), (e["11"], e["21"])]))
        elif e["type"] == "ARC":
            a0, a1 = math.radians(e["50"]), math.radians(e["51"])
            if a1 <= a0:
                a1 += 2 * math.pi
            n = max(2, math.ceil((a1 - a0) / ARC_STEP))
            pts = [(e["10"] + e["40"] * math.cos(a), e["20"] + e["40"] * math.sin(a)) for a in np.linspace(a0, a1, n + 1)]
            lines.append(LineString(pts))
        else:
            circles.append((e["10"], e["20"], e["40"]))
            n = max(12, math.ceil(2 * math.pi / ARC_STEP))
            pts = [(e["10"] + e["40"] * math.cos(a), e["20"] + e["40"] * math.sin(a)) for a in np.linspace(0, 2 * math.pi, n + 1)]
            lines.append(LineString(pts))
    return lines, circles


def outline(path: Path) -> tuple[Polygon, list[tuple[float, float, float]]]:
    """A part's outline with its holes, moved so its bounding box starts at (0, 0); and its circles, moved with it."""
    lines, circles = read_dxf(path)
    # Endpoints agree to the DXF's precision; snap them so the paths close.
    lines = [LineString(np.round(np.asarray(l.coords), 4)) for l in lines]
    faces = list(shapely.polygonize(lines).geoms)
    if not faces:
        raise SystemExit(f"{path.name}: no closed outline")
    part = max(faces, key=lambda f: Polygon(f.exterior).area)
    x0, y0 = part.bounds[0], part.bounds[1]
    part = shapely.affinity.translate(part, -x0, -y0)
    if not part.is_valid:
        raise SystemExit(f"{path.name}: the outline is not a valid polygon")
    return part, [(x - x0, y - y0, r) for x, y, r in circles]


def size(poly: Polygon) -> tuple[float, float]:
    b = poly.bounds
    return b[2] - b[0], b[3] - b[1]


# --- parts --------------------------------------------------------------------


def part(poly: Polygon, origin, eu, ev, ew) -> tuple[trimesh.Trimesh, np.ndarray]:
    """A flat part: its outline (u, v) extruded SHEET along w, placed by origin + u*eu + v*ev + w*ew (mm)."""
    mesh = trimesh.creation.extrude_polygon(orient(poly, sign=1.0), SHEET, engine="earcut")
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = eu, ev, ew, origin
    # A part seen from outside and extruded inwards is a mirror image of the
    # extrusion; trimesh turns its triangles back to face out.
    mesh.apply_transform(m)
    # Where its drawing lies, for the etched art's UVs.
    mesh.metadata["frame"] = tuple(np.asarray(v, dtype=float) for v in (origin, eu, ev))
    mesh.metadata["size"] = size(poly)
    mesh.metadata["poly"] = poly
    mesh.metadata["ew"] = np.asarray(ew, dtype=float)
    return mesh, np.asarray(ew, dtype=float)


def face_frame(n_out, ev, face: dict[int, tuple[float, float]], outer: float, mirror: bool = False):
    """Where a drawing seen from outside along n_out goes, its v along ev: (origin, eu, ev, ew), ew inwards.

    face gives the world range of the outer face on each of its two in-plane
    axes (axis index -> (lo, hi)); outer is the outer face's coordinate along
    n_out's axis. The drawing's (0, 0) goes to whichever corner its u and v
    directions start from. mirror flips u, for the orientation search.
    """
    n_out, ev = np.asarray(n_out, float), np.asarray(ev, float)
    eu = np.cross(ev, n_out)
    if mirror:
        eu = -eu
    origin = np.zeros(3)
    for axis, (lo, hi) in face.items():
        d = eu[axis] + ev[axis]
        origin[axis] = lo if d > 0 else hi
    origin[int(np.argmax(np.abs(n_out)))] = outer
    return origin, eu, ev, -n_out


def sheet_on_face(poly: Polygon, n_out, ev, face: dict[int, tuple[float, float]], outer: float, mirror: bool = False):
    """A sheet whose drawing is seen from outside along n_out (face_frame), extruded inwards."""
    return part(poly, *face_frame(n_out, ev, face, outer, mirror))


def to_manifold(mesh: trimesh.Trimesh) -> manifold3d.Manifold:
    return manifold3d.Manifold(manifold3d.Mesh(vert_properties=np.asarray(mesh.vertices, np.float32), tri_verts=np.asarray(mesh.faces, np.uint32)))


def overlap(a: trimesh.Trimesh, b: trimesh.Trimesh) -> float:
    """The volume two parts share, mm^3."""
    return (to_manifold(a) ^ to_manifold(b)).volume()


# The panel node's turn: a quarter about x, so its own -y is the model's +z.
# The page's LED shader knows the face by its object-space normal, -y, the
# way the official panel's node has it (web/.../3d/patterns/common.ts).
LED_ROTATION = (-math.sqrt(0.5), 0.0, 0.0, math.sqrt(0.5))


def led_block(x0: float, y0: float, z_face: float):
    """The four panels as one block, its face at z_face: in the node's own frame (face normal -y), with UVs."""
    box = trimesh.creation.box(extents=(PANEL, PANEL, PANEL_DEPTH))
    box.apply_translation((0, 0, -PANEL_DEPTH / 2))
    tris = box.vertices[box.faces]
    normals = box.face_normals
    pos = tris.reshape(-1, 3)
    nrm = np.repeat(normals, 3, axis=0)
    # The face carries the pattern. The shader reads a pattern's x along the
    # UVs' v and its row along u, top row first: x left to right and row 0 at
    # the top, as Patternflood draws upstream's patterns on its square. Every
    # other face takes the official panel's off-face UV.
    front = nrm[:, 2] > 0.999
    uv = np.tile([0.775, 1.19], (len(pos), 1))
    uv[front, 0] = 0.5 - pos[front, 1] / PANEL
    uv[front, 1] = pos[front, 0] / PANEL + 0.5
    # Model (x, y, z) to the node's frame: (x, -z, y).
    turn = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=float)
    pos, nrm = pos @ turn.T, nrm @ turn.T
    translation = (x0 + PANEL / 2, y0 + PANEL / 2, z_face)
    return translation, flat(pos, nrm, uv, "Black")


def knob_mesh() -> trimesh.Trimesh:
    return trimesh.creation.revolve(np.asarray(KNOB_PROFILE, float), sections=64)


def button_meshes() -> tuple[trimesh.Trimesh, trimesh.Trimesh]:
    """A 12 mm push button as it stands on the wall: its black bezel and its domed cap, from the wall's face up (+z)."""
    bezel = trimesh.creation.revolve(np.asarray(BUTTON_BEZEL, float), sections=48)
    dome = [(r, BUTTON_CAP_BASE + BUTTON_CAP_RISE * math.sqrt(max(0.0, 1 - (r / BUTTON_CAP_R) ** 2)))
            for r in np.linspace(BUTTON_CAP_R, 0, 9)]
    cap = trimesh.creation.revolve(np.asarray([(0, BUTTON_CAP_BASE - 0.5), (BUTTON_CAP_R, BUTTON_CAP_BASE - 0.5)] + dome, float), sections=48)
    return bezel, cap


# --- output -------------------------------------------------------------------


def flat(pos, nrm, uv, material):
    """Triangle corners as one primitive, one vertex per distinct (position, normal, uv)."""
    cols = [pos, nrm] + ([uv] if uv is not None else [])
    key = np.round(np.hstack(cols), 6)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return (
        material,
        (pos[first] * MODEL).astype(np.float32),
        nrm[first].astype(np.float32),
        None if uv is None else uv[first].astype(np.float32),
        inverse.reshape(-1).astype(np.uint32),
    )


def sheet_primitives(pieces, skip_normal=None):
    """A part's triangles as two flat-shaded primitives: its sheet faces and its cut edges (but the face along skip_normal, which has its art)."""
    out = []
    for material, want_face in (("birch_face", True), ("birch_edge", False)):
        tris, norms = [], []
        for mesh, axis in pieces:
            is_face = np.abs(mesh.face_normals @ axis) > 0.999
            mask = is_face if want_face else ~is_face
            if skip_normal is not None:
                # That face is drawn once, with its art, and in neither of these.
                mask &= ~(mesh.face_normals @ np.asarray(skip_normal, float) > 0.999)
            tris.append(mesh.vertices[mesh.faces][mask])
            norms.append(mesh.face_normals[mask])
        tris, norms = np.concatenate(tris), np.concatenate(norms)
        out.append(flat(tris.reshape(-1, 3), np.repeat(norms, 3, axis=0), None, material))
    return out


def knob_primitives():
    """The knob, smooth where its surface bends by less than 35 degrees."""
    mesh = trimesh.graph.smooth_shade(knob_mesh(), angle=math.radians(35))
    pos = mesh.vertices[mesh.faces].reshape(-1, 3)
    nrm = mesh.vertex_normals[mesh.faces].reshape(-1, 3)
    return [flat(pos, nrm, None, "pla_black")]


def write_glb(path: Path, nodes: dict, textures: dict[str, bytes] | None = None) -> None:
    """A plain glTF 2.0 binary: one node per part (with its translation, in model units), a primitive per material; textures by material name, JPEG."""
    textures = textures or {}
    blob = bytearray()
    views, accessors, meshes, gl_nodes = [], [], [], []
    materials: list[str] = []

    def add_accessor(array: np.ndarray, kind: str, component: int, target: int, bounds=False) -> int:
        while len(blob) % 4:
            blob.append(0)
        data = array.tobytes()
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        acc = {"bufferView": len(views) - 1, "componentType": component, "count": len(array), "type": kind}
        if bounds:
            acc["min"] = [float(v) for v in array.min(axis=0)]
            acc["max"] = [float(v) for v in array.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    for name, (translation, prims, *rotation) in nodes.items():
        gl_prims = []
        for mat, pos, nrm, uv, idx in prims:
            if not len(idx):
                continue
            if mat not in materials:
                materials.append(mat)
            attributes = {
                "POSITION": add_accessor(pos, "VEC3", 5126, 34962, bounds=True),
                "NORMAL": add_accessor(nrm, "VEC3", 5126, 34962),
            }
            if uv is not None:
                attributes["TEXCOORD_0"] = add_accessor(uv, "VEC2", 5126, 34962)
            small = len(pos) < 65536
            gl_prims.append({
                "attributes": attributes,
                "indices": add_accessor(idx.astype(np.uint16 if small else np.uint32), "SCALAR", 5123 if small else 5125, 34963),
                "material": materials.index(mat),
                "mode": 4,
            })
        meshes.append({"name": name, "primitives": gl_prims})
        node = {"name": name, "mesh": len(meshes) - 1}
        if translation is not None:
            node["translation"] = [round(float(v) * MODEL, 6) for v in translation]
        if rotation:
            node["rotation"] = [round(float(v), 9) for v in rotation[0]]
        gl_nodes.append(node)

    images = []
    for name, data in textures.items():
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)})
        blob.extend(data)
        images.append({"bufferView": len(views) - 1, "mimeType": "image/jpeg", "name": name})
    tex_index = {name: i for i, name in enumerate(textures)}

    def material(m):
        pbr = {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.5}
        if m in tex_index:
            pbr["baseColorTexture"] = {"index": tex_index[m]}
        out = {"name": m, "pbrMetallicRoughness": pbr}
        if m.startswith("knob_glow"):
            # Paper, lit from behind: a warm glow, which the page sets per knob.
            pbr["baseColorFactor"] = [0.9, 0.88, 0.82, 1]
            out["emissiveFactor"] = [0.8, 0.6, 0.35]
        return out

    while len(blob) % 4:
        blob.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "patternflow tools/case-models/patternflood.py"},
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": list(range(len(gl_nodes)))}],
        "nodes": gl_nodes,
        "meshes": meshes,
        # The looks are set by name in lib/looks.mjs; these are placeholders.
        "materials": [material(m) for m in materials],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    if images:
        # Linear, mipmapped, clamped at the part's edges.
        gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
        gltf["images"] = images
        gltf["textures"] = [{"sampler": 0, "source": i} for i in range(len(images))]
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(text), b"JSON") + text)
        f.write(struct.pack("<I4s", len(blob), b"BIN\0") + bytes(blob))


# --- the box ------------------------------------------------------------------


def build(dxf: Path):
    bezel, bores = outline(dxf / "bezel-outer.dxf")
    inner, _ = outline(dxf / "bezel-inner.dxf")
    walls = {name: outline(dxf / f"{file}.dxf")[0] for name, file in
             (("wall_left", "wall-left"), ("wall_right", "wall-right-iec"), ("wall_top", "wall-top"), ("wall_bottom", "wall-bottom"))}
    back, _ = outline(dxf / "back-cover.dxf")

    W, H = size(bezel)
    D = size(walls["wall_left"])[0]
    if abs(W - 293.0) > 0.5 or abs(H - 373.0) > 0.5 or abs(D - DEPTH) > 0.5:
        raise SystemExit(f"the box is {W:.1f} x {H:.1f} x {D:.1f} mm, not the 293 x 373 x 60.7 the build guide gives")
    x0, y0 = -W / 2, CENTRE_Y - H / 2
    x1, y1 = x0 + W, y0 + H
    zf, zb = FRONT_Z, FRONT_Z - D

    parts: dict[str, list] = {}
    parts["bezel_outer"] = [part(bezel, (x0, y0, zf - SHEET), (1, 0, 0), (0, 1, 0), (0, 0, 1))]
    iw, ih = size(inner)
    parts["bezel_inner"] = [part(inner, (-iw / 2, CENTRE_Y - ih / 2, zf - 2 * SHEET), (1, 0, 0), (0, 1, 0), (0, 0, 1))]
    bw, bh = size(back)
    parts["back_cover"] = [sheet_on_face(back, (0, 0, -1), (0, 1, 0), {0: (-bw / 2, bw / 2), 1: (CENTRE_Y - bh / 2, CENTRE_Y + bh / 2)}, zb)]

    # Each wall: its outward normal, and its two candidate "ups" in the drawing.
    spec = {
        "wall_left": ((-1, 0, 0), (0, 1, 0), {1: (y0, y1), 2: (zb, zf)}, x0),
        "wall_right": ((1, 0, 0), (0, 1, 0), {1: (y0, y1), 2: (zb, zf)}, x1),
        "wall_top": ((0, 1, 0), (0, 0, 1), {0: (x0, x1), 2: (zb, zf)}, y1),
        "wall_bottom": ((0, -1, 0), (0, 0, 1), {0: (x0, x1), 2: (zb, zf)}, y0),
    }
    options = {}
    for name, (n_out, up, face, outer) in spec.items():
        options[name] = [
            ((sign, mirror), sheet_on_face(walls[name], n_out, np.asarray(up) * sign, face, outer, mirror))
            for sign, mirror in itertools.product((1, -1), (False, True))
        ]
    front = parts["bezel_outer"][0][0]
    # Each wall against the front, then each pair of neighbours, all at once:
    # 4^4 ways, each a sum of overlaps.
    alone = {name: [overlap(m, front) for _, (m, _) in opts] for name, opts in options.items()}
    names = list(options)
    pair_cache: dict = {}

    def pair(a, ia, b, ib):
        key = (a, ia, b, ib)
        if key not in pair_cache:
            pair_cache[key] = overlap(options[a][ia][1][0], options[b][ib][1][0])
        return pair_cache[key]

    neighbours = [("wall_left", "wall_top"), ("wall_left", "wall_bottom"), ("wall_right", "wall_top"), ("wall_right", "wall_bottom")]
    # The finger pattern is symmetric, so several ways round fit exactly as
    # well (to 0.1 mm^3): of those, the one with the fewest walls mirrored,
    # then the fewest turned, which is the way the files are drawn.
    scored = []
    for choice in itertools.product(range(4), repeat=4):
        pick = dict(zip(names, choice))
        total = sum(alone[n][pick[n]] for n in names) + sum(pair(a, pick[a], b, pick[b]) for a, b in neighbours)
        mirrored = sum(options[n][pick[n]][0][1] for n in names)
        turned = sum(options[n][pick[n]][0][0] < 0 for n in names)
        scored.append((round(total, 1), mirrored, turned, choice))
    total, _, _, choice = min(scored)
    pick = dict(zip(names, choice))
    ties = sum(s[0] == total for s in scored)
    chosen = {}
    frames = {}
    for name in names:
        (sign, mirror), piece = options[name][pick[name]]
        parts[name] = [piece]
        chosen[name] = ("upside down" if sign < 0 else "as drawn") + (", MIRRORED" if mirror else "")
        n_out, up, face, outer = spec[name]
        frames[name] = face_frame(n_out, np.asarray(up) * sign, face, outer, mirror)

    # The buttons: on the top wall's four keyed holes, in order from the left.
    origin, eu, ev, _ = frames["wall_top"]
    holes = [origin + eu * Polygon(r).centroid.x + ev * Polygon(r).centroid.y for r in walls["wall_top"].interiors]
    if len(holes) != len(BUTTONS):
        raise SystemExit(f"wall-top.dxf has {len(holes)} holes, not the {len(BUTTONS)} button holes")
    buttons = {name: (h[0], y1, h[2]) for (name, _), h in zip(BUTTONS, sorted(holes, key=lambda h: h[0]))}

    # The window: the bezel's largest hole.
    window = max((Polygon(r) for r in bezel.interiors), key=lambda p: p.area)
    wx0, wy0, wx1, wy1 = window.bounds
    cx, cy = x0 + (wx0 + wx1) / 2, y0 + (wy0 + wy1) / 2
    # The panels' LEDs sit flush with the front (enclosure-lasercut.md §12):
    # both sheets' windows clear them, and the braces they bolt to start
    # PANEL_DEPTH behind the front, which the side walls' mortises confirm.
    inner_window = max((Polygon(r) for r in inner.interiors), key=lambda p: p.area)
    if min(size(window)) < PANEL or min(size(inner_window)) < PANEL:
        raise SystemExit("a window is smaller than the panels")
    z_face = zf
    led = led_block(cx - PANEL / 2, cy - PANEL / 2, z_face)

    # The knobs, on the four encoder bores. On Patternflood they are k0 to k3
    # in reading order (k0 top-left, k1 top-right, k2 bottom-left, k3
    # bottom-right). The page takes a knob node's name through the official
    # board's wiring (HeroScene's MESH_TO_KNOB, then LOGICAL_KNOB_TO_WEB_KNOB),
    # which makes c2 k0, c1 k1, c4 k2 and c3 k3: so those are their names.
    if len(bores) != 4:
        raise SystemExit(f"bezel-outer.dxf has {len(bores)} circles, not the four encoder bores")
    centres = [(x0 + x, y0 + y) for x, y, _ in bores]
    top = sorted(sorted(centres, key=lambda c: -c[1])[:2])
    bottom = sorted(sorted(centres, key=lambda c: c[1])[:2])
    knobs = {name: (x, y, zf + KNOB_LIFT) for name, (x, y) in zip(("c2", "c1", "c4", "c3"), top + bottom)}

    dims = {
        "box": (W, H, D),
        "window": (wx1 - wx0, wy1 - wy0, wx0, H - wy1),
        "inner_window": size(inner_window),
        "bores": [2 * r for _, _, r in bores],
        "knob_grid": (top[1][0] - top[0][0], top[0][1] - bottom[0][1]),
        "knob_from_corner": (top[0][0] - x0, bottom[0][1] - y0),
        "walls": chosen,
        "overlap": total,
        "ties": ties,
        "z_face": zf - z_face,
    }
    dims["buttons"] = {name: round(t[0] - x0, 1) for name, t in buttons.items()}
    # The light slits round each knob: the front's holes 13 to 17 mm from a bore.
    slits = {name: [] for name in knobs}
    for r in bezel.interiors:
        c = Polygon(r).centroid
        for name, (kx, ky, _) in knobs.items():
            if 12 < math.hypot(c.x + x0 - kx, c.y + y0 - ky) < 18:
                slits[name].append(Polygon(r))
    box_ = {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "zf": zf, "zb": zb, "panel": (cx, cy), "knobs": knobs, "buttons": buttons,
            "slits": slits}
    inside, gear, idims = build_inside(dxf, frames, walls, box_)
    parts.update(inside)
    dims.update(idims)
    return parts, gear, led, knobs, buttons, dims


# --- inside the box -----------------------------------------------------------


def holes_in_model(poly: Polygon, frame) -> list[tuple[np.ndarray, np.ndarray]]:
    """A placed sheet's holes as model-space boxes (lo, hi)."""
    o, eu, ev, _ = frame
    out = []
    for r in poly.interiors:
        pts = np.asarray(r.coords)
        w = o + np.outer(pts[:, 0], eu) + np.outer(pts[:, 1], ev)
        out.append((w.min(0), w.max(0)))
    return out


def fit_board(board_holes, sheet_holes, guess):
    """Where a board's frame sits on the tray: (A, B) with tray u = A - y_b and v = B - x_b, fitted to the tray's holes for it."""
    a, b = guess
    for _ in range(3):
        pairs = []
        for xb, yb in board_holes:
            u, v = a - yb, b - xb
            near = min(sheet_holes, key=lambda h: (h[0] - u) ** 2 + (h[1] - v) ** 2)
            pairs.append((near, (xb, yb)))
        a = float(np.mean([h[0] + yb for h, (xb, yb) in pairs]))
        b = float(np.mean([h[1] + xb for h, (xb, yb) in pairs]))
    resid = max(math.hypot(h[0] - (a - yb), h[1] - (b - xb)) for h, (xb, yb) in pairs)
    return a, b, resid


def build_inside(dxf: Path, frames: dict, walls: dict, b: dict):
    """The box's inside sheets, from the side walls' mortises, and the bought parts and wiring.

    Returns the sheets (name -> pieces, like the walls), the bought parts
    (name -> (pieces of (mesh, material), smooth)) and lines for the report.
    """
    x0, x1, y0, y1, zf, zb = b["x0"], b["x1"], b["y0"], b["y1"], b["zf"], b["zb"]
    S = SHEET
    sheet = lambda name: outline(dxf / f"{name}.dxf")[0]
    parts: dict[str, list] = {}
    lines = []

    # The left wall's mortises: what is tenoned into the side walls, and where.
    braces, rails, shelf = [], [], None
    for lo, hi in holes_in_model(walls["wall_left"], frames["wall_left"]):
        dy, dz = hi[1] - lo[1], hi[2] - lo[2]
        if dy > 30 and abs(dz - S) < 0.5:
            braces.append((lo, hi, 1))
        elif dy > 30 and abs(dz - 3 * S) < 0.8:
            braces.append((lo, hi, 3))
        elif 15 < dy < 20 and abs(dz - S) < 0.5:
            rails.append((lo, hi))
        elif abs(dy - S) < 0.5 and 15 < dz < 20:
            shelf = (lo, hi)
    braces.sort(key=lambda m: m[0][1])
    rails.sort(key=lambda m: m[0][1])
    if [n for *_, n in braces] != [1, 3, 1] or len(rails) != 2 or shelf is None:
        raise SystemExit(f"the side walls' mortises are not three braces (one, three, one sheets), two rails and a shelf: {braces} {rails} {shelf}")
    front = (1, 0, 0), (0, 1, 0), (0, 0, 1)  # drawn seen from the front

    # The braces the panels bolt to: one sheet top and bottom, three in the middle.
    for name, file, (lo, hi, _) in (("brace_lower", "panel-brace-lower", braces[0]), ("brace_upper", "panel-brace-upper", braces[2])):
        poly = sheet(file)
        h = size(poly)[1]
        parts[name] = [part(poly, (x0, (lo[1] + hi[1] - h) / 2, hi[2] - S), *front)]
    lo, hi, _ = braces[1]
    mid = sheet("panel-brace-middle")
    mid_y0 = (lo[1] + hi[1] - size(mid)[1]) / 2
    for i, (name, file) in enumerate((("brace_middle_front", "panel-brace-middle"),
                                      ("brace_middle_centre", "panel-brace-middle-middle-sheet-tray-nuts"),
                                      ("brace_middle_rear", "panel-brace-middle"))):
        parts[name] = [part(sheet(file), (x0, mid_y0, hi[2] - (i + 1) * S), *front)]
    brace_back = hi[2] - 3 * S

    # The rails at the back, top and bottom: C tenoned into the walls, then B
    # and A behind it, the back cover's nuts between them.
    for where, (lo, hi) in zip(("lower", "upper"), rails):
        yc = (lo[1] + hi[1]) / 2
        c = sheet("rail-c-tenoned")
        parts[f"rail_c_{where}"] = [part(c, (x0, yc - size(c)[1] / 2, lo[2]), *front)]
        for k, (name, file) in enumerate((("rail_b", f"rail-b-{where}-hex-pocket"), ("rail_a", "rail-a-screw-clearance"))):
            r = sheet(file)
            w, h = size(r)
            parts[f"{name}_{where}"] = [part(r, (-w / 2, yc - h / 2, lo[2] - (k + 1) * S), *front)]
    rail_a_back = rails[0][0][2] - 2 * S

    # The back cover's doubler, between the two rail stacks and flush with rail A.
    bd = sheet("back-cover-doubler")
    w, h = size(bd)
    parts["back_doubler"] = [sheet_on_face(bd, (0, 0, -1), (0, 1, 0), {0: (-w / 2, w / 2), 1: (CENTRE_Y - h / 2, CENTRE_Y + h / 2)}, rail_a_back)]

    # The shelf over the supply: its tenon's slot, and forward to the inner front sheet.
    lo, hi = shelf
    sh = sheet("stiffener-shelf")
    parts["shelf"] = [part(sh, (x0, lo[1], lo[2]), (1, 0, 0), (0, 0, 1), (0, 1, 0))]

    # The walls' doublers, glued inside them from the back of the front back
    # to just short of rail C, as their walls are drawn.
    dz1 = zf - 2 * S
    for name, file, wall in (("doubler_left", "wall-left-doubler", "wall_left"), ("doubler_right", "wall-right-doubler-iec", "wall_right"),
                             ("doubler_top", "wall-top-doubler", "wall_top"), ("doubler_bottom", "wall-bottom-doubler-psu", "wall_bottom")):
        poly = sheet(file)
        o, eu, ev, ew = frames[wall]
        n_out = -ew
        u_len, v_len = size(poly)
        # The doubler's face: its wall's frame, moved in by a sheet, and
        # centred along the wall; its depth runs back from the front's inner sheet.
        axis = int(np.argmax(np.abs(n_out)))
        face = {}
        for vec, length in ((eu, u_len), (ev, v_len)):
            k = int(np.argmax(np.abs(vec)))
            if k == 2:
                face[k] = (dz1 - length, dz1)
            else:
                c = (x0 + x1) / 2 if k == 0 else (y0 + y1) / 2
                face[k] = (c - length / 2, c + length / 2)
        outer = o[axis] + ew[axis] * S
        up = ev if abs(ev[1]) > 0.5 or abs(ev[2]) > 0.5 else ev
        parts[name] = [sheet_on_face(poly, n_out, up, face, outer)]
    lines.append(f"inside        braces at y {braces[0][0][1]:.1f}, {braces[1][0][1]:.1f}, {braces[2][0][1]:.1f}; "
                 f"rails at y {rails[0][0][1]:.1f}, {rails[1][0][1]:.1f}; shelf at y {shelf[0][1]:.1f}; the braces' fronts {zf - braces[0][1][2]:.1f} mm behind the front")

    # The knob ribs, between the bottom wall and the shelf, at the knobs' height.
    rib = sheet("knob-rib-1")
    rh = size(rib)
    for i, rx in enumerate(RIB_X):
        poly = rib if i == 0 else sheet("knob-rib-2")
        parts[f"knob_rib_{i + 1}"] = [sheet_on_face(poly, (-1, 0, 0), (0, 1, 0), {1: (y0 + 2 * S, y0 + 2 * S + rh[1]), 2: (dz1 - rh[0], dz1)}, rx)]

    # The electronics tray, on the middle brace's screws, a spacer ring behind it.
    tray_front, tray_rear = sheet("electronics-tray-front-sheet"), sheet("electronics-tray-rear-sheet-board-nuts")
    tw, th = size(tray_front)
    _, brace_circles = outline(dxf / "panel-brace-middle.dxf")
    _, tray_circles = outline(dxf / "electronics-tray-front-sheet.dxf")
    du = (size(mid)[0] - tw) / 2
    bc = min(brace_circles)
    tc = min((c for c in tray_circles if abs(c[0] - (bc[0] - du)) < 0.5), key=lambda c: c[1])
    ty0 = mid_y0 + bc[1] - tc[1]
    tx0 = -tw / 2
    tz = brace_back - S
    parts["tray_front"] = [part(tray_front, (tx0, ty0, tz - S), *front)]
    parts["tray_rear"] = [part(tray_rear, (tx0, ty0, tz - 2 * S), *front)]
    board_back = tz - 3 * S                         # a spacer ring off the tray
    face_z = board_back - PCB                       # the component side, facing the back
    lines.append(f"tray          {tw:.1f} x {th:.1f} mm at y {ty0:.1f}, its back {zf - (tz - 2 * S):.1f} mm behind the front")

    # The boards' places on the tray, fitted to its nut pockets.
    pockets = [(Polygon(r).centroid.x, Polygon(r).centroid.y) for r in tray_rear.interiors]
    ca, cb, cres = fit_board(CL_HOLES, pockets, (266.8, 92.9))
    pa, pb, pres = fit_board(PI_HOLES, pockets, (59.6, 89.5))
    lines.append(f"boards        the Colorlight's holes fit the tray's pockets to {cres:.2f} mm, the Pi's to {pres:.2f} mm")

    def on_tray(a, bb, xb, yb):
        return tx0 + a - yb, ty0 + bb - xb

    def board_box(a, bb, x0b, y0b, x1b, y1b, z0, z1):
        (ux0, vy0), (ux1, vy1) = on_tray(a, bb, x0b, y0b), on_tray(a, bb, x1b, y1b)
        return box(min(ux0, ux1), max(ux0, ux1), min(vy0, vy1), max(vy0, vy1), z0, z1)

    gear: dict[str, tuple[list, bool]] = {}
    RIBBONS.clear()

    # The Colorlight 5A-75B, component side to the back.
    cl = [(board_box(ca, cb, 0, 0, CL_W, CL_H, face_z, board_back), "pcb_green")]
    for (bx0, by0, bx1, by1, hgt), mat in ((CL_RJ45, "metal"), (CL_TERM, "pcb_green_dark")):
        cl.append((board_box(ca, cb, bx0, by0, bx1, by1, face_z - hgt, face_z), mat))
    for bx0, by0, bx1, by1, hgt in CL_JSTS:
        cl.append((board_box(ca, cb, bx0, by0, bx1, by1, face_z - hgt, face_z), "plastic_white"))
    cl.append((board_box(ca, cb, 37, 63, 55, 81, face_z - 1.5, face_z), "pla_black"))  # the FPGA
    hub_tops = []
    for hx, hy, ang in CL_HUBS:
        hdr = trimesh.creation.box(extents=(33.0, 8.9, 9.0))
        hdr.apply_translation((0, 0, -4.5))
        a = math.radians(ang)
        # board (cos, sin) -> model (-sin, -cos)
        turn = math.atan2(-math.cos(a), -math.sin(a))
        hdr.apply_transform(trimesh.transformations.rotation_matrix(turn, (0, 0, 1)))
        cx_, cy_ = on_tray(ca, cb, hx, hy)
        hdr.apply_translation((cx_, cy_, face_z))
        cl.append((hdr, "pla_black"))
        hub_tops.append((cx_, cy_, face_z - 9.0))
    gear["colorlight"] = (cl, False)

    # The Raspberry Pi 5 on end beside it, its Active Cooler and ports to the back.
    pi = [(board_box(pa, pb, 0, 0, PI_W, PI_H, face_z, board_back), "pcb_green")]
    for (bx0, by0, bx1, by1, hgt), mat in PI_PARTS:
        pi.append((board_box(pa, pb, bx0, by0, bx1, by1, face_z - hgt, face_z), mat))
    # The Active Cooler: fins across its sink, and its fan at one end.
    (cx0, cy0, cx1, cy1, ch), _ = PI_PARTS[3]
    for k in range(9):
        fin_x = cx0 + 4 + k * (cx1 - cx0 - 24) / 8
        pi.append((board_box(pa, pb, fin_x, cy0 + 2, fin_x + 1.2, cy1 - 2, face_z - ch - 3.5, face_z - ch), "metal_alu"))
    fan = trimesh.creation.cylinder(radius=11.0, height=4.0, sections=24)
    fx, fy = on_tray(pa, pb, cx1 - 12.0, (cy0 + cy1) / 2)
    fan.apply_translation((fx, fy, face_z - ch - 2.0))
    pi.append((fan, "pla_black"))
    gear["pi5"] = (pi, False)

    # The four encoders behind the knobs: the EC11 against the outer front
    # sheet, in the inner one's pocket, and its 4991 board behind.
    enc = []
    for name, (kx, ky, _) in b["knobs"].items():
        e, d = ENCODER
        enc.append((box(kx - e / 2, kx + e / 2, ky - e / 2, ky + e / 2, zf - S - d, zf - S), "metal"))
        s2 = ENCODER_BOARD / 2
        enc.append((box(kx - s2, kx + s2, ky - s2, ky + s2, zf - S - d - PCB, zf - S - d), "pcb_black"))
        for side in (-1, 1):
            enc.append((box(kx + side * 9.5 - 3, kx + side * 9.5 + 3, ky - 2.2, ky + 2.2, zf - S - d - PCB - 3, zf - S - d - PCB), "plastic_white"))
    gear["encoders"] = (enc, False)
    rings = []
    for k, name in enumerate(("c2", "c1", "c4", "c3")):     # k0 .. k3, as the knobs are named
        kx, ky, _ = b["knobs"][name]
        ring = trimesh.creation.annulus(r_min=GLOW_RING[0], r_max=GLOW_RING[1], height=0.3, sections=48)
        ring.apply_translation((kx, ky, zf - S - 0.2))
        rings.append((ring, f"knob_glow_k{k}"))
        # The light as it shows: each slit full of it, a hair inside its walls
        # and just back from the face.
        for slit in b["slits"][name]:
            pipe = trimesh.creation.extrude_polygon(orient(slit.buffer(-0.06), sign=1.0), S - 0.3, engine="earcut")
            pipe.apply_translation((x0, y0, zf - S))
            rings.append((pipe, f"knob_glow_k{k}"))
    gear["knob_lights"] = (rings, False)

    # The supply on the bottom wall, its holes on the wall's screws, its
    # terminals toward the inlet.
    bottom_holes = sorted(holes_in_model(walls["wall_bottom"], frames["wall_bottom"]), key=lambda h: h[0][0])
    screws = [h for h in bottom_holes if 6 < h[1][0] - h[0][0] < 9]
    sx = sorted((lo[0] + hi[0]) / 2 for lo, hi in screws)
    sz = float(np.mean([(lo[2] + hi[2]) / 2 for lo, hi in screws]))
    if len(sx) != 2 or abs(sx[1] - sx[0] - (PSU[0] - 2 * PSU_HOLE_X - (PSU[0] - 84.0 - PSU_HOLE_X))) > 1.0:
        raise SystemExit(f"the bottom wall's supply screws are at {sx}, not 74 mm apart")
    px_hi = sx[1] + PSU_HOLE_X                      # the terminal end
    py_lo = y0 + 2 * S
    pz_front = sz + PSU[2] / 2
    L, Hh, T = PSU

    def psu(X0, X1, Y0, Y1, Z0, Z1):
        return box(px_hi - X1, px_hi - X0, py_lo + Y0, py_lo + Y1, pz_front - Z1, pz_front - Z0)

    ps = [(psu(18.2, L, 0, Hh, 0, T), "metal_psu"),
          (psu(0, 18.2, 0, 1.2, 0, T), "metal_psu"), (psu(0, 18.2, 0, Hh, 0, 1.2), "metal_psu"),
          (psu(0, 18.2, Hh - 1.2, Hh, 0, T), "metal_psu"),
          (psu(1.0, 18.2, 24.0, 72.5, 1.7, 24.5), "pla_black")]
    # Its perforated cover, on the face toward the back: a hex grid of vent holes.
    for row, vy in enumerate(np.arange(8.0, Hh - 6, 5.2)):
        for vx in np.arange(24.0 + (row % 2) * 3.0, L - 6, 6.0):
            hole = trimesh.creation.cylinder(radius=1.5, height=0.4, sections=8)
            hole.apply_translation((px_hi - vx, py_lo + vy, pz_front - T - 0.15))
            ps.append((hole, "pla_black"))
    for ty in PSU_TERMINALS_Y:
        head = trimesh.creation.cylinder(radius=3.25, height=1.2, sections=16)
        head.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, (0, 1, 0)))
        head.apply_translation((px_hi - 0.4, py_lo + ty, pz_front - PSU_TERMINAL_Z))
        ps.append((head, "metal"))
    gear["psu"] = (ps, False)
    terminals = {k: np.array((px_hi + 1.0, py_lo + ty, pz_front - PSU_TERMINAL_Z)) for k, ty in zip(("+V", "-V", "FG", "N", "L"), PSU_TERMINALS_Y)}
    lines.append(f"supply        x {px_hi - L:.1f}..{px_hi:.1f}, on screws {sx[1] - sx[0]:.1f} mm apart, its front {zf - pz_front:.1f} mm behind the front")

    # The inlet in the right wall: the flange outside, the body inside.
    right_holes = holes_in_model(walls["wall_right"], frames["wall_right"])
    cut = max(right_holes, key=lambda h: (h[1][1] - h[0][1]) * (h[1][2] - h[0][2]))
    icy, icz = (cut[0][1] + cut[1][1]) / 2, (cut[0][2] + cut[1][2]) / 2
    fy, fz, ft = IEC_FLANGE
    iec = [(box(x1, x1 + ft, icy - fy / 2, icy + fy / 2, icz - fz / 2, icz + fz / 2), "pla_black"),
           (box(x1 - IEC_DEPTH, x1, cut[0][1], cut[1][1], cut[0][2], cut[1][2]), "pla_black"),
           (box(x1 + ft, x1 + ft + 3.5, icy + 4, icy + 20, icz - 7.5, icz + 7.5), "iec_red"),
           (box(x1 + ft, x1 + ft + 1.0, icy - 20, icy, icz - 9, icz + 9), "pla_black")]
    gear["iec_inlet"] = (iec, False)

    # The wiring, drawn schematically: loose, laced where it runs together,
    # each wire a curve that sags a little where it runs level. Its routes are
    # plausible, not measured. Behind the shelf is a gap the back's rails
    # leave, and the wires up from the supply pass through it.
    w: list = []

    def add(meshes, mat):
        w.extend((m, mat) for m in meshes)

    back = rail_a_back + S + 1.8                    # just in front of the back doubler
    Z_FLOOR[0] = rail_a_back + S + 1.5
    behind_shelf = (shelf[0][2] + back) / 2
    # Mains: the inlet's three contacts to the supply's, laced together.
    mains = {"L": "wire_brown", "N": "wire_blue", "FG": "wire_earth"}
    start = np.array((x1 - IEC_DEPTH - 2, icy, icz))
    end = np.array((terminals["N"][0] + 12, terminals["N"][1], terminals["N"][2] - 4))
    wires, ties = bundle([start, (start[0] - 18, start[1] - 6, start[2] - 6), (end[0] + 14, end[1] - 10, end[2] - 8), end],
                         1.2, 3, twist=0.03, sag=0.06, ties_every=28)
    for mesh, mat in zip(wires, mains.values()):
        w.append((mesh, mat))
    add(ties, "pla_black")
    for k, mat in mains.items():
        t = terminals[k]
        w.append((wire([end, (t[0] + 6, (t[1] + end[1]) / 2, t[2] - 2), t], 1.2, sag=0.0), mat))
    # 5 V (BUILD.md §8): one pair from the supply to the bus, two 4-way
    # barrier strips on the lower brace's back just above the supply, +5 V
    # and GND, their positions bridged; three of the panels' harnesses off the
    # strips, each a fork pair split to two 4-pin plugs: the two left panels,
    # the two right ones, and the card's power input with a spare, tied back.
    cx, cy = b["panel"]
    brace_lo, brace_hi, _ = braces[0]
    strip_z = brace_hi[2] - S                       # the lower brace's back face
    strip_y = (brace_lo[1] + brace_hi[1]) / 2
    STRIP = (47.0, 21.0, 9.0)
    strips = {"+": -12.0, "-": 44.0}                # each strip's middle, x
    bus = []
    screws = {}
    for pole, sxc in strips.items():
        L_, W_, H_ = STRIP
        bus.append((box(sxc - L_ / 2, sxc + L_ / 2, strip_y - W_ / 2, strip_y + W_ / 2, strip_z - H_, strip_z), "pla_black"))
        # the jumper bar across its four screws, and the screws
        bus.append((box(sxc - L_ / 2 + 3, sxc + L_ / 2 - 3, strip_y - 3.5, strip_y + 3.5, strip_z - H_ - 0.8, strip_z - H_), "metal"))
        screws[pole] = []
        for k in range(4):
            px_ = sxc - L_ / 2 + 5.9 + k * 11.75
            head = trimesh.creation.cylinder(radius=2.6, height=1.6, sections=12)
            head.apply_translation((px_, strip_y, strip_z - H_ - 1.6))
            bus.append((head, "metal"))
            screws[pole].append(np.array((px_, strip_y - 6, strip_z - H_ - 1.0)))
    gear["power_bus"] = (bus, False)
    pair_colours = ("wire_red", "wire_black")

    def pair(route, radius, ties_every=0.0, sag=0.05):
        wires, ties = bundle(route, radius, 2, twist=0.06, sag=sag, ties_every=ties_every)
        for mesh, mat in zip(wires, pair_colours):
            w.append((mesh, mat))
        add(ties, "pla_black")

    # The supply to the bus: +V and -V, 16 AWG, up from its terminal end.
    for pole, k in (("+", "+V"), ("-", "-V")):
        t, sc = terminals[k], screws[pole][3 if pole == "+" else 0]
        w.append((wire([t, t + (10, 2, -6), (t[0] + 8, sc[1] - 26, (t[2] + sc[2]) / 2), sc + (0, -10, 0), sc], 1.3, sag=0.03),
                  "wire_red" if pole == "+" else "wire_black"))
    # The panels' plugs, and the card's 4-pin power input.
    # Each panel's power socket is beside its input header, toward the panel's
    # outer edge, in the gap between braces, clear of where its ribbon runs.
    plugs = {(sx_, sy_): np.array((cx + sx_ * 64 + 22, cy + sy_ * (64 + POWER_SOCKET_OUT), zf - PANEL_DEPTH - 3))
             for sy_ in (-1, 1) for sx_ in (-1, 1)}
    # The 5 V pairs run in a layer of their own behind the ribbons, just in
    # front of the back doubler.
    dc_z = rail_a_back + S + 1.5
    card_x, card_y = on_tray(ca, cb, 87.5, 120.5)
    card_in = np.array((card_x, card_y, face_z - 7))
    harnesses = [((-1, -1), (-1, 1)), ((1, -1), (1, 1)), ("card", "spare")]
    for h, (first, second) in enumerate(harnesses):
        fork = (screws["+"][h] + screws["-"][h]) / 2
        # straight back off the bus, below the panels, then out along the layer
        split = np.array((fork[0] + (-40 if h == 0 else 20 if h == 1 else 5), strip_y + 4 + 5 * h, dc_z))
        pair([fork, fork + (0, 3, -8), split], 0.7, ties_every=40)
        for end in (first, second):
            if end == "spare":
                tip = split + (14, -8, 5)          # live: capped, and tied back out of the way
                pair([split, split + (8, -3, 0), tip], 0.7)
                w.append((box(tip[0] - 3, tip[0] + 3, tip[1] - 4, tip[1] + 4, tip[2] - 3, tip[2] + 3), "pla_black"))
                continue
            if end == "card":
                # up beside its ribbon, then in under it to the card's header
                beside = np.array((card_in[0], card_in[1] - 26, dc_z))
                pair([split, (split + beside) / 2, beside, (beside[0], beside[1] + 2, card_in[2]), card_in], 0.7)
                continue
            dest = plugs[end]
            out = 1 if end[1] > 0 else -1
            over = np.array((dest[0], dest[1] + out * 8, dc_z))
            mid = np.array(((split[0] + over[0]) / 2, (split[1] + over[1]) / 2, dc_z))
            pair([split, mid, over, (dest[0], dest[1] + out * 3, (dc_z + dest[2]) / 2), dest], 0.7, ties_every=60)
    # The Pi's power: a 5 V to USB-C pigtail from the card's screw terminal.
    term_x, term_y = on_tray(ca, cb, 76.25, 137.0)
    usb_x, usb_y = on_tray(pa, pb, 11.0, -1.0)
    # It crosses the gap between the two boards, in front of the ribbons.
    w.append((wire([(term_x, term_y, face_z - 10), (term_x - 8, term_y + 8, face_z - 5),
                    ((term_x + usb_x) / 2, (term_y + usb_y) / 2, face_z - 5), (usb_x + 10, usb_y, face_z - 4),
                    (usb_x + 2, usb_y, face_z - 2)], 1.6, sag=0.04), "wire_black"))

    # The panels' own connectors on their backs: HUB75 in and out, and power.
    conn = []
    for sy_ in (-1, 1):
        for sx_ in (-1, 1):
            pxc, pyc = cx + sx_ * 64, cy + sy_ * 64
            back_z = zf - PANEL_DEPTH
            for hx in (-20, 20):                    # in, out
                conn.append((box(pxc + hx - 4.5, pxc + hx + 4.5, pyc - 16.5, pyc + 16.5, back_z - 8.5, back_z), "pla_black"))
            pyp = pyc + sy_ * POWER_SOCKET_OUT
            conn.append((box(pxc + 22 - 6, pxc + 22 + 6, pyp - 4, pyp + 4, back_z - 6, back_z), "plastic_white"))
    gear["panel_connectors"] = (conn, False)

    # The HUB75 ribbons: as built, each panel is cabled to the header at the
    # card's corner nearest it, the four corners of its 2 x 4 block of
    # headers, so the four are short and none crosses another. Each leaves
    # its header lying along it, in an IDC plug, and ends in one on its
    # panel's input.
    plugs_idc = []
    PLUG = (36.0, 10.5)                            # an IDC plug's length and width
    ins = {(sx_, sy_): np.array((cx + sx_ * 64 - 20, cy + sy_ * 64, zf - PANEL_DEPTH - 8.5)) for sy_ in (-1, 1) for sx_ in (-1, 1)}
    corners = [0, 3, 4, 7]                          # the ends of the two rows of headers
    ports, free = [], list(corners)
    for panel in ((-1, 1), (1, 1), (-1, -1), (1, -1)):
        near = min(free, key=lambda h: np.linalg.norm(np.array(hub_tops[h][:2]) - ins[panel][:2]))
        free.remove(near)
        ports.append((panel, near))
    for panel, hub in ports:
        top = np.array(hub_tops[hub])
        hx, hy, ang = CL_HUBS[hub]
        a = math.radians(ang)
        axis = np.array((-math.sin(a), -math.cos(a), 0.0))   # the header's long axis, in the model
        plug = trimesh.creation.box(extents=(PLUG[0], PLUG[1], 6.0))
        plug.apply_transform(trimesh.transformations.rotation_matrix(math.atan2(axis[1], axis[0]), (0, 0, 1)))
        plug.apply_translation(top + (0, 0, 0.0))
        plugs_idc.append(plug)
        start = top + (0, 0, -3.0)
        pin = ins[panel]
        z_k = start[2] + 0.5                       # level with the plugs' tops, the 5 V layer behind
        end = pin + (0, 0, -3.5)
        # As a ribbon is run: up out of its plug, one easy bend to lie flat,
        # straight across on the diagonal, one easy bend down onto the panel.
        # Its width lies square to that line, so both bends are about it;
        # the diagonals pass the Pi above or below it.
        d = (pin - start)[:2] / np.linalg.norm((pin - start)[:2])
        across = np.array((-d[1], d[0], 0.0))
        # Out of the plug it runs square to its header (its width along it),
        # toward its panel; then it curves onto the diagonal.
        out_dir = np.array((-axis[1], axis[0]))
        if out_dir @ d < 0:
            out_dir = -out_dir
        a = np.array((start[0] + out_dir[0] * 14, start[1] + out_dir[1] * 14, z_k))
        c = np.array((pin[0] - d[0] * 16, pin[1] - d[1] * 16, z_k))
        route = [start, (start[0] + out_dir[0] * 3, start[1] + out_dir[1] * 3, (start[2] + z_k) / 2), a,
                 (a + c) / 2, c, (pin[0] - d[0] * 4, pin[1] - d[1] * 4, (z_k + end[2]) / 2), end]
        # Its middle no deeper than half its thickness off the back doubler.
        # It lands square on its panel's input header, which runs up and down.
        w.extend(ribbon(route, axis, across, (0.0, 1.0, 0.0), floor=z_k - 0.3))   # no sagging out of its layer
        # its plug on that header, which stands 8.5 off the panel's back
        p2 = trimesh.creation.box(extents=(PLUG[1], PLUG[0], 6.0))
        p2.apply_translation(pin + (0, 0, -0.5))
        plugs_idc.append(p2)
    add(plugs_idc, "pla_black")
    # Ethernet: the Pi's jack, a loose loop down past the tray's edge and up
    # to the card's, in front of the ribbons, between them and the boards.
    jx, jy = on_tray(pa, pb, 76.0, 45.0)
    rx_, ry_ = on_tray(ca, cb, 46.5, 147.0)
    eth_z = face_z - 7.5
    w.append((wire([(jx, jy - 2, eth_z), (jx + 4, ty0 - 10, eth_z), (jx + 36, ty0 - 34, eth_z),
                    (rx_ - 22, ty0 - 16, eth_z), (rx_ - 20, ry_ - 12, eth_z), (rx_ - 4, ry_, eth_z)], 2.4, sag=0.05), "cable_blue"))
    # The knobs' I2C chain: STEMMA QT, four thin wires laced, from the Pi's
    # header down behind the tray, through the shelf's hole over the knobs,
    # then from encoder to encoder in loose loops.
    qt = ("wire_black", "wire_red", "wire_blue", "wire_yellow")
    gx, gy = on_tray(pa, pb, 30.0, 52.5)
    knob_at = {k: np.array(v[:2]) for k, v in b["knobs"].items()}
    # Each 4991 has a STEMMA QT socket either side; the chain goes in one and
    # out the other, round the square as a big C: top left to top right,
    # down the outside to bottom right, back along to bottom left. The hops
    # across pass through the cable holes in the rib between the columns.
    plug_z = zf - S - ENCODER[1] - PCB - 2.0
    hole_x = knob_at["c2"][0]
    hole = np.array((hole_x, (shelf[0][1] + shelf[1][1]) / 2, shelf[0][2] + 31.4))
    left = {k: np.array((v[0] - 9.5, v[1], plug_z)) for k, v in knob_at.items()}
    right = {k: np.array((v[0] + 9.5, v[1], plug_z)) for k, v in knob_at.items()}
    rib_z = (dz1 - size(rib)[0]) + 29.1           # the rib's cable holes' middle, in depth
    runs = [[(gx, gy, face_z - 9), (gx + 6, ty0 - 12, back + 2), (hole_x + 6, hole[1] + 40, behind_shelf + 6), hole + (0, 6, 0), hole,
             hole + (-6, -10, 0), left["c2"]]]
    for a, c, mid in (
        (right["c2"], left["c1"], None),            # k0 to k1, through the rib
        (right["c1"], right["c3"], (10.0, 0.0)),     # k1 down the outside to k3
        (left["c3"], right["c4"], None),            # k3 to k2, through the rib
    ):
        if mid is None:
            m = np.array(((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, rib_z))
        else:
            m = np.array((max(a[0], c[0]) + mid[0], (a[1] + c[1]) / 2, plug_z - 4))
        runs.append([a, (a + m) / 2 + (0, 0, -1), m, (c + m) / 2 + (0, 0, -1), c])
    for run in runs:
        wires, _ = bundle(run, 0.45, 4, twist=0.04, sag=0.06)
        for mesh, mat in zip(wires, qt):
            w.append((mesh, mat))
    # The buttons' leads: a pair from each, gathered along the top wall and
    # laced down to the Pi's header.
    # In front of the upper rails (the back cover's nuts), below the top
    # wall, then down the left side to the header, clear of the ribbons.
    rail_front = rails[1][1][2]
    lead_z = rail_front + 8
    gather = np.array((-60.0, rails[1][0][1] - 14, lead_z))
    for (bx, by, bz) in b["buttons"].values():
        wires, _ = bundle([(bx, by - 2 * S - 3, bz), (bx, by - 2 * S - 12, (bz + lead_z) / 2), ((bx + gather[0]) / 2, gather[1] + 6, lead_z), gather],
                          0.5, 2, twist=0.08, sag=0.05)
        for mesh, mat in zip(wires, ("wire_black", "wire_yellow")):
            w.append((mesh, mat))
    wires, ties = bundle([gather, (-118.0, gather[1] - 8, lead_z), (-128.0, ty0 + th + 8, lead_z - 2), (gx + 6, gy + 4, face_z - 9)],
                         0.5, 4, twist=0.05, sag=0.04, ties_every=40)
    for mesh, mat in zip(wires, ("wire_black", "wire_yellow", "wire_black", "wire_yellow")):
        w.append((mesh, mat))
    add(ties, "pla_black")
    # A cable tie where a bundle passes under a ribbon, or close along a sheet,
    # would cut into it: leave that one off.
    ties = [(m, mat) for m, mat in w if mat == "pla_black" and len(m.vertices) == 16 * 6]
    cutting = {h.split(" ")[0] for h in clearance_to_ribbons(ties) + clearance_to_sheets(ties, parts)}
    drop = {id(ties[int(h.split("#")[1])][0]) for h in cutting}
    w = [(m, mat) for m, mat in w if id(m) not in drop]
    gear["wiring"] = (w, True)
    hits = clearance_to_ribbons(w)
    lines.append("ribbons       clear of every other wire" if not hits else f"ribbons       CUT INTO by {', '.join(hits)}")
    sheets = {name: pieces for name, pieces in parts.items()}
    cuts = clearance_to_sheets(w, sheets)
    lines.append("wiring        clear of every sheet inside" if not cuts else f"wiring        CUTS {'; '.join(cuts)}")

    return parts, gear, {"inside": lines}


def report(d: dict) -> None:
    print(f"box           {d['box'][0]:.2f} x {d['box'][1]:.2f} x {d['box'][2]:.2f} mm")
    print(f"window        {d['window'][0]:.2f} x {d['window'][1]:.2f} mm, {d['window'][2]:.2f} from the left edge, {d['window'][3]:.2f} from the top")
    print(f"inner window  {d['inner_window'][0]:.2f} x {d['inner_window'][1]:.2f} mm; the panels' face is flush with the front")
    print(f"bores         " + ", ".join(f"d {b:.2f}" for b in d["bores"]) + f" mm, on {d['knob_grid'][0]:.2f} x {d['knob_grid'][1]:.2f} mm, "
          f"the lower-left {d['knob_from_corner'][0]:.2f} from the left edge and {d['knob_from_corner'][1]:.2f} from the bottom")
    print("walls         " + ", ".join(f"{k} {v}" for k, v in d["walls"].items()))
    print("buttons       " + ", ".join(f"{k[7:]} {v:.1f}" for k, v in d["buttons"].items()) + " mm from the left edge")
    for line in d.get("inside", []):
        print(line)
    print(f"fit           {d['overlap']:.1f} mm^3 of overlap between the walls and the front, all told (the cut files' kerf allowance); "
          f"{d['ties']} of the 256 ways round fit as well")
    if any("MIRRORED" in v for v in d["walls"].values()):
        raise SystemExit("a wall only fits mirrored: the cut files are drawn from outside, so something is off")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dxf", type=Path, default=DEFAULT_DXF, help="the cut files (default: source/jof-patternflood/dxf)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="where shell.glb and placement.json go (default: build/jof-patternflood)")
    args = ap.parse_args()

    parts, gear, led, knobs, buttons, dims = build(args.dxf)
    report(dims)

    nodes = {}
    textures = {}
    for name, pieces in parts.items():
        if name in ART:
            stem, width, n_out = ART[name]
            material = f"birch_art_{name}"
            nodes[name] = (None, sheet_primitives(pieces, skip_normal=n_out) + [art_primitive(pieces, n_out, material)])
            textures[material] = art_texture(stem, width)
        else:
            nodes[name] = (None, sheet_primitives(pieces))
    nodes["l"] = (led[0], [led[1]], LED_ROTATION)
    knob = knob_primitives()
    for name, t in knobs.items():
        nodes[name] = (t, knob)
    bezel, cap = button_meshes()
    # A button stands on the top wall, its axis up: the revolved +z turned to +y.
    up = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)
    for (name, colour) in BUTTONS:
        prims = []
        for mesh, material in ((bezel, "pla_black"), (cap, colour)):
            m = trimesh.graph.smooth_shade(mesh, angle=math.radians(35))
            pos = m.vertices[m.faces].reshape(-1, 3) @ up.T
            nrm = m.vertex_normals[m.faces].reshape(-1, 3) @ up.T
            prims.append(flat(pos, nrm, None, material))
        nodes[name] = (buttons[name], prims)

    # The bought parts and the wiring, a node each.
    for name, (pieces, smooth) in gear.items():
        nodes[name] = (None, solid_primitives(pieces, smooth))

    # No Patternflow board in this build, and the shell brings its own panel and knobs.
    placement = {"board": None, "led": "shell", "knobs": "shell"}
    args.out.mkdir(parents=True, exist_ok=True)
    write_glb(args.out / "shell.glb", nodes, textures)
    (args.out / "placement.json").write_text(json.dumps(placement, indent=2) + "\n")
    tris = sum(len(p[4]) // 3 for node in nodes.values() for p in node[1])
    print(f"wrote {args.out / 'shell.glb'} ({len(nodes)} nodes, {tris} triangles) and placement.json: {json.dumps(placement)}")


if __name__ == "__main__":
    main()
