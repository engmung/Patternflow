#pragma once
#include <Arduino.h>
#include <string.h>
namespace ResearchProbe {
enum Id { Loop, Housekeeping, Sync, Adopt, Thumbs, Catalog, FeatureLoop, Input,
          Persist, Update, Draw, Preview, Present, Http, Disk, Load, Setup,
          Unload, Feature0, Count = Feature0 + 9 };
inline const char* names[Count] = {"loop", "housekeeping", "loopSync", "adopt", "thumbService",
  "catalog", "featureLoop", "input", "persist", "update", "draw", "preview", "present",
  "http", "disk", "load", "setup", "unload", "hook0", "hook1", "hook2", "hook3",
  "hook4", "hook5", "hook6", "hook7", "hook8"};
constexpr int BINS = 16;
struct Stat { uint64_t total; uint32_t n, max, bins[BINS]; };
struct Event { uint32_t at, us; uint8_t id; };
inline Stat stats[Count]{};
inline Event events[32]{};
inline uint32_t eventCount = 0, generation = 1;
inline portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
inline bool enabled = true;
inline volatile bool holdPreview = false;
inline uint32_t begun = 0;
struct Scope {
  unsigned id; uint32_t at, epoch;
  explicit Scope(unsigned which): id(which), at(micros()) {
    portENTER_CRITICAL(&mux); epoch = enabled ? generation : 0; portEXIT_CRITICAL(&mux);
  }
  ~Scope() {
    if (!epoch || id >= Count) return;
    uint32_t us = micros() - at;
    unsigned bin = 0;
    while (bin < BINS-1 && us > (125u << bin)) ++bin;
    portENTER_CRITICAL(&mux);
    if (generation == epoch && enabled) {
      Stat& s = stats[id]; ++s.n; s.total += us; ++s.bins[bin];
      if (us > s.max) s.max = us;
      if (us >= 40000) events[eventCount++ % 32] = {at, us, (uint8_t)id};
    }
    portEXIT_CRITICAL(&mux);
  }
};
inline void reset() {
  portENTER_CRITICAL(&mux);
  ++generation; memset(stats, 0, sizeof(stats)); memset(events, 0, sizeof(events));
  eventCount = 0; begun = millis();
  portEXIT_CRITICAL(&mux);
}
inline uint32_t percentile(const Stat& s, unsigned p) {
  if (!s.n) return 0;
  uint32_t seen = 0, target = (uint32_t)(((uint64_t)s.n*p + 99) / 100);
  for (int i=0;i<BINS;++i) { seen += s.bins[i]; if (seen >= target) return i==BINS-1 ? s.max : 125u << i; }
  return s.max;
}
inline String json() {
  String out; out.reserve(5500);
  out = "{\"durationMs\":"; out += millis()-begun;
  out += ",\"probeBytes\":"; out += sizeof(stats)+sizeof(events);
  out += ",\"holdPreview\":"; out += holdPreview ? "true" : "false";
  out += ",\"stages\":[";
  for (unsigned i=0;i<Count;++i) {
    Stat s; portENTER_CRITICAL(&mux); s = stats[i]; portEXIT_CRITICAL(&mux);
    if(i) out += ',';
    out += "{\"name\":\""; out += names[i]; out += "\",\"n\":"; out += s.n;
    out += ",\"meanUs\":"; out += s.n ? (uint32_t)(s.total/s.n) : 0;
    out += ",\"maxUs\":"; out += s.max;
    out += ",\"p50UpperUs\":"; out += percentile(s,50);
    out += ",\"p95UpperUs\":"; out += percentile(s,95);
    out += ",\"p99UpperUs\":"; out += percentile(s,99); out += '}';
  }
  out += "],\"events\":[";
  Event copy[32]; uint32_t count;
  portENTER_CRITICAL(&mux); memcpy(copy,events,sizeof(copy)); count=eventCount; portEXIT_CRITICAL(&mux);
  uint32_t start=count>32?count-32:0;
  for(uint32_t i=start;i<count;++i) {
    auto e=copy[i%32]; if(i!=start) out+=',';
    out+="{\"name\":\"";out+=names[e.id];out+="\",\"atUs\":";out+=e.at;
    out+=",\"us\":";out+=e.us;out+='}';
  }
  out += "]}"; return out;
}
}
