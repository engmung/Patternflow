#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <thread>
#include <vector>
#ifdef _MSC_VER
#define __ATOMIC_RELAXED 0
template<class T, class V> T __atomic_fetch_add(T* p, V v, int) { return std::atomic_ref<T>(*p).fetch_add(static_cast<T>(v)); }
template<class T, class V> T __atomic_exchange_n(T* p, V v, int) { return std::atomic_ref<T>(*p).exchange(static_cast<T>(v)); }
template<class T, class V> void __atomic_store_n(T* p, V v, int) { std::atomic_ref<T>(*p).store(static_cast<T>(v)); }
#endif
static uint32_t nowMs = 1000;
static uint32_t millis() { return nowMs; }
struct Preferences {
  bool begin(const char*, bool) { return false; }
  bool getBool(const char*, bool value) { return value; }
  int getInt(const char*, int value) { return value; }
  void putBool(const char*, bool) {}
  void putInt(const char*, int) {}
  void end() {}
};
struct InputFrame {
  uint32_t now = nowMs;
  long knobs[4]{};
  int knobDeltas[4]{};
  bool btnPressed[4]{}, btnHeld[4]{}, knobAudioActive[4]{}, paramAbsoluteActive[4]{};
  float knobAudioValue[4]{};
  uint16_t paramAbsolute[4]{};
};
#include "features/midi/core_midi.h"
using namespace PatternflowMidiTransport;
static std::vector<Event> sent;
static void sink(uint8_t s, uint8_t d1, uint8_t d2) { sent.push_back({0,s,d1,d2}); }

int main() {
  Queue<4> unavailable;
  Event event{};
  assert(!unavailable.push({1,0,0,0}) && !unavailable.pop(event));
  Event smallStorage[4];
  Queue<4> small(smallStorage);
  assert(!small.pop(event));
  for (uint32_t i=0; i<4; ++i) assert(small.push({i,0xb0,20,(uint8_t)i}));
  assert(!small.push({99,0,0,0})); // overflow must not replace an older note/event
  for (uint32_t i=0; i<4; ++i) { assert(small.pop(event)); assert(event.receivedUs==i); }
  assert(!small.pop(event));
  Event storage[128];
  Queue<128> concurrent(storage);
  constexpr uint32_t count=200000;
  std::thread producer([&] {
    for(uint32_t i=0;i<count;++i)
      while(!concurrent.push({i,0xb0,(uint8_t)(20+i%4),(uint8_t)(i%128)})) std::this_thread::yield();
  });
  for(uint32_t i=0;i<count;++i) {
    while(!concurrent.pop(event)) std::this_thread::yield();
    assert(event.receivedUs==i && event.status==0xb0 && event.data1==20+i%4 && event.data2==i%128);
  }
  producer.join();

  using namespace PatternflowMidi;
  registerSink(sink);
  lastPatternIdx=0;
  // Absolute CC -> compatibility clicks -> final frame: no reflected CC.
  for(int i=0;i<4;++i) onControlChange(1,(uint8_t)(20+i),0);
  for(int i=0;i<4;++i) onControlChange(1,(uint8_t)(20+i),127);
  InputFrame frame;
  fillInput(frame); PatternflowBus::fillAbsolute(frame);
  for(int i=0;i<4;++i) assert(frame.paramAbsolute[i]==1000 && frame.knobDeltas[i]!=0);
  observeFrame(frame,0);
  assert(sent.empty());
  // Relative messages cannot bypass an absolute hold or reflect as negatives.
  onControlChange(1,24,67);
  frame=InputFrame{}; fillInput(frame); PatternflowBus::fillAbsolute(frame); observeFrame(frame,0);
  assert(sent.empty());
  PatternflowBus::clearAbsoluteAll();
  onControlChange(1,26,67);
  frame=InputFrame{}; fillInput(frame); PatternflowBus::fillAbsolute(frame);
  assert(frame.knobDeltas[2]==3); observeFrame(frame,0); assert(sent.empty());
  // Physical movement still sends, after the remote contribution is consumed.
  frame=InputFrame{}; frame.knobDeltas[2]=2; observeFrame(frame,0);
  assert(sent.size()==1 && sent[0].data1==26 && sent[0].data2==66);
  sent.clear();
  // Input channel filtering and disabled input keep their original contract.
  const uint32_t before=rxCount;
  onControlChange(2,20,127); assert(rxCount==before);
  runtimeEnabled=false; onControlChange(1,20,127); assert(rxCount==before);
  runtimeEnabled=true;
  onNoteOn(1,60,127); frame=InputFrame{}; fillInput(frame); observeFrame(frame,0);
  assert(frame.btnPressed[0] && frame.btnHeld[0] && sent.empty());
  onNoteOff(1,60,0); frame=InputFrame{}; fillInput(frame); observeFrame(frame,0);
  assert(!frame.btnHeld[0] && sent.empty());
  puts("PASS: 200000 ordered cross-thread events, bounded overflow, absolute/relative/note no-echo, physical output");
}
