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
#include <esp_heap_caps.h>

// Initiator as well as listener: a panel that remembers its host can invite
// it on every boot, so a session survives the panel rebooting without a
// person reopening rtpMIDI (Windows) or Audio MIDI Setup (macOS). The host
// is a setting (POST /api/midi?host=<ip>), because the library keeps a
// listener's address to itself and there is no other way to learn it.
#define APPLEMIDI_INITIATOR
#define USE_EXT_CALLBACKS
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

inline std::atomic<bool> started{false};
inline int  peers = 0;
inline portMUX_TYPE peerMux = portMUX_INITIALIZER_UNLOCKED;
inline String host;                 // "" = wait to be invited
inline std::atomic<uint32_t> hostAddress{0};
inline std::atomic<uint32_t> lastInviteMs{0};
inline TaskHandle_t workerTask = nullptr;
inline bool queueReady = false;
constexpr uint32_t WORKER_STACK_BYTES = 4096;
inline void worker(void*);
inline void send(uint8_t status, uint8_t d1, uint8_t d2);
inline uint32_t lastAdvertiseMs = 0;
inline bool advertised = false;
constexpr uint32_t REINVITE_MS = 20000;   // the library gives up after ~13 s of silence

inline void loadHost() {
  Preferences p;
  if (p.begin("pf_midi", true)) {
    host = p.getString("host", "");
    IPAddress ip;
    if (ip.fromString(host)) hostAddress.store((uint32_t)ip);
    p.end();
  }
}

inline bool setHost(const String& h) {
  IPAddress ip;
  if (h.length() && !ip.fromString(h)) return false;
  host = h;
  hostAddress.store(h.length() ? (uint32_t)ip : 0);
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
  const uint32_t address = hostAddress.load();
  if (address == 0 || __atomic_load_n(&peers, __ATOMIC_RELAXED) > 0) return;
  uint32_t now = millis();
  const uint32_t last = lastInviteMs.load();
  if (last != 0 && now - last < REINVITE_MS) return;
  lastInviteMs = now;
  session.sendInvite(IPAddress(address), PF_MIDI_RTP_PORT);
}
inline char peerName[APPLEMIDI_NAMESPACE::DefaultSettings::MaxSessionNameLen + 1] = "";

inline void prepare() {
  if (queueReady) return;
  using namespace PatternflowMidiTransport;
  const uint32_t caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  auto* rx = static_cast<Event*>(heap_caps_malloc(128 * sizeof(Event), caps));
  auto* tx = static_cast<Event*>(heap_caps_malloc(64 * sizeof(Event), caps));
  if (!rx || !tx) { heap_caps_free(rx); heap_caps_free(tx); return; }
  incoming.setStorage(rx);
  outgoing.setStorage(tx);
  queueReady = true; // lifetime storage, never resized while owners run
}

inline void sink(uint8_t status, uint8_t d1, uint8_t d2) {
  if (__atomic_load_n(&peers, __ATOMIC_RELAXED) <= 0) return;
  if (!queueReady) { send(status, d1, d2); return; }
  if (!PatternflowMidiTransport::outgoing.push({0, status, d1, d2}))
    PatternflowMidiTransport::txDropped.fetch_add(1, std::memory_order_relaxed);
}

// Only the transport worker (or its single-task fallback) touches midi.
inline void send(uint8_t status, uint8_t d1, uint8_t d2) {
  const uint8_t ch = (status & 0x0F) + 1;
  switch (status & 0xF0) {
    case 0xB0: midi.sendControlChange(d1, d2, ch); break;
    case 0x90: midi.sendNoteOn(d1, d2, ch); break;
    case 0x80: midi.sendNoteOff(d1, d2, ch); break;
    case 0xC0: midi.sendProgramChange(d1, ch); break;
    default: break;
  }
}

