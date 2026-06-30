'use client';

import React from 'react';
import Link from 'next/link';
import BreadboardDiagram from '@/components/docs/BreadboardDiagram';

export default function BreadboardBuildPage() {
  return (
    <div style={{ backgroundColor: 'var(--pf-cream)', minHeight: '100vh', color: 'var(--pf-ink)' }}>
      {/* Navigation Header */}
      <header style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '32px 24px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Link href="/" style={{
          fontFamily: 'var(--pf-mono)',
          fontSize: 'var(--pf-fs-mono)',
          letterSpacing: 'var(--pf-track-mono)',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--pf-ink)',
          textDecoration: 'none'
        }}>
          ← Patternflow
        </Link>
        <span style={{
          fontFamily: 'var(--pf-mono)',
          fontSize: '10px',
          letterSpacing: 'var(--pf-track-mono)',
          textTransform: 'uppercase',
          color: 'var(--pf-ink-muted)'
        }}>
          Breadboard Edition
        </span>
      </header>

      {/* Main Document Shell */}
      <main style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '24px 24px 96px',
        display: 'flex',
        flexDirection: 'column',
        gap: '48px'
      }}>
        {/* Document Header */}
        <header style={{
          borderBottom: '2px solid var(--pf-ink)',
          paddingBottom: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            fontFamily: 'var(--pf-mono)',
            fontSize: 'var(--pf-fs-mono)',
            letterSpacing: 'var(--pf-track-mono)',
            textTransform: 'uppercase',
            color: 'var(--pf-led)',
            fontWeight: 700
          }}>
            Open-source LED synthesizer
          </div>
          <h1 style={{
            fontFamily: 'var(--pf-sans)',
            fontWeight: 700,
            fontSize: 'clamp(32px, 6vw, 48px)',
            lineHeight: 1.05,
            letterSpacing: 'var(--pf-track-tight)',
            margin: 0
          }}>
            Patternflow<br />Breadboard Build Guide
          </h1>
          <p style={{
            fontSize: '16px',
            lineHeight: 1.55,
            color: 'var(--pf-ink-muted)',
            margin: 0,
            maxWidth: '56ch'
          }}>
            Build the whole thing with no custom PCB — just one snapped-off breadboard power strip and a handful of jumper wires. This guide leads with the picture, because the wiring is the hard part.
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginTop: '8px',
            fontFamily: 'var(--pf-mono)',
            fontSize: 'var(--pf-fs-mono)'
          }}>
            <span style={{
              background: 'var(--pf-cream-2)',
              border: '1px solid var(--pf-rule)',
              borderRadius: '999px',
              padding: '6px 14px',
              color: 'var(--pf-ink)'
            }}>⏱ ~1 h 30 min</span>
            <span style={{
              background: 'var(--pf-cream-2)',
              border: '1px solid var(--pf-rule)',
              borderRadius: '999px',
              padding: '6px 14px',
              color: 'var(--pf-ink)'
            }}>◇ Beginner-friendly</span>
            <span style={{
              background: 'var(--pf-cream-2)',
              border: '1px solid var(--pf-rule)',
              borderRadius: '999px',
              padding: '6px 14px',
              color: 'var(--pf-ink)'
            }}>⚙ No soldering iron required*</span>
          </div>
        </header>

        {/* Before You Start section */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: 'color-mix(in oklab, var(--pf-led) 6%, var(--pf-cream))',
            border: '1px solid color-mix(in oklab, var(--pf-led) 20%, var(--pf-rule))',
            borderLeft: '4px solid var(--pf-led)',
            borderRadius: '8px',
            padding: '18px 22px'
          }}>
            <div style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--pf-ink)'
            }}>
              <span style={{ fontSize: '18px' }}>⚡</span> Flash the firmware first
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--pf-ink-muted)' }}>
              Flashing is fiddly once everything is wired into a tangle of jumpers. Connect the bare ESP32-S3 to your computer via USB-C, visit{' '}
              <Link href="/" style={{ color: 'var(--pf-led)', fontWeight: 600, textDecoration: 'underline' }}>patternflow.work</Link>, and click <strong>"Flash Patternflow OS"</strong> in the Patterns section (Chrome / Edge desktop). Confirm it boots — <strong>then</strong> start the build.
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--pf-ink-faint)' }}>
              Prefer Arduino IDE? See{' '}
              <a href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md#82-arduino-ide-manual--custom-builds" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', textDecoration: 'underline' }}>
                official guide Section 8.2
              </a>{' '}
              for board settings and upload steps.
            </p>
          </div>
          <div style={{
            background: 'var(--pf-cream-2)',
            border: '1px solid var(--pf-rule)',
            borderRadius: '8px',
            padding: '14px 18px',
            fontSize: '13px',
            lineHeight: 1.55,
            color: 'var(--pf-ink-muted)'
          }}>
            <strong style={{ color: 'var(--pf-ink)' }}>🖨 3D-printed enclosure:</strong> Print the case <em>before</em> you start wiring — it takes ~11 hours. STL files and print settings are in the{' '}
            <a href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md#2-3d-printing" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', textDecoration: 'underline' }}>
              official Build Guide — Sections 2 & 3
            </a>. A cardboard box with four holes for the encoder shafts works too.
          </div>
        </section>

        {/* Bill of Materials (BOM) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 500,
              fontSize: '22px',
              letterSpacing: 'var(--pf-track-tight)',
              margin: '0 0 4px 0'
            }}>Bill of Materials</h2>
            <p style={{ fontSize: '13px', color: 'var(--pf-ink-muted)', margin: 0 }}>
              No PCB, no SMD parts, no soldering iron. Everything plugs together with Dupont jumper wires.
            </p>
          </div>

          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--pf-rule)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--pf-ink)' }}>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--pf-mono)', fontSize: 'var(--pf-fs-mono)', letterSpacing: 'var(--pf-track-mono)', textTransform: 'uppercase', color: 'var(--pf-ink-muted)', fontWeight: 700 }}>Qty</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--pf-mono)', fontSize: 'var(--pf-fs-mono)', letterSpacing: 'var(--pf-track-mono)', textTransform: 'uppercase', color: 'var(--pf-ink-muted)', fontWeight: 700 }}>Item</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--pf-mono)', fontSize: 'var(--pf-fs-mono)', letterSpacing: 'var(--pf-track-mono)', textTransform: 'uppercase', color: 'var(--pf-ink-muted)', fontWeight: 700 }}>Spec / Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700, whiteSpace: 'nowrap' }}>1×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>ESP32-S3 DevKitC</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>N16R8 (16 MB Flash, 8 MB PSRAM), 44-pin, 25.4 mm header spacing. PSRAM required.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>1×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>HUB75E LED matrix</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>128×64 px, P2.5, 320×160 mm. Driver IC must be <strong>74HC595</strong>, <strong>FM6126A</strong>, or <strong>FM6124</strong>. Ships with ribbon cable + power cable — both used as-is.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>4×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Rotary encoder (EC11)</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>5-pin, with click-switch. Recommended: <strong>PEC11R-4220F-S0024</strong>. Any click-capable EC11 works — the cheap AliExpress 5-packs are fine.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>1×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Breadboard power rail</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>Snap the +/− rail strip off any standard breadboard. Only this strip is used — the main breadboard body is not needed.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>~40×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Dupont jumper wires</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>Mix of M–F and M–M. 20 cm length recommended. Color-coded packs help but any color works.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>1×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>USB cable (sacrificial)</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>Any USB cable — will be cut and stripped for 5 V power input.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>1×</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Power bank</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>Any standard USB power bank that fits inside the enclosure.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--pf-rule)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-led)', fontWeight: 700 }}>+</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>Tools &amp; extras</td>
                  <td style={{ padding: '10px 8px', color: 'var(--pf-ink-muted)' }}>Hot-glue gun, wire strippers, enclosure (3D-printed or cardboard — see note below).</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            background: 'color-mix(in oklab, var(--pf-led) 6%, var(--pf-cream))',
            border: '1px solid color-mix(in oklab, var(--pf-led) 20%, var(--pf-rule))',
            borderRadius: '8px',
            padding: '14px 18px',
            fontSize: '12.5px',
            lineHeight: 1.55,
            color: 'var(--pf-ink-muted)'
          }}>
            <strong style={{ color: 'var(--pf-ink)' }}>⚠️ Panel compatibility:</strong> Panels with <strong>FM6363C / FM6373C</strong> driver ICs ("3840 Hz" / "needs a receiving card") will <strong>not work</strong>. Stick with 74HC595 / FM6126A / FM6124 panels.{' '}
            <a href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md#1-bill-of-materials-bom" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', textDecoration: 'underline' }}>Full compatibility details →</a>
          </div>

          <div style={{
            background: 'var(--pf-cream-2)',
            border: '1px solid var(--pf-rule)',
            borderRadius: '8px',
            padding: '16px 18px',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--pf-ink-muted)'
          }}>
            <strong style={{ color: 'var(--pf-ink)' }}>🛒 Sourcing tips</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', fontSize: '12.5px' }}>
              <div>
                <a href="https://s.click.aliexpress.com/e/_c3SVdcQr" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', fontWeight: 600, textDecoration: 'underline' }}>
                  LED Matrix — AliExpress ↗
                </a>{' '}
                <span style={{ color: 'var(--pf-ink-faint)' }}>
                  (affiliate link — purchasing through this link supports Patternflow development at no extra cost. Even if you buy a different item through this link, the commission helps. Thank you!)
                </span>
              </div>
              <div>
                <strong style={{ color: 'var(--pf-ink)' }}>ESP32-S3</strong>{' '}
                <span style={{ color: 'var(--pf-ink-faint)' }}>
                  — Buy a <strong style={{ color: 'var(--pf-ink-muted)' }}>genuine Espressif</strong> module. AliExpress clones can have{' '}
                  <a href="https://github.com/engmung/Patternflow/issues/16" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', textDecoration: 'underline' }}>cold-boot issues</a>.
                </span>
              </div>
              <div>
                <strong style={{ color: 'var(--pf-ink)' }}>Rotary encoders</strong>{' '}
                <span style={{ color: 'var(--pf-ink-faint)' }}>
                  — Cheap AliExpress encoders break easily. Get <strong style={{ color: 'var(--pf-ink-muted)' }}>PEC11R-4220F-S0024</strong> or equivalent from Mouser / DigiKey for reliability.
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
            * No soldering required if your encoders accept Dupont leads. You will strip two power leads (USB + panel power) — a hot-glue joint is enough.
          </p>
        </section>

        {/* Master wiring map */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{
              fontFamily: 'var(--pf-mono)',
              fontSize: 'var(--pf-fs-mono)',
              letterSpacing: 'var(--pf-track-mono)',
              textTransform: 'uppercase',
              color: 'var(--pf-led)',
              fontWeight: 700
            }}>
              The one diagram to keep open
            </div>
            <h2 style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 500,
              fontSize: '24px',
              letterSpacing: 'var(--pf-track-tight)',
              margin: '6px 0 4px 0'
            }}>
              Master wiring map
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--pf-ink-muted)', maxWidth: '48ch', margin: 0 }}>
              Everything in its real place: four encoders in a square on the left, the ESP32-S3 in the middle (USB at top), the HUB75E lying on its side on the right with <strong>pin 1 at the top-right</strong>, and the power rail running along the bottom.
            </p>
          </div>
          <div style={{ border: '1px solid var(--pf-rule)', borderRadius: '10px', padding: '6px', background: '#fbfaf7' }}>
            <BreadboardDiagram mode="layout" />
          </div>
        </section>

        {/* Table of Contents (Steps list) */}
        <section style={{
          background: 'var(--pf-cream-2)',
          border: '1px solid var(--pf-rule)',
          borderRadius: '10px',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <h3 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '18px', margin: 0 }}>Build Steps</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'var(--pf-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--pf-ink-muted)' }}>
            {[
              { id: 1, text: 'Prep, mount, & connect encoder grounds' },
              { id: 2, text: 'ESP32 ↔ HUB75E (the colored numbers)' },
              { id: 3, text: 'Encoder signals → ESP32' },
              { id: 4, text: 'Power it' },
              { id: 5, text: 'Close the case' }
            ].map(step => (
              <a href={`#step-${step.id}`} key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
                <span style={{
                  background: 'var(--pf-ink)',
                  color: 'var(--pf-cream)',
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--pf-fs-mono)'
                }}>{step.id}</span>
                <span style={{ borderBottom: '1px solid transparent' }} className="hover:border-current">{step.text}</span>
              </a>
            ))}
          </div>
        </section>

        {/* STEP 1 */}
        <section id="step-1" className="relative xl:min-h-[520px]" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '24px', borderTop: '1px solid var(--pf-rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '14px',
              background: 'var(--pf-ink)',
              color: 'var(--pf-cream)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>1</span>
            <h2 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '20px', margin: 0 }}>
              Prep, mount, &amp; connect encoder grounds
            </h2>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            Plug a short jumper onto every pin of all four encoders first — any length you have on hand is fine. Fix the encoders into the enclosure so they can't twist while you work, placing them in a square: <strong>ENC1</strong> top-left, <strong>ENC2</strong> top-right, <strong>ENC3</strong> bottom-left, <strong>ENC4</strong> bottom-right (holding each with the 3-pin side on the left, 2-pin side on the right).
          </p>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            Next, snap the +/− rail off the side of a breadboard — that little strip is the only breadboard you need. Pull just the ground wires out from the encoders (labeled <strong>GND</strong> on the left and right sides of each encoder) and land them all on the ground (<strong>−</strong>) rail of the breadboard. Leave the signal legs hanging; they go straight to the ESP32 later.
          </p>
          <div style={{ border: '1px solid var(--pf-rule)', borderRadius: '10px', padding: '6px', background: '#fbfaf7' }}>
            <BreadboardDiagram mode="encoders_gnd" />
          </div>
          <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
            ↑ Ground (GND) pins on both sides of all four rotary encoders land on the Ground (<strong>−</strong>) rail of the breadboard.
          </p>
          <div className="w-full mt-4 step-photo-right flex flex-col gap-2">
            <img
              src="/builds/breadboard/step1.jpg"
              alt="Encoders mounted with GND wires connected to the breadboard rail"
              style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--pf-rule)' }}
            />
            <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
              ↑ Encoders fixed, GND wires on the − rail.
            </p>
          </div>
        </section>

        {/* STEP 2 */}
        <section id="step-2" className="relative xl:min-h-[520px]" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '24px', borderTop: '1px solid var(--pf-rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '14px',
              background: 'var(--pf-ink)',
              color: 'var(--pf-cream)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>2</span>
            <h2 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '20px', margin: 0 }}>
              ESP32 ↔ HUB75E (the colored numbers)
            </h2>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            This is the big one — do it next while your wires are still tidy. If your ribbon of long jumpers is fresh, peel it into <strong>strips of 8</strong> and only separate the very ends; the bundle stays neat. Go one row at a time: connect the <strong>red numbers (1→8)</strong> first, then the <strong>blue numbers (1→6)</strong>. The two Ground pins (GND) on the bottom row connect directly to the ground (<strong>−</strong>) rail on the breadboard—you can plug them into any available holes along the ground column.
          </p>
          <div style={{ border: '1px solid var(--pf-rule)', borderRadius: '10px', padding: '6px', background: '#fbfaf7' }}>
            <BreadboardDiagram mode="hub_esp" />
          </div>
          <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
            ↑ U1 (ESP32-S3) on the left, and J1 (HUB75E) on the right. Wire the pins that share the same color-coded labels (e.g. R1, B1, A, B...).
          </p>
          <div className="w-full mt-4 step-photo-left flex flex-col gap-2">
            <img
              src="/builds/breadboard/step3.jpg"
              alt="ESP32-S3 connected to the HUB75E LED matrix via ribbon cable"
              style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--pf-rule)' }}
            />
            <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
              ↑ ESP32-S3 with HUB75E jumpers connected.
            </p>
          </div>
        </section>

        {/* STEP 3 */}
        <section id="step-3" className="relative xl:min-h-[520px]" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '24px', borderTop: '1px solid var(--pf-rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '14px',
              background: 'var(--pf-ink)',
              color: 'var(--pf-cream)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>3</span>
            <h2 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '20px', margin: 0 }}>
              Encoder signals → ESP32
            </h2>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            Now land the signal legs you left hanging. Work by <strong>signal type, not by encoder</strong> — all four <strong>A</strong>'s, then all four <strong>B</strong>'s, then all four <strong>SW</strong>'s. The pins sit together on the board that way, so the wiring stays orderly. (Bonus: the four A's land on consecutive pins 4·5·6·7.)
          </p>
          <div style={{ border: '1px solid var(--pf-rule)', borderRadius: '10px', padding: '6px', background: '#fbfaf7' }}>
            <BreadboardDiagram mode="encoders_esp" />
          </div>
          <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
            ↑ Four rotary encoders on the left, and ESP32 on the right. Wire the signal channels (A, B, SW) to their matching colored tags (e.g. 1A, 2A...).
          </p>
          <div className="w-full mt-4 step-photo-right flex flex-col gap-2">
            <img
              src="/builds/breadboard/step4.jpg"
              alt="All encoder signal wires routed routed into the case alongside the LED panel"
              style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--pf-rule)' }}
            />
            <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
              ↑ Encoder A, B, SW wires all connected.
            </p>
          </div>
        </section>

        {/* STEP 4 */}
        <section id="step-4" className="relative xl:min-h-[520px]" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '24px', borderTop: '1px solid var(--pf-rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '14px',
              background: 'var(--pf-ink)',
              color: 'var(--pf-cream)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>4</span>
            <h2 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '20px', margin: 0 }}>
              Power it
            </h2>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            Strip the LED panel's thick power leads and strip any spare USB cable. Twist each onto a jumper — red to <strong>+</strong>, black to <strong>−</strong> — and push them into the rail. The ESP32's own <strong>5V</strong> and <strong>GND</strong> pins tie into the same two rails, so one 5 V supply feeds everything. A dab of hot glue keeps the bare joints from slipping.
          </p>
          <div style={{ border: '1px solid var(--pf-rule)', borderRadius: '10px', padding: '6px', background: '#fbfaf7' }}>
            <BreadboardDiagram mode="rail" />
          </div>
          <div className="w-full mt-4 step-photo-left flex flex-col gap-2">
            <img
              src="/builds/breadboard/step2.jpg"
              alt="Stripped USB and LED panel power wires being twisted onto jumpers"
              style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--pf-rule)' }}
            />
            <p style={{ fontSize: 'var(--pf-fs-mono)', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0 }}>
              ↑ Power leads stripped and twisted onto jumpers.
            </p>
          </div>
        </section>

        {/* STEP 5 */}
        <section id="step-5" style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '24px', borderTop: '1px solid var(--pf-rule)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--pf-sans)',
              fontWeight: 700,
              fontSize: '14px',
              background: 'var(--pf-ink)',
              color: 'var(--pf-cream)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>5</span>
            <h2 style={{ fontFamily: 'var(--pf-sans)', fontWeight: 500, fontSize: '20px', margin: 0 }}>
              Close the case
            </h2>
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            Tuck the rail and the wire bundles down, seat the LED panel against the front window, and put the lid on. Plug in the supply — the matrix should light up and the encoders should respond. That's a full Patternflow with zero custom hardware.
          </p>
          <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { src: '/builds/breadboard/step5.jpg', label: 'Tuck wires flat.' },
              { src: '/builds/breadboard/step6.jpg', label: 'Put the lid on.' },
              { src: '/builds/breadboard/step7.jpg', label: 'Plug in power bank.' },
              { src: '/builds/breadboard/step8.jpg', label: "It's alive! 🎉" }
            ].map((img, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <img
                  src={img.src}
                  alt={img.label}
                  style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--pf-rule)' }}
                />
                <p style={{ fontSize: '10px', color: 'var(--pf-ink-faint)', fontFamily: 'var(--pf-mono)', margin: 0, marginTop: '2px' }}>
                  {img.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Official Guide Reference */}
        <section style={{
          background: 'var(--pf-cream-2)',
          border: '1px solid var(--pf-rule)',
          borderLeft: '4px solid var(--pf-led)',
          borderRadius: '8px',
          padding: '18px 22px',
          marginTop: '24px'
        }}>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--pf-ink-muted)', margin: 0 }}>
            <strong style={{ color: 'var(--pf-ink)' }}>📖 Official Build Guide</strong> — For 3D printing, case bonding, PCB assembly, known issues, and troubleshooting, see the full guide:<br />
            <a href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', fontFamily: 'var(--pf-mono)', fontSize: '12px', textDecoration: 'underline' }}>
              github.com/engmung/Patternflow — BUILD_GUIDE.md ↗
            </a>
          </p>
        </section>

        {/* Footer */}
        <footer style={{
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: '2px solid var(--pf-ink)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          fontFamily: 'var(--pf-mono)',
          fontSize: 'var(--pf-fs-mono)',
          color: 'var(--pf-ink-muted)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <span>Patternflow · breadboard edition</span>
            <span>
              <a href="https://github.com/engmung/Patternflow/issues/121" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-led)', textDecoration: 'underline' }}>
                github.com/engmung/Patternflow · #121 ↗
              </a>
            </span>
          </div>
          <div style={{ fontSize: '10px', lineHeight: 1.5, color: 'var(--pf-ink-faint)', marginTop: '4px' }}>
            © 2026 SeungHun Lee (June 28, 2026). This guide is licensed under{' '}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer" style={{ color: 'var(--pf-ink-muted)', textDecoration: 'underline' }}>
              CC BY-NC-SA 4.0
            </a>
            . You are free to share and adapt this work for non-commercial purposes, provided you give appropriate credit and distribute your contributions under the same license.
          </div>
        </footer>
      </main>

      {/* Scoped style to support printing and avoiding split sections */}
      <style jsx global>{`
        @media (min-width: 1280px) {
          .step-photo-right {
            position: absolute !important;
            top: 50% !important;
            left: 100% !important;
            margin-left: 120px !important;
            transform: translateY(-50%) !important;
            width: 360px !important;
            margin-top: 0 !important;
          }
          .step-photo-left {
            position: absolute !important;
            top: 50% !important;
            right: 100% !important;
            margin-right: 120px !important;
            transform: translateY(-50%) !important;
            width: 360px !important;
            margin-top: 0 !important;
          }
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          main {
            padding: 0 !important;
            max-width: none !important;
          }
          section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          header {
            display: none !important;
          }
          .step-photo-right,
          .step-photo-left {
            position: static !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            margin-top: 16px !important;
            transform: none !important;
            width: 100% !important;
            max-width: 440px !important;
          }
        }
      `}</style>
    </div>
  );
}
