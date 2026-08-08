# Draws docs/media/at-a-glance.png — the hand-drawn "everything, at a glance"
# map in the README. Rerun after anything on it changes:
#
#   python docs/media/at-a-glance.py
#
# The style is matplotlib's xkcd mode (wobbly strokes, comic lettering) on the
# site's cream/ink/LED-orange palette, so it reads as a sketch rather than an
# org chart — which is the truth of it: this is a map somebody drew, not a
# system that fell out of a generator.

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle, Circle

CREAM = "#F6F1E7"
INK = "#201D1A"
ORANGE = "#E8552E"
FAINT = "#8A857C"

plt.xkcd(scale=1.1, length=120, randomness=1.6)
plt.rcParams["font.family"] = ["Comic Sans MS", "DejaVu Sans"]
plt.rcParams["font.weight"] = "bold"

fig, ax = plt.subplots(figsize=(16, 10), dpi=140)
fig.patch.set_facecolor(CREAM)
ax.set_facecolor(CREAM)
ax.set_xlim(0, 16)
ax.set_ylim(0, 10.4)
ax.axis("off")
for spine in ax.spines.values():
    spine.set_visible(False)
ax.set_xticks([])
ax.set_yticks([])
# The axes patch gets xkcd's sketch effect on its edge, which shows up as a
# train of dashes along the top and bottom of the export. Cream comes from
# fig.patch, so the axes patch can simply not exist.
ax.patch.set_visible(False)
fig.patch.set_edgecolor("none")


def box(x, y, w, h, title, sub=None, edge=INK, dashed=False, lw=2.1, title_size=15, sub_size=11.5):
    ax.add_patch(
        FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=0.06,rounding_size=0.12",
            fc=CREAM, ec=edge, lw=lw, ls=(0, (5, 3)) if dashed else "-",
        )
    )
    cy = y + h / 2
    if sub:
        ax.text(x + w / 2, cy + 0.17, title, ha="center", va="center", fontsize=title_size, color=INK)
        ax.text(x + w / 2, cy - 0.29, sub, ha="center", va="center", fontsize=sub_size, color=FAINT)
    else:
        ax.text(x + w / 2, cy, title, ha="center", va="center", fontsize=title_size, color=INK)


def arrow(p1, p2, label=None, rad=0.0, color=INK, dashed=False, label_dy=0.22, fontsize=11.5, label_at=0.5):
    ax.add_patch(
        FancyArrowPatch(
            p1, p2, arrowstyle="-|>", mutation_scale=20, lw=2.0,
            color=color, ls=(0, (5, 3)) if dashed else "-",
            connectionstyle=f"arc3,rad={rad}", shrinkA=4, shrinkB=4,
        )
    )
    if label:
        mx = p1[0] + (p2[0] - p1[0]) * label_at
        my = p1[1] + (p2[1] - p1[1]) * label_at
        ax.text(mx, my + label_dy, label, ha="center", va="bottom", fontsize=fontsize, color=color)


# ── Title — centred, floated clear of everything ─────────────────────────────
ax.text(8.0, 9.95, "PATTERNFLOW — everything, at a glance", fontsize=25, color=INK,
        ha="center", va="center")

# ── The device (a little drawing, not a box) ────────────────────────────────
dx, dy, dw, dh = 1.0, 5.15, 2.9, 3.0
ax.add_patch(Rectangle((dx, dy), dw, dh, fc="white", ec=INK, lw=2.2))
# LED panel: the left side, clean and dark — the light does the talking
px, py, pw, ph = dx + 0.16, dy + 0.16, dw * 0.60, dh - 0.32
ax.add_patch(Rectangle((px, py), pw, ph, fc=INK, ec=INK, lw=1.2))
# knobs: a 2×2 block at the top-right, like the real thing
knob_r = 0.19
# centre the 2x2 block in the zone between the panel edge and the case edge
zone_mid = (px + pw + (dx + dw)) / 2
kx1, kx2 = zone_mid - 0.23, zone_mid + 0.23
ky1, ky2 = dy + dh - 0.5, dy + dh - 1.0
for kx, ky in [(kx1, ky1), (kx2, ky1), (kx1, ky2), (kx2, ky2)]:
    ax.add_patch(Circle((kx, ky), knob_r, fc=CREAM, ec=INK, lw=2.0))
    ax.plot([kx, kx + 0.12], [ky, ky + 0.12], color=INK, lw=1.8)
