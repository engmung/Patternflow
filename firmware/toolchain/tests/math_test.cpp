// Sweeps the three headers a loadable module compiles into itself — core_math.h,
// core_color.h, core_noise.h — against double-precision references, and pins
// every number it measures.
//
// WHY THIS EXISTS. abi/pf_module.h:241-243 includes these three files into every
// .pfm, so they are not internal helpers: they are the published pattern SDK. Up
// to this file, nothing in the repository ran a single number through them. Their
// accuracy was asserted only in doc-comments, and two of those comments turned out
// to be wrong about their own function (fastAtan2 is far better than it claims;
// core_math.h:48 calls a division "a single instruction on this FPU" when it
// compiles to a __divsf3 call). A doc-comment cannot arbitrate between two
// competing rewrites of the same approximation. A pinned number can.
//
// HOW TO READ A FAILURE. Every row is a band, not a ceiling, and that is
// deliberate — the same rule abi.sums works under. A value moving DOWN fails just
// as loudly as one moving up, because an accuracy change to these headers changes
// what every future pattern renders, and it should appear in the diff that causes
// it rather than on someone panel-side. If you improved something: say so in the
// commit, re-pin the row, and note it in CHANGELOG.md.
//
// THE OBLIGATION NOBODY WROTE DOWN. These headers are INLINED into modules, not
// reached through the host API. A semantic change here therefore reaches only
// newly-built .pfm files: an installed module and a rebuild of its own source will
// render differently on the same firmware. Any re-pin of a KNOWN DEFECT row below
// is that kind of change, and owes a release note.
//
// License: MIT
#define _USE_MATH_DEFINES
#define PF_MODULE_BUILD 1

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

#include "core_color.h"
#include "core_math.h"
#include "core_noise.h"

namespace {

int failures = 0;
int rows = 0;

int defects = 0;

// value must land inside [lo, hi]. Printed either way, so a run is also a report.
//
// `note` is set on a row that pins a KNOWN DEFECT rather than an accuracy budget:
// the number is what the code does today, it is not what the code should do, and
// the pin exists so that fixing it is a deliberate act with a release note rather
// than a silent change to what every pattern renders. Bands are tight on purpose -
// MSVC and GCC produce these values identically to six significant figures, so
// there is no cross-compiler slack to leave room for.
void pin(const char* name, double value, double lo, double hi, const char* unit,
         const char* note = nullptr) {
  const bool ok = (value >= lo) && (value <= hi);
  rows++;
  if (!ok) failures++;
  if (note) defects++;
  std::printf("  %-30s %12.6g %-5s [%.6g, %.6g] %-8s %s\n",
              name, value, unit, lo, hi, ok ? "ok" : "<-- FAIL",
              note ? note : "");
}

double maxd(double a, double b) { return a > b ? a : b; }

double mind(double a, double b) { return a < b ? a : b; }

// The ideal HSV to RGB the firmware fixed path approximates, in double, rounded
// rather than truncated.
void hsvRef(double h, double s, double v, double out[3]) {
  h -= std::floor(h);
  const double c = v * s;
  const double hh = h * 6.0;
  int i = (int)hh;
  if (i > 5) i = 5;
  const double f = hh - (double)i;
  const double x = c * ((i & 1) ? (1.0 - f) : f);
  const double m = v - c;
  const double table[6][3] = {{c, x, 0}, {x, c, 0}, {0, c, x},
                              {0, x, c}, {x, 0, c}, {c, 0, x}};
  for (int k = 0; k < 3; k++) out[k] = (table[i][k] + m) * 255.0;
}

// What an API named "ramp", taking stops with float positions, is expected to do.
void rampRef(const PFColor::ColorStop* stops, int count, double t, double out[3]) {
  if (t <= (double)stops[0].position) {
    out[0] = stops[0].r; out[1] = stops[0].g; out[2] = stops[0].b;
    return;
  }
  for (int i = 1; i < count; i++) {
    if (t <= (double)stops[i].position) {
      const double span = (double)stops[i].position - (double)stops[i - 1].position;
      const double u = span > 0.0 ? (t - (double)stops[i - 1].position) / span : 0.0;
      const double a[3] = {(double)stops[i - 1].r, (double)stops[i - 1].g, (double)stops[i - 1].b};
      const double b[3] = {(double)stops[i].r, (double)stops[i].g, (double)stops[i].b};
      for (int k = 0; k < 3; k++) out[k] = a[k] + (b[k] - a[k]) * u;
      return;
    }
  }
  out[0] = stops[count - 1].r; out[1] = stops[count - 1].g; out[2] = stops[count - 1].b;
}

const int SAMPLES = 200001;

void sweepTrig() {
  double sinErr = 0.0, cosErr = 0.0, odd = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    const double t = -4.0 * M_PI + (8.0 * M_PI) * (double)i / (double)(SAMPLES - 1);
    const float x = (float)t;
    sinErr = maxd(sinErr, std::fabs((double)PFMath::fastSin(x) - std::sin((double)x)));
    cosErr = maxd(cosErr, std::fabs((double)PFMath::fastCos(x) - std::cos((double)x)));
    odd = maxd(odd, std::fabs((double)PFMath::fastSin(x) + (double)PFMath::fastSin(-x)));
  }
  std::printf("\ncore_math.h - trigonometry\n");
  // 2*pi/1024 = 6.136e-3 is the theoretical bound for a truncated lookup, and
  // the sweep lands on it: the LUT step IS the error. In 8-bit panel terms that
  // is 1.565 of an LSB.
  pin("fastSin max abs err", sinErr, 0.00610, 0.00615, "");
  pin("fastCos max abs err", cosErr, 0.00611, 0.00616, "");
  // Not exactly zero, though truncation toward zero is symmetric and the mask
  // maps -i and +i to entries that hold exact negatives of each other. The
  // residue is buildSinLUT calling sinf() independently for the two entries.
  pin("fastSin oddness |f(x)+f(-x)|", odd, 0.0, 1e-06, "");
}

