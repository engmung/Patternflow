// ═══════════════════════════════════════════════════════════
// PatternFlow - MIDI over the network (RTP-MIDI / AppleMIDI, RFC 6295)
//
// The transport that costs the device nothing it does not already have: two
// UDP sockets on the Wi-Fi it is on anyway. macOS and iOS speak it natively
// (Audio MIDI Setup → Network); Windows through Tobias Erichsen's free
// rtpMIDI driver; Linux through rtpmidid. Once a session is up the panel is
// an ordinary MIDI port in any DAW.
//
// The panel is the session LISTENER: it advertises itself over mDNS as
// _apple-midi._udp so it appears in the host's list by name, and the host
// connects. Port 5004 (control) and 5005 (data), the convention.
//
// Built on lathoub's AppleMIDI library over the FortySevenEffects MIDI
// parser. Two participants at most; MIDI Thru is off - the device must not
// echo a host's automation back at it.
//
// License: MIT
// ═══════════════════════════════════════════════════════════
#pragma once

#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <WiFiUdp.h>

// Initiator as well as listener: a panel that remembers its host can invite
// it on every boot, so a session survives the panel rebooting without a
// person reopening rtpMIDI (Windows) or Audio MIDI Setup (macOS). The host
// is a setting (POST /api/midi?host=<ip>), because the library keeps a
// listener's address to itself and there is no other way to learn it.
#define APPLEMIDI_INITIATOR
#include <AppleMIDI.h>

#include <Preferences.h>

#include "core_midi.h"

#ifndef PF_MIDI_RTP_PORT
#define PF_MIDI_RTP_PORT 5004
#endif
#ifndef PF_MIDI_SESSION_NAME
#define PF_MIDI_SESSION_NAME "Patternflow"
#endif

namespace PatternflowMidiRtp {

using Session = APPLEMIDI_NAMESPACE::AppleMIDISession<WiFiUDP>;
using Interface = MIDI_NAMESPACE::MidiInterface<Session, APPLEMIDI_NAMESPACE::AppleMIDISettings>;

// What APPLEMIDI_CREATE_INSTANCE expands to, spelled out so the objects can
// be `inline` like everything else in this tree.
inline Session   session(PF_MIDI_SESSION_NAME, PF_MIDI_RTP_PORT);
inline Interface midi(session);

inline bool started = false;
inline int  peers = 0;
inline String host;                 // "" = wait to be invited
inline uint32_t lastInviteMs = 0;
constexpr uint32_t REINVITE_MS = 20000;   // the library gives up after ~13 s of silence

inline void loadHost() {
  Preferences p;
  if (p.begin("pf_midi", true)) {
    host = p.getString("host", "");
    p.end();
  }
}

inline bool setHost(const String& h) {
  IPAddress ip;
  if (h.length() && !ip.fromString(h)) return false;
  host = h;
  Preferences p;
  if (p.begin("pf_midi", false)) {
    p.putString("host", host);
    p.end();
  }
  lastInviteMs = 0;   // invite (or stop inviting) on the next tick
  return true;
}

// Invite the remembered host, and keep inviting while nobody is connected.
inline void inviteIfDue() {
  if (host.length() == 0 || peers > 0) return;
  uint32_t now = millis();
  if (lastInviteMs != 0 && now - lastInviteMs < REINVITE_MS) return;
  lastInviteMs = now;
  IPAddress ip;
  if (!ip.fromString(host)) return;
  session.sendInvite(ip, PF_MIDI_RTP_PORT);
}
inline char peerName[APPLEMIDI_NAMESPACE::DefaultSettings::MaxSessionNameLen + 1] = "";

inline void sink(uint8_t status, uint8_t d1, uint8_t d2) {
  if (peers <= 0) return;
  const uint8_t ch = (status & 0x0F) + 1;
  switch (status & 0xF0) {
    case 0xB0: midi.sendControlChange(d1, d2, ch); break;
    case 0x90: midi.sendNoteOn(d1, d2, ch); break;
    case 0x80: midi.sendNoteOff(d1, d2, ch); break;
    case 0xC0: midi.sendProgramChange(d1, ch); break;
    default: break;
  }
}

inline void begin() {
  if (started) return;
  started = true;

  session.setHandleConnected([](const APPLEMIDI_NAMESPACE::ssrc_t&, const char* name) {
    peers++;
    strncpy(peerName, name ? name : "", sizeof(peerName) - 1);
    peerName[sizeof(peerName) - 1] = 0;
    Serial.printf("[MIDI] rtp session joined by \"%s\" (%d)\n", peerName, peers);
  });
  session.setHandleDisconnected([](const APPLEMIDI_NAMESPACE::ssrc_t&) {
    if (peers > 0) peers--;
    if (peers == 0) peerName[0] = 0;
    Serial.printf("[MIDI] rtp session left (%d)\n", peers);
  });

  midi.setHandleControlChange([](byte ch, byte cc, byte v) { PatternflowMidi::onControlChange(ch, cc, v); });
  midi.setHandleProgramChange([](byte ch, byte p) { PatternflowMidi::onProgramChange(ch, p); });
  midi.setHandleNoteOn([](byte ch, byte n, byte v) { PatternflowMidi::onNoteOn(ch, n, v); });
  midi.setHandleNoteOff([](byte ch, byte n, byte v) { PatternflowMidi::onNoteOff(ch, n, v); });

  midi.begin(MIDI_CHANNEL_OMNI);   // the engine filters the channel
  midi.turnThruOff();
  PatternflowMidi::registerSink(sink);

  // Bonjour: the host's Network MIDI panel lists us by name. MDNS itself is
  // started by the core (OTA's hostname); this only adds a service record.
  MDNS.addService("apple-midi", "udp", PF_MIDI_RTP_PORT);
  loadHost();

  Serial.printf("[MIDI] rtp listening on %s:%u as \"%s\"\n",
                WiFi.localIP().toString().c_str(), PF_MIDI_RTP_PORT, PF_MIDI_SESSION_NAME);
}

// Drain what arrived. A DAW ramp can be hundreds of messages a second; a
// bounded loop keeps the socket queue from growing behind one-per-frame.
#ifndef PF_MIDI_RX_BUDGET
#define PF_MIDI_RX_BUDGET 16
#endif
inline void handle() {
  if (!started) return;
  for (int i = 0; i < PF_MIDI_RX_BUDGET; i++) {
    if (!midi.read()) break;
  }
  inviteIfDue();
}

}  // namespace PatternflowMidiRtp