ax.text(dx + dw / 2, dy + dh + 0.58, "THE DEVICE", fontsize=15, ha="center", color=INK)
ax.text(dx + dw / 2, dy + dh + 0.18, "128×64 LEDs · four knobs", fontsize=11.5, ha="center", color=FAINT)

# ── Ways to get one ──────────────────────────────────────────────────────────
box(0.7, 2.6, 3.9, 1.25, "GitHub — every file", "firmware · PCB · STL · guides")
box(0.7, 0.7, 3.9, 1.15, "Crowd Supply", "ready-made — Q4 2026", dashed=True)
# arrow rides the left edge; the label gets the open cream to its right
arrow((1.35, 3.85), (1.6, 5.0), rad=-0.15)
ax.text(3.05, 4.48, "build it (~1 h soldering,\nfirst-timers do fine)", fontsize=11.5, ha="center", va="center", color=INK)
arrow((4.6, 1.3), (5.0, 1.3), rad=0.0, dashed=True)  # stub toward the margin note
ax.text(5.15, 1.3, "subscribe, hear when it opens", fontsize=11, color=FAINT, va="center")

# ── patternflow.work (the web half) ──────────────────────────────────────────
ax.add_patch(
    FancyBboxPatch(
        (5.9, 2.35), 5.6, 6.85,
        boxstyle="round,pad=0.1,rounding_size=0.18",
        fc="none", ec=FAINT, lw=1.6, ls=(0, (7, 4)),
    )
)
ax.text(8.7, 8.85, "patternflow.work — half the instrument", fontsize=14, ha="center", color=INK)

box(6.3, 7.15, 4.8, 1.2, "Live Editor", "a Patternflow in the browser — no account")
box(6.3, 5.35, 4.8, 1.2, "Pattern Lab", "make patterns: AI prompts · color ramps")
box(6.3, 3.55, 4.8, 1.2, "Community wall", "share · fork · decks", edge=ORANGE, lw=2.5)
arrow((8.7, 7.15), (8.7, 6.55))
arrow((8.7, 5.35), (8.7, 4.75), label="publish", label_dy=0.02, label_at=0.45)

# the one arrow that says the whole point: web -> device, wireless, seconds
arrow((6.3, 4.15), (3.95, 6.0), rad=0.25, color=ORANGE)
ax.text(5.05, 5.42, "to the device\nover Wi-Fi —\nseconds, no cable", fontsize=11.5, ha="center", va="center", color=ORANGE)

# ── Where people are ─────────────────────────────────────────────────────────
ax.text(13.75, 8.85, "WHERE PEOPLE ARE", fontsize=14, ha="center", color=INK)
box(12.1, 7.15, 3.3, 1.2, "Discord", "most active — builds,\nhelp, patterns daily", edge=ORANGE, lw=2.5, sub_size=10.5)
box(12.1, 5.35, 3.3, 1.2, "Instagram", "new patterns almost daily", sub_size=10.5)
box(12.1, 3.55, 3.3, 1.2, "GitHub Discussions", "quiet — Discord instead", sub_size=10.5, title_size=13)

# ── The Workshop — where it is all heading ───────────────────────────────────
box(8.4, 0.7, 5.3, 1.35, "The Workshop", "the map of directions — pin yourself, start a thread",
    edge=ORANGE, lw=2.8, title_size=16)
ax.text(11.05, 0.34, "* project talk is slowly gathering here", fontsize=12, ha="center", color=ORANGE)
arrow((8.7, 3.55), (9.6, 2.15), rad=-0.1)
arrow((13.2, 3.55), (12.3, 2.15), rad=0.15, dashed=True, color=FAINT)
arrow((15.42, 7.3), (13.75, 2.05), rad=-0.38, dashed=True, color=FAINT)
ax.text(14.75, 2.62, "over time", fontsize=10.5, ha="center", va="center", color=FAINT)

out = "docs/media/at-a-glance.png"
fig.savefig(out, bbox_inches="tight", facecolor=CREAM, pad_inches=0.25)

# xkcd mode sketches a dashed artifact along the figure's top and bottom edges
# (some frame edge picking up the wobble effect). The 0.25in pad above means
# nothing real lives within ~35px of the border, so shaving 16px simply
# removes the artifact.
from PIL import Image

image = Image.open(out)
width, height = image.size
image.crop((6, 16, width - 6, height - 16)).save(out)
print(f"wrote {out} ({width - 12}x{height - 32})")
