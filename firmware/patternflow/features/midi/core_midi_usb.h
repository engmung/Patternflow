// ═══════════════════════════════════════════════════════════
// PatternFlow - MIDI over the DevKit's USB port (a USB-MIDI class device)
//
// The wired transport, beside core_midi_rtp.h. The panel plugs into a
// computer with the same cable it is flashed over and shows up as a
// class-compliant MIDI device: no driver, no session, no Wi-Fi in the path -
// the DAW sees "Patternflow" the way it sees a keyboard. The map is
// core_midi.h's, shared with every transport: CC 20-23 hold the knobs,
// CC 24-27 nudge them, notes 60-63 press the buttons, a program change picks
// a pattern, and the encoders go out as CC 24-27.
//
// It compiles in only when the build's USB port is the OTG stack
// (ARDUINO_USB_MODE=0 - the firmware_midi env, see platformio.ini). In every
// other build this file is a handful of empty functions and the feature is
// the RTP transport alone. That is the one build-time switch in this feature,
// and it is the Arduino core's, not a feature flag: the chip has ONE USB PHY,
// and which of its two owners gets it - the fixed USB-Serial/JTAG every other
// build uses for flashing, Improv and the log, or the USB-OTG controller that
// can be any device class - is decided before setup() runs. With OTG the
// core presents CDC (still `Serial`, so Improv and the log survive) and this
// adds the MIDI interface beside it. The ROM's download mode does not change,
// so the browser flasher flashes such an image like any other.
//
// Built on the TinyUSB device stack the Arduino core already carries for the
// S3, whose MIDI class the SDK compiles in.
//
// Why there is no worker task and no queue, unlike core_midi_rtp.h: USB has
// flow control. When the class FIFO is full the device NAKs the host's next
// packet and the host waits; nothing is dropped, only delayed. So the frame
// task reads the FIFO itself, one budgeted batch per frame, and the worst
// case on a torrent of controllers is a frame of latency. RTP had to be
// serviced between frames because UDP drops whatever nobody reads in time.
//
// Threading: everything here runs on the frame task, which is where
// core_midi.h's handlers must be called from. TinyUSB's own task services the
// bus; reading and writing the class FIFOs from another task is what USBCDC
// does for Serial, and is the supported pattern.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include "core_midi.h"

#if !ARDUINO_USB_MODE && CONFIG_TINYUSB_ENABLED && CONFIG_TINYUSB_MIDI_ENABLED
#define PF_MIDI_USB 1
#else
#define PF_MIDI_USB 0
#endif

// The MIDI interface's name: what macOS and Linux show as the port. Windows
// names the port after the USB product string instead, which the
// firmware_midi env sets to the same word.
#ifndef PF_MIDI_USB_NAME
#define PF_MIDI_USB_NAME "Patternflow"
#endif

// Packets read per frame. The class FIFO holds 16; a torrent beyond that is
// not lost - USB makes the host wait until the next frame reads more - so
// this bounds the frame's work, not the throughput.
#ifndef PF_MIDI_USB_RX_BUDGET
#define PF_MIDI_USB_RX_BUDGET 32
#endif

#if PF_MIDI_USB
#include "esp32-hal-tinyusb.h"
#include "tusb.h"
#endif