void sweepAtan2() {
  double err = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    const double a = -M_PI + (2.0 * M_PI) * (double)i / (double)SAMPLES;
    const float y = (float)std::sin(a);
    const float x = (float)std::cos(a);
    double d = (double)PFMath::fastAtan2(y, x) - std::atan2((double)y, (double)x);
    while (d > M_PI) d -= 2.0 * M_PI;
    while (d < -M_PI) d += 2.0 * M_PI;
    err = maxd(err, std::fabs(d));
  }
  // core_math.h:118 advertises "max error ~0.0015 rad". The real figure is 7.4x
  // tighter than the function claims about itself. Nothing is wrong with the
  // polynomial; the comment is wrong, which is the reason this file exists.
  pin("fastAtan2 max abs err", err, 2.02e-4, 2.05e-4, "rad");
}

void sweepLength() {
  double rel = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    const double a = (2.0 * M_PI) * (double)i / (double)SAMPLES;
    const float x = (float)std::cos(a);
    const float y = (float)std::sin(a);
    rel = maxd(rel, std::fabs((double)PFMath::approxLength(x, y) - 1.0));
  }
  // core_math.h:75 says "~5% error". It is 6.8%, and the error is not centred:
  // the alpha-max-plus-beta-min coefficient 0.375 is the convenient shift-friendly
  // value, not the minimax one, so the ripple runs -2.8%/+6.8% instead of equal.
  pin("approxLength max rel err", rel * 100.0, 6.79, 6.81, "%",
      "DEFECT: doc-comment says ~5%; 0.375 is not minimax");
}

void sweepFractAndMod() {
  double fractErr = 0.0, modErr = 0.0;
  bool inRange = true;
  for (int i = 0; i < SAMPLES; i++) {
    const float x = (float)(-1000.0 + 2000.0 * (double)i / (double)(SAMPLES - 1));
    const float f = PFMath::fract(x);
    if (!(f >= 0.0f && f < 1.0f)) inRange = false;
    fractErr = maxd(fractErr, std::fabs((double)f - ((double)x - std::floor((double)x))));
  }
  const float mods[5] = {1.0f, 2.0f, 3.0f, 6.0f, 7.5f};
  for (int m = 0; m < 5; m++) {
    for (int i = 0; i <= 20000; i++) {
      const float x = (float)(-1000.0 + 2000.0 * (double)i / 20000.0);
      modErr = maxd(modErr, std::fabs((double)PFMath::jsMod(x, mods[m]) -
                                      std::fmod((double)x, (double)mods[m])));
    }
  }
  // These three are the contract any faster floor/mod must keep. On the S3 both
  // floorf() and the division inside jsMod compile to windowed libgcc/libm calls,
  // so both are live optimization targets; whatever replaces them has to land
  // back inside these bands or it has changed what patterns draw.
  pin("fract in [0,1) over +/-1000", inRange ? 1.0 : 0.0, 1.0, 1.0, "bool");
  pin("fract vs floor max err", fractErr, 0.0, 1e-07, "");
  pin("jsMod vs fmod max err", modErr, 0.0, 1e-05, "");
}

