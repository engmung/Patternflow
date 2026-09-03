# The Wi-Fi setup portal a Samsung never drew

*August 2026. Parked on branch `feat/wifi-setup-portal`, not merged, not in any edition. Recorded 2026-09-03 so the branch is not mistaken for unfinished work that wants finishing.*

## What it was

A panel that cannot join any network opens an open SoftAP (`Patternflow-Setup-XXXX`) and captive-portal serves the existing `/wifi` page, so a phone can hand it a network with no USB, no desktop, no app. Two triggers: a public image with nothing provisioned opens seconds after boot; real credentials that keep failing open after 45 s in AP+STA, so a returning router still wins. It closes itself on connect.

It was born from a real bricking: a clean public image onto a board whose Wi-Fi lived only in the previous firmware, and every HTTP service waiting for a connect edge that never came. The `/wifi` page was always the cure; this was meant to make it reachable from zero.

## What the bench taught

Every fix the serial log earned is sealed in the second commit of the branch:

- DNS and HTTP bring-up have to wait ~700 ms for the AP netif — a socket opened in `softAP()`'s async gap fails every reply forever ("could not send data: 12") — and the DNS socket needs recycling every 120 s for the same bug's slow-burn variant (core 2.x `DNSServer`; rewritten upstream in 3.x).
- `/wifi` must be served with `send_P`, not the chunked sender: the 5 s truncation budget starved power-save phones mid-page (white sheet, then reset).
- The console chrome script must defer; a head script on the truncating sender blocked first paint of an already-delivered page.
- A 1.5 KB script-free `/setup` form is what the portal should land on; the full manager page delivered twice per attempt and still drew white in the captive webview.
- The AP has to answer from `200.200.200.1`: Samsung raises no sign-in sheet for portals on private ranges (tonyp7/esp32-wifi-manager#57 — seven years of the same symptom, confirmed on several devices).

Verified on hardware up to: probes in, 302s out, `/setup` served.

## Why it stopped

The Samsung phone on this bench never rendered the portal, and the feature was judged not worth more evenings. The unverified step is exactly the one that matters — whether a Samsung ever draws the sheet — and a phone is the wrong instrument for it. A next attempt should use a controllable client (a spare ESP32 as STA) to prove each step before touching a phone again.

## Where it stands, and the rules

- The code is on `feat/wifi-setup-portal` (two commits on top of the 2026-08-30 tree). It is kept as a record, not as a queue item.
- **It is not in the tree and belongs to no edition.** The Audio and Performance compositions do not carry it; `features/` has no directory for it.
- **Do not merge it as it is.** It predates the feature seam and edits the core directly — `patternflow.ino`, `core_wifi.h`, `core_wifi_http.h`, plus a new `src/core_wifi_portal.h`. A revival would have to be a `features/wifi_portal/` directory answering the hooks in `pf_feature.h`, with the AP bring-up and the DNS server behind the feature and the core untouched (`docs/EDITIONS.md`). The bench findings above are the part worth keeping; the wiring is not.
- Phones that cannot resolve `.local` are handled another way today: the panel's console links carry `?device=<ip>` to the site (`src/core_names.h`), and NetBIOS answers to `patternflow` on Windows.
