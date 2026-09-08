// Bounded single-producer/single-consumer handoff. No allocation or waiting.
// One owner parses the transport; the render task alone applies device input.
// License: MIT
#pragma once
#include <atomic>
#include <cstdint>
#include <cstddef>

namespace PatternflowMidiTransport {
struct Event {
  uint32_t receivedUs;
  uint8_t status, data1, data2;
};

template<size_t Capacity> class Queue {
  static_assert(Capacity > 0 && Capacity < 0x80000000u, "bounded queue required");
  static_assert((Capacity & (Capacity - 1)) == 0, "power of two preserves indexing across counter wrap");
  Event* slots = nullptr;
  std::atomic<uint32_t> head{0}, tail{0};
public:
  explicit Queue(Event* storage = nullptr) : slots(storage) {}
  // Configure only before either owner starts. Payload storage may live in
  // PSRAM; synchronization words remain in the internal-RAM queue object.
  void setStorage(Event* storage) { slots = storage; }
  bool push(const Event& event) {
    if (!slots) return false;
    const uint32_t h = head.load(std::memory_order_relaxed);
    if (h - tail.load(std::memory_order_acquire) >= Capacity) return false;
    slots[h % Capacity] = event;
    head.store(h + 1, std::memory_order_release);
    return true;
  }
  bool pop(Event& event) {
    if (!slots) return false;
    const uint32_t t = tail.load(std::memory_order_relaxed);
    if (t == head.load(std::memory_order_acquire)) return false;
    event = slots[t % Capacity];
    tail.store(t + 1, std::memory_order_release);
    return true;
  }
};

inline Queue<128> incoming;
inline Queue<64> outgoing;
inline std::atomic<uint32_t> rxDropped{0}, txDropped{0}, packetGaps{0};
inline std::atomic<uint32_t> parseErrors{0}, bufferOverflows{0};
inline std::atomic<uint32_t> pollMaxGapUs{0}, pollMaxUs{0}, queueMaxAgeUs{0};
inline std::atomic<uint32_t> stackMin{0};
inline std::atomic<uint32_t> absReceived[4]{}, relReceived[4]{};

// Each maximum has one writer, status readers only load it.
inline void noteMax(std::atomic<uint32_t>& value, uint32_t sample) {
  if (sample > value.load(std::memory_order_relaxed))
    value.store(sample, std::memory_order_relaxed);
}
}  // namespace PatternflowMidiTransport