inline void apply(uint8_t status, uint8_t ch, uint8_t d1, uint8_t d2) {
  switch (status & 0xF0) {
    case 0xB0: PatternflowMidi::onControlChange(ch, d1, d2); break;
    case 0xC0: PatternflowMidi::onProgramChange(ch, d1); break;
    case 0x90: PatternflowMidi::onNoteOn(ch, d1, d2); break;
    case 0x80: PatternflowMidi::onNoteOff(ch, d1, d2); break;
  }
}

inline void receive(uint8_t status, uint8_t ch, uint8_t d1, uint8_t d2) {
  // Without queue storage there is no worker; this callback is on the frame.
  if (!queueReady) { apply(status, ch, d1, d2); return; }
  if (!PatternflowMidiTransport::incoming.push({micros(), (uint8_t)(status | (ch - 1)), d1, d2}))
    PatternflowMidiTransport::rxDropped.fetch_add(1, std::memory_order_relaxed);
}

inline void begin() {
  if (started) return;
  prepare();

  session.setHandleConnected([](const APPLEMIDI_NAMESPACE::ssrc_t&, const char* name) {
    portENTER_CRITICAL(&peerMux);
    __atomic_fetch_add(&peers, 1, __ATOMIC_RELAXED);
    strncpy(peerName, name ? name : "", sizeof(peerName) - 1);
    peerName[sizeof(peerName) - 1] = 0;
    portEXIT_CRITICAL(&peerMux);
    Serial.printf("[MIDI] rtp session joined by \"%s\" (%d)\n", peerName, peers);
  });
  session.setHandleDisconnected([](const APPLEMIDI_NAMESPACE::ssrc_t&) {
    portENTER_CRITICAL(&peerMux);
    if (peers > 0) __atomic_fetch_sub(&peers, 1, __ATOMIC_RELAXED);
    if (peers == 0) peerName[0] = 0;
    portEXIT_CRITICAL(&peerMux);
    Serial.printf("[MIDI] rtp session left (%d)\n", peers);
  });

  midi.setHandleControlChange([](byte ch, byte cc, byte v) { receive(0xB0, ch, cc, v); });
  midi.setHandleProgramChange([](byte ch, byte p) { receive(0xC0, ch, p, 0); });
  midi.setHandleNoteOn([](byte ch, byte n, byte v) { receive(0x90, ch, n, v); });
  midi.setHandleNoteOff([](byte ch, byte n, byte v) { receive(0x80, ch, n, v); });
  session.setHandleException([](const APPLEMIDI_NAMESPACE::ssrc_t&, const APPLEMIDI_NAMESPACE::Exception& error, int32_t value) {
    using namespace APPLEMIDI_NAMESPACE;
    using namespace PatternflowMidiTransport;
    if (error == ReceivedPacketsDropped && value > 0) packetGaps.fetch_add((uint32_t)value);
    else if (error == BufferFullException) bufferOverflows.fetch_add(1);
    else if (error == ParseException || error == UnexpectedParseException) parseErrors.fetch_add(1);
  });

  midi.begin(MIDI_CHANNEL_OMNI);   // the engine filters the channel
  midi.turnThruOff();
  PatternflowMidi::registerSink(sink);

  // The service is advertised by handle(), with retries: core mDNS startup
  // can temporarily fail under memory pressure. The feature owns its record.
  loadHost();
  // Give the host's own reconnect a head start before we invite it: rtpMIDI
  // re-joins a remembered panel by itself within seconds of it coming back,
  // and an invitation fired at the same moment produced TWO sessions with
  // the same computer - every note delivered twice.
  lastInviteMs = millis();

  // Socket service must not wait for a heavy pattern's next frame. The
  // queues retain event order; no bus, pattern or InputFrame is touched here.
  if (!queueReady || xTaskCreatePinnedToCore(worker, "pf_midi", WORKER_STACK_BYTES, nullptr, 1, &workerTask, 0) != pdPASS) {
    workerTask = nullptr;
    Serial.println("[MIDI] worker unavailable; using frame polling");
  }

  Serial.printf("[MIDI] rtp listening on %s:%u as \"%s\"\n",
                WiFi.localIP().toString().c_str(), PF_MIDI_RTP_PORT, PF_MIDI_SESSION_NAME);
  // Publish only after the interface and its owner exist. The other core
  // must never enter the fallback while begin() is still configuring midi.
  started.store(true, std::memory_order_release);
}