void sweepPow() {
  double logErr = 0.0, expRel = 0.0, powRel = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    const double e = -40.0 + 80.0 * (double)i / (double)(SAMPLES - 1);
    const float x = (float)std::pow(2.0, e);
    if (x > 0.0f && std::isfinite(x))
      logErr = maxd(logErr, std::fabs((double)PFMath::fastLog2(x) - std::log2((double)x)));
  }
  for (int i = 0; i < SAMPLES; i++) {
    const double p = -30.0 + 60.0 * (double)i / (double)(SAMPLES - 1);
    const double want = std::exp2(p);
    expRel = maxd(expRel, std::fabs((double)PFMath::fastExp2((float)p) - want) / want);
  }
  for (int xi = 1; xi <= 255; xi++) {
    for (int pi = 0; pi <= 96; pi++) {
      const double x = (double)xi / 255.0;
      const double p = 0.2 + 4.8 * (double)pi / 96.0;
      const double want = std::pow(x, p);
      powRel = maxd(powRel, std::fabs((double)PFMath::fastPow((float)x, (float)p) - want) / want);
    }
  }
  std::printf("\ncore_math.h - logarithms and powers\n");
  // core_math.h:81 says fastPow is "~0.1% typical error". Max over this grid is
  // 0.054%, so the comment is honest. Both halves carry a division, which is a
  // __divsf3 call on this target - the standing proposal is to replace them with
  // divide-free minimax polynomials, and these bands are what it must beat.
  pin("fastLog2 max abs err", logErr, 1.50e-4, 1.53e-4, "log2");
  pin("fastExp2 max rel err", expRel * 100.0, 0.00695, 0.00700, "%");
  pin("fastPow max rel err", powRel * 100.0, 0.0535, 0.0538, "%");
}

void sweepColor() {
  double maxAbs = 0.0, sum = 0.0;
  long n = 0;
  for (int hi = 0; hi < 360; hi++) {
    for (int si = 0; si <= 10; si++) {
      for (int vi = 0; vi <= 10; vi++) {
        const double h = (double)hi / 360.0;
        const double s = (double)si / 10.0;
        const double v = (double)vi / 10.0;
        uint8_t r = 0, g = 0, b = 0;
        PFColor::hsvToRgb((float)h, (float)s, (float)v, r, g, b);
        double want[3];
        hsvRef(h, s, v, want);
        const double got[3] = {(double)r, (double)g, (double)b};
        for (int k = 0; k < 3; k++) {
          const double d = got[k] - std::floor(want[k] + 0.5);
          maxAbs = maxd(maxAbs, std::fabs(d));
          sum += d;
          n++;
        }
      }
    }
  }
  std::printf("\ncore_color.h\n");
  pin("hsvToRgb max abs err", maxAbs, 1.0, 1.0, "LSB");
  // Every channel is (uint8_t)(f * 255.0f) - truncation, no + 0.5f - so the whole
  // function sits half an LSB dark. buildPowLUT four lines away DOES round, so the
  // two helpers in this one header disagree with each other about the same step.
  pin("hsvToRgb mean signed err", sum / (double)n, -0.472, -0.467, "LSB",
      "DEFECT: truncates where buildPowLUT rounds");

  const PFColor::ColorStop ramp[3] = {
    {0.0f, 0, 0, 0}, {0.5f, 255, 0, 0}, {1.0f, 255, 255, 255},
  };
  double rampErr = 0.0;
  for (int i = 0; i <= 100000; i++) {
    const double t = (double)i / 100000.0;
    uint8_t r = 0, g = 0, b = 0;
    PFColor::sampleRamp(ramp, 3, (float)t, r, g, b);
    double want[3];
    rampRef(ramp, 3, t, want);
    const double got[3] = {(double)r, (double)g, (double)b};
    for (int k = 0; k < 3; k++) rampErr = maxd(rampErr, std::fabs(got[k] - want[k]));
  }
  // 255 is the whole 8-bit range: sampleRamp does not interpolate at all. It walks
  // the stops and assigns the last one whose position <= t, so a "ramp" built from
  // ColorStops with float positions renders as hard bands. The near-miss from a
  // round 255 is only the endpoint, where step and lerp happen to agree.
  pin("sampleRamp vs linear interp", rampErr, 254.9, 255.0, "LSB",
      "DEFECT: a ramp API that is a step function");
}

