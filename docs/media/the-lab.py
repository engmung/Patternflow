# Draws docs/media/the-lab.png — the long-view map: Patternflow as a lab for
# interactive visual patterns. Companion to at-a-glance.py (which answers
# "what exists, where do I go"); this one answers "what is this, where is it
# going". Rerun after anything changes:
#
#   python docs/media/the-lab.py
#
# Honesty rules carried over from the first map: solid ink is what exists
# today, dashed is a direction — drawn in the Workshop, or the long view.

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
ax.patch.set_visible(False)
fig.patch.set_edgecolor("none")


def arrow(p1, p2, rad=0.0, color=INK, dashed=False, lw=2.0):
    ax.add_patch(
        FancyArrowPatch(
            p1, p2, arrowstyle="-|>", mutation_scale=20, lw=lw,
            color=color, ls=(0, (5, 3)) if dashed else "-",
            connectionstyle=f"arc3,rad={rad}", shrinkA=6, shrinkB=6,
        )
    )


def line(p1, p2, color=INK, lw=2.0, dashed=False):
    ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=color, lw=lw,
            ls=(0, (5, 3)) if dashed else "-", solid_capstyle="round")


# ── Title — stays high; the scene sits lower so it has air ──────────────────
ax.text(8.0, 9.95, "PATTERNFLOW — a lab for interactive visual patterns",
        fontsize=23, color=INK, ha="center", va="center")

# ── The triangle: three senses, three crafts, one object ────────────────────
LIGHT = (4.6, 7.9)
SOUND = (1.7, 3.15)
TOUCH = (7.5, 3.15)
line(LIGHT, SOUND)
line(SOUND, TOUCH)
line(TOUCH, LIGHT)

# vertex: LIGHT
ax.text(4.6, 8.9, "LIGHT", fontsize=16, ha="center", color=ORANGE)
ax.text(4.6, 8.35, "visual artists\npatterns · the wall · forks", fontsize=11,
        ha="center", va="center", color=INK)

# vertex: SOUND
ax.text(1.55, 2.65, "SOUND", fontsize=16, ha="center", color=ORANGE)
ax.text(1.75, 1.9, "sound artists\nOSC both ways · Ableton / Max / TD\naudio-react", fontsize=11,
        ha="center", va="center", color=INK)

# vertex: TOUCH
ax.text(7.6, 2.65, "TOUCH", fontsize=16, ha="center", color=ORANGE)
ax.text(7.5, 1.9, "makers\nfour knobs · soldering\nenclosures in any material", fontsize=11,
        ha="center", va="center", color=INK)

# the device at the centroid — instrument no. 1
dx, dy, dw, dh = 3.6, 4.15, 1.9, 2.0
ax.add_patch(Rectangle((dx, dy), dw, dh, fc="white", ec=INK, lw=2.2))
px, py, pw, ph = dx + 0.11, dy + 0.11, dw * 0.60, dh - 0.22
ax.add_patch(Rectangle((px, py), pw, ph, fc=INK, ec=INK, lw=1.0))
zone_mid = (px + pw + (dx + dw)) / 2
for kx, ky in [(zone_mid - 0.16, dy + dh - 0.34), (zone_mid + 0.16, dy + dh - 0.34),
               (zone_mid - 0.16, dy + dh - 0.68), (zone_mid + 0.16, dy + dh - 0.68)]:
    ax.add_patch(Circle((kx, ky), 0.13, fc=CREAM, ec=INK, lw=1.8))
    ax.plot([kx, kx + 0.08], [ky, ky + 0.08], color=INK, lw=1.5)
ax.text(dx + dw / 2, dy - 0.35, "instrument no. 1", fontsize=12, ha="center", color=INK)

# Instagram — the proving ground (a real loop, today)
ax.add_patch(
    FancyBboxPatch(
        (0.65, 5.95), 2.7, 1.5,
        boxstyle="round,pad=0.06,rounding_size=0.12",
        fc=CREAM, ec=ORANGE, lw=2.3,
    )
)
ax.text(2.0, 7.0, "Instagram", fontsize=13.5, ha="center", color=INK)
ax.text(2.0, 6.5, "the proving ground —\nevery pattern meets the\npublic within hours", fontsize=9.5,
        ha="center", va="center", color=FAINT)