// Bound each service slice as well as the number of parser calls. False
// can mean a control packet or a partial journal; another slice follows
// in two ticks, rather than after a potentially expensive display frame.
#ifndef PF_MIDI_RX_BUDGET
#define PF_MIDI_RX_BUDGET 64
#endif
inline void pump() {
  using namespace PatternflowMidiTransport;
  static uint32_t previous = 0;
  const uint32_t start = micros();
  if (previous) noteMax(pollMaxGapUs, start - previous);
  previous = start;
  Event event;
  for (unsigned i = 0; i < 32 && outgoing.pop(event); ++i)
    send(event.status, event.data1, event.data2);
  for (int i = 0; i < PF_MIDI_RX_BUDGET; ++i) {
    if (!midi.read()) break;
    if ((uint32_t)(micros() - start) >= 2000) break;
  }
  inviteIfDue();
  noteMax(pollMaxUs, micros() - start);
}

inline void worker(void*) {
  for (;;) {
    pump();
    PatternflowMidiTransport::stackMin.store(uxTaskGetStackHighWaterMark(nullptr));
    vTaskDelay(pdMS_TO_TICKS(2) > 0 ? pdMS_TO_TICKS(2) : 1);
  }
}

inline void handle() {
  if (!started) return;
  const uint32_t now = millis();
  if (!advertised && WiFi.status() == WL_CONNECTED &&
      (uint32_t)(now - lastAdvertiseMs) >= 1000) {
    lastAdvertiseMs = now;
    // Use the responder's current host (it may have renamed after a name
    // conflict). The registration API fails harmlessly until mDNS is up.
    advertised = mdns_service_exists("_apple-midi", "_udp", nullptr) ||
        mdns_service_add(nullptr, "_apple-midi", "_udp", PF_MIDI_RTP_PORT, nullptr, 0) == ESP_OK;
  }
  if (!workerTask) pump();
  PatternflowMidiTransport::Event event;
  // A finite batch also prevents an active producer extending this frame.
  for (unsigned i = 0; i < 128 && PatternflowMidiTransport::incoming.pop(event); ++i) {
    PatternflowMidiTransport::noteMax(PatternflowMidiTransport::queueMaxAgeUs, micros() - event.receivedUs);
    const uint8_t ch = (event.status & 15) + 1;
    apply(event.status, ch, event.data1, event.data2);
  }
}

inline void appendDiagnostics(String& json) {
  using namespace PatternflowMidiTransport;
  json += ",\"rxDetail\":{\"worker\":";
  json += started.load(std::memory_order_acquire) && workerTask ? "true" : "false";
  json += ",\"abs\":[";
  for (int i = 0; i < 4; ++i) { if (i) json += ','; json += absReceived[i].load(); }
  json += "],\"rel\":[";
  for (int i = 0; i < 4; ++i) { if (i) json += ','; json += relReceived[i].load(); }
  json += "],\"queueDropped\":"; json += rxDropped.load();
  json += ",\"txQueueDropped\":"; json += txDropped.load();
  json += ",\"packetGaps\":"; json += packetGaps.load();
  json += ",\"parseErrors\":"; json += parseErrors.load();
  json += ",\"bufferOverflows\":"; json += bufferOverflows.load();
  json += ",\"pollMaxGapUs\":"; json += pollMaxGapUs.load();
  json += ",\"pollMaxUs\":"; json += pollMaxUs.load();
  json += ",\"queueMaxAgeUs\":"; json += queueMaxAgeUs.load();
  json += ",\"stackMin\":"; json += stackMin.load();
  json += "}";
}

inline void copyPeer(char* name, size_t size, int& count) {
  portENTER_CRITICAL(&peerMux);
  count = peers;
  strncpy(name, peerName, size - 1);
  name[size - 1] = 0;
  portEXIT_CRITICAL(&peerMux);
}

}  // namespace PatternflowMidiRtp