namespace PatternflowMidiUsb {

constexpr bool available = PF_MIDI_USB;

#if PF_MIDI_USB

// ── The interface, declared before the stack starts ──────────────────────
// The core starts TinyUSB from app_main(), before setup() runs, so the MIDI
// interface is registered from a static initializer - the same way the core's
// own USBCDC registers Serial. tinyusb_init() then calls loadDescriptor()
// once while it assembles the configuration descriptor.
inline bool descriptorLoaded = false;

inline uint16_t loadDescriptor(uint8_t* dst, uint8_t* itf) {
  if (descriptorLoaded) return 0;
  descriptorLoaded = true;
  const uint8_t str = tinyusb_add_string_descriptor(PF_MIDI_USB_NAME);
  const uint8_t epIn = tinyusb_get_free_in_endpoint();
  const uint8_t epOut = tinyusb_get_free_out_endpoint();
  if (!epIn || !epOut) return 0;
  // Full-speed bulk endpoints are 64 bytes; the class FIFO behind them holds
  // 16 packets each way (CONFIG_TINYUSB_MIDI_RX/TX_BUFSIZE).
  const uint8_t desc[TUD_MIDI_DESC_LEN] = {
    TUD_MIDI_DESCRIPTOR(*itf, str, epOut, (uint8_t)(0x80 | epIn), 64)
  };
  *itf += 2;   // audio control + MIDI streaming
  memcpy(dst, desc, TUD_MIDI_DESC_LEN);
  return TUD_MIDI_DESC_LEN;
}

struct Registrar {
  Registrar() { tinyusb_enable_interface(USB_INTERFACE_MIDI, TUD_MIDI_DESC_LEN, loadDescriptor); }
};
inline Registrar registrar;

// ── Counters, for /api/status ────────────────────────────────────────────
inline uint32_t rxCount = 0;       // packets read that carried a channel message
inline uint32_t rxUnhandled = 0;   // sysex, realtime, pitch bend: read and ignored
inline uint32_t txCount = 0;
inline uint32_t txDropped = 0;     // FIFO full: nobody reading, or 16 in one frame
inline bool hostSeen = false;

// Configured by a host, and that host is awake. A cable pulled out leaves the
// device suspended rather than unmounted, and the FIFO would fill for nobody.
inline bool hostReady() { return tud_midi_mounted() && !tud_suspended(); }

inline void apply(uint8_t status, uint8_t d1, uint8_t d2) {
  const uint8_t ch = (status & 0x0F) + 1;
  switch (status & 0xF0) {
    case 0xB0: PatternflowMidi::onControlChange(ch, d1, d2); break;
    case 0xC0: PatternflowMidi::onProgramChange(ch, d1); break;
    case 0x90: PatternflowMidi::onNoteOn(ch, d1, d2); break;
    case 0x80: PatternflowMidi::onNoteOff(ch, d1, d2); break;
    default: break;
  }
}

// One batch per frame, on the frame task. USB-MIDI packs every message into
// four bytes: a header whose low nibble (the Code Index Number) says what
// follows, then up to three MIDI bytes. For channel voice messages the CIN
// equals the status high nibble, and those are all the map listens to.
inline void poll() {
  const bool ready = hostReady();
  if (ready != hostSeen) {
    hostSeen = ready;
    // The host that pressed a key is gone; its note-off is never coming.
    // Same reasoning as the RTP transport's disconnect handler.
    if (!ready) PatternflowMidi::clearNotes();
    Serial.printf("[MIDI] usb host %s\n", ready ? "connected" : "gone");
  }
  if (!ready) return;
  uint8_t packet[4];
  for (int i = 0; i < PF_MIDI_USB_RX_BUDGET && tud_midi_packet_read(packet); ++i) {
    switch (packet[0] & 0x0F) {
      case 0x8: case 0x9: case 0xB: case 0xC:
        rxCount++;
        apply(packet[1], packet[2], packet[3]);
        break;
      default:
        rxUnhandled++;
        break;
    }
  }
}

// The sink core_midi.h calls with what the encoders and buttons did. Cable 0;
// program change and channel pressure are two-byte messages, so their fourth
// byte is zero whatever the map handed over.
inline void sink(uint8_t status, uint8_t d1, uint8_t d2) {
  if (!hostReady()) return;
  const uint8_t cin = status >> 4;
  const bool twoBytes = (cin == 0xC || cin == 0xD);
  const uint8_t packet[4] = { cin, status, d1, twoBytes ? (uint8_t)0 : d2 };
  if (tud_midi_packet_write(packet)) txCount++;
  else txDropped++;
}

// From the feature's setup(): a cable needs no network, so this does not
// wait for onNetwork the way the RTP transport does.
inline void begin() {
  PatternflowMidi::registerSink(sink);
  // "[MIDI] usb device" is this transport's marker for build.sh's scan: the
  // MIDI edition must carry it and no other image may.
  Serial.printf("[MIDI] usb device \"%s\" ready - plug the DevKit's USB port into the computer\n",
                PF_MIDI_USB_NAME);
}

// A sibling of the `midi` block, so a page or a site can tell a wired panel
// from a wireless one by its presence.
inline void appendStatus(String& json) {
  json += ",\"midiUsb\":{\"mounted\":";
  json += hostReady() ? "true" : "false";
  json += ",\"rx\":";
  json += rxCount;
  json += ",\"rxUnhandled\":";
  json += rxUnhandled;
  json += ",\"tx\":";
  json += txCount;
  json += ",\"txDropped\":";
  json += txDropped;
  json += "}";
}

#else   // the USB port is the serial console in this build: nothing here

inline void begin() {}
inline void poll() {}
inline void appendStatus(String&) {}

#endif  // PF_MIDI_USB

}  // namespace PatternflowMidiUsb