arrow((3.35, 6.65), (4.05, 6.9), rad=-0.2, color=FAINT, dashed=True, lw=1.6)

# ── The scale ray: the same panel, growing — and growing sideways ───────────
# medium: variants and modules — directions already drawn in the Workshop
mx, my, mw, mh = 8.4, 4.45, 1.9, 2.6
ax.add_patch(Rectangle((mx, my), mw, mh, fc="white", ec=INK, lw=2.0, ls=(0, (6, 3))))
ax.add_patch(Rectangle((mx + 0.14, my + 0.14), mw - 0.28, mh - 0.28, fc=INK, ec="none"))

# a speaker snapped onto its side: the family is modular, not just bigger —
# audio, sensors, whatever docks on. Dashed like everything not yet real.
sx, sy, sw, sh = mx + mw, 4.75, 0.82, 1.62
ax.add_patch(Rectangle((sx, sy), sw, sh, fc="white", ec=INK, lw=2.0, ls=(0, (6, 3))))
ax.add_patch(Circle((sx + sw / 2, sy + 0.55), 0.27, fc="none", ec=INK, lw=1.8))
ax.add_patch(Circle((sx + sw / 2, sy + 1.25), 0.13, fc="none", ec=INK, lw=1.8))

ax.text(9.75, my - 0.38,
        "bigger panels · laser-cut\nwired OSC · snap-on modules\n(speakers, audio, …)\n— the Workshop's directions",
        fontsize=10, ha="center", va="top", color=INK)

# large: installations — the long view
lx, ly, lw_, lh = 12.4, 3.85, 3.1, 3.9
ax.add_patch(Rectangle((lx, ly), lw_, lh, fc="white", ec=INK, lw=2.0, ls=(0, (6, 3))))
ax.add_patch(Rectangle((lx + 0.16, ly + 0.16), lw_ - 0.32, lh - 0.32, fc=INK, ec="none"))
ax.text(lx + lw_ / 2, ly - 0.9, "installations · commissioned\nworks · B2B spaces", fontsize=10.5,
        ha="center", va="top", color=INK)
ax.text(lx + lw_ / 2, ly + lh + 0.3, "the long view", fontsize=11, ha="center", color=FAINT)

# a person, for scale, beside the big wall
hx, hy = 12.2, 3.9
ax.add_patch(Circle((hx, hy + 0.62), 0.11, fc="none", ec=INK, lw=1.8))
line((hx, hy + 0.51), (hx, hy + 0.18), lw=1.8)                    # body
line((hx, hy + 0.44), (hx - 0.14, hy + 0.28), lw=1.8)             # arms
line((hx, hy + 0.44), (hx + 0.14, hy + 0.28), lw=1.8)
line((hx, hy + 0.18), (hx - 0.11, hy), lw=1.8)                    # legs
line((hx, hy + 0.18), (hx + 0.11, hy), lw=1.8)

arrow((5.65, 5.15), (8.2, 5.55), rad=-0.15, dashed=True, color=ORANGE, lw=2.2)
arrow((11.35, 6.55), (12.3, 6.8), rad=-0.15, dashed=True, color=ORANGE, lw=2.2)
ax.text(7.05, 6.2, "the same pattern,\nany surface", fontsize=11, ha="center", color=ORANGE)

# ── The research line, underneath everything ────────────────────────────────
line((0.9, 0.85), (3.0, 0.85), color=FAINT, lw=1.4, dashed=True)
line((13.0, 0.85), (15.1, 0.85), color=FAINT, lw=1.4, dashed=True)
ax.text(8.0, 0.85, "the conversation it joins:  Paik's Participation TV (1963) → from participating to making",
        fontsize=11, ha="center", va="center", color=FAINT)

# legend
ax.text(15.3, 8.85, "solid — exists today\ndashed — a direction", fontsize=10,
        ha="right", va="center", color=FAINT)

out = "docs/media/the-lab.png"
fig.savefig(out, bbox_inches="tight", facecolor=CREAM, pad_inches=0.25)

from PIL import Image

image = Image.open(out)
width, height = image.size
image.crop((6, 16, width - 6, height - 16)).save(out)
print(f"wrote {out} ({width - 12}x{height - 32})")