void sweepNoise() {
  // cellHash takes a seed argument documented as decorrelating layers. This
  // measures how much of the seeded field is literally the unseeded field slid
  // along x, which is the thing the argument is supposed not to be.
  const int seeds[4] = {1, 7, 33, 128};
  long same = 0, total = 0;
  for (int s = 0; s < 4; s++) {
    for (int gx = 0; gx < 256; gx++) {
      for (int gy = 0; gy < 256; gy++) {
        if (PFNoise::cellHash(gx, gy, seeds[s]) == PFNoise::cellHash(gx + seeds[s], gy)) same++;
        total++;
      }
    }
  }
  double perlinAbs = 0.0, valueLo = 1.0, valueHi = 0.0;
  for (int i = 0; i < 600; i++) {
    for (int j = 0; j < 600; j++) {
      const float x = (float)i * 0.037f;
      const float y = (float)j * 0.041f;
      perlinAbs = maxd(perlinAbs, std::fabs((double)PFNoise::perlin2D(x, y)));
      const double v = (double)PFNoise::valueNoise2D(x, y);
      valueLo = mind(valueLo, v);
      valueHi = maxd(valueHi, v);
    }
  }
  std::printf("\ncore_noise.h\n");
  // 1.0 means EVERY lattice point matches: cellHash(x, y, seed) is identically
  // cellHash(x + seed, y), because the seed is added to gx before the same hash.
  // Two layers seeded 0 and 1 are one field and a copy of it slid one cell over.
  pin("cellHash seed == x-translation", (double)same / (double)total, 1.0, 1.0, "frac",
      "DEFECT: seed decorrelates nothing");
  // grad2 returns +/-u +/- 2v, so its gradient vectors are (1,2)-shaped with length
  // sqrt(5) rather than normalised - Perlin's own grad() has no factor of two. The
  // field therefore runs to +/-1.51, while cellHash and valueNoise2D document 0..1
  // and perlin2D documents no range at all. The common pattern idiom (n + 1) * 0.5
  // clips at both ends. Pinned, NOT fixed: changing it changes every existing
  // pattern's picture, and a module carries its own compiled copy of this header.
  pin("perlin2D max |value|", perlinAbs, 1.509, 1.512, "",
      "DEFECT: gradients unnormalised, range is not +/-1");
  pin("valueNoise2D min", valueLo, 0.0, 0.001, "");
  pin("valueNoise2D max", valueHi, 0.999, 1.0, "");
}

}  // namespace

int main() {
  PFMath::buildSinLUT();
  std::printf("Pinned behaviour of the three headers every .pfm compiles into itself.\n");
  sweepTrig();
  sweepAtan2();
  sweepLength();
  sweepFractAndMod();
  sweepPow();
  sweepColor();
  sweepNoise();
  std::printf("\n%d rows, %d outside their band, %d pinning a known defect\n",
              rows, failures, defects);
  if (failures) {
    std::printf(
        "\nA row moved. That is not automatically a bug - but it is automatically a\n"
        "change to what every pattern built from now on will render. Re-pin the row in\n"
        "this file, say which direction it moved and why in the commit, and if the row\n"
        "is marked DEFECT, add the release note: an installed .pfm compiled the OLD\n"
        "header into itself and will not match a rebuild of its own source.\n");
  }
  return failures == 0 ? 0 : 1;
}
