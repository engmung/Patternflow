// Deterministic scheduling at each mailbox boundary. No mock cache logic.
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#ifdef _MSC_VER
// GCC builtins on the board; equivalent (stronger) atomics for MSVC fixtures.
#define __ATOMIC_ACQUIRE 0
#define __ATOMIC_RELEASE 0
#define __ATOMIC_ACQ_REL 0
template<class T> T __atomic_load_n(T* p, int) { return std::atomic_ref<T>(*p).load(); }
template<class T, class V> void __atomic_store_n(T* p, V v, int) {
  std::atomic_ref<T>(*p).store(static_cast<T>(v));
}
template<class T, class V> bool __atomic_compare_exchange_n(T* p, T* old, V v, bool, int, int) {
  return std::atomic_ref<T>(*p).compare_exchange_strong(*old, static_cast<T>(v));
}
#endif

static bool outOfMemory = false;
constexpr unsigned MALLOC_CAP_SPIRAM = 1, MALLOC_CAP_8BIT = 2;
static void* heap_caps_malloc(size_t n, unsigned caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return outOfMemory ? nullptr : malloc(n);
}
static void* heap_caps_calloc(size_t n, size_t s, unsigned caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return outOfMemory ? nullptr : calloc(n, s);
}
static uint32_t micros() { static uint32_t now = 0; return ++now; }
namespace PFCanvas { constexpr int W = 128, H = 64; uint8_t buffer[W * H * 3]; }
namespace PFLoopSync { template<class F> void run(F&& f) { f(); } }

constexpr bool FILE_READ = false, FILE_WRITE = true;
static unsigned fileOpens = 0;
static bool failWrites = false;
struct File {
  std::vector<uint8_t>* data = nullptr;
  size_t offset = 0;
  explicit operator bool() const { return data != nullptr; }
  size_t read(uint8_t* dst, size_t n) {
    n = (n < data->size() - offset) ? n : data->size() - offset;
    memcpy(dst, data->data() + offset, n); offset += n; return n;
  }
  size_t write(const uint8_t* src, size_t n) {
    if (failWrites) return 0;
    data->insert(data->end(), src, src + n); return n;
  }
  void close() {}
};
struct Volume {
  std::map<std::string, std::vector<uint8_t>> files;
  bool exists(const char* path) { return files.count(path) != 0; }
  File open(const char* path, bool write) {
    ++fileOpens;
    if (write) { files[path].clear(); return {&files[path]}; }
    return exists(path) ? File{&files[path]} : File{};
  }
  void remove(const char* path) { files.erase(path); }
} FFat;

#include "core_thumbs.h"
using namespace PFThumbs;

static void colour(uint8_t r, uint8_t g, uint8_t b) {
  for (size_t i = 0; i < PIXELS; ++i) {
    PFCanvas::buffer[i * 3] = r;
    PFCanvas::buffer[i * 3 + 1] = g;
    PFCanvas::buffer[i * 3 + 2] = b;
  }
}
static void fixture(const char* slug, uint16_t pixel) {
  char path[64]; pathFor(slug, path, sizeof(path));
  auto& bytes = FFat.files[path];
  bytes = {'P','F','T','1',uint8_t(W),uint8_t(W >> 8),uint8_t(H),uint8_t(H >> 8)};
  for (size_t i = 0; i < PIXELS; ++i) {
    bytes.push_back(uint8_t(pixel)); bytes.push_back(uint8_t(pixel >> 8));
  }
}
static void finish() { serviceDisk(); collectIO(); assert(ioState == IO_IDLE); }
int main() {
  outOfMemory = true;
  assert(!capture("oom", true)); assert(slots == nullptr);
  outOfMemory = false;

  // get/capture/service never touch the volume; completed reads appear only
  // when the loop collects them at a frame boundary.
  fixture("disk", 0x1234);
  assert(get("disk") == nullptr); assert(fileOpens == 0);
  serviceDisk(); assert(find("disk")->px == nullptr);
  collectIO(); assert(get("disk")[PIXELS - 1] == 0x1234);
  assert(reads == 1);

  // Capturing after a read starts wins over the stale disk image.
  fixture("race", 0x1111);
  assert(get("race") == nullptr);
  colour(255, 0, 0); assert(capture("race", false));
  finish(); assert(get("race")[0] == 0xf800);

  // A queued write is an immutable snapshot, even if the cache changes.
  unsigned opened = fileOpens;
  colour(255, 0, 0); assert(capture("save", true)); service();
  assert(fileOpens == opened);
  colour(0, 255, 0); assert(capture("save", true));
  finish(); assert(get("save")[0] == 0x07e0);
  const auto& saved = FFat.files.at("/patterns/save.thumb");
  assert(saved[8] == 0 && saved[9] == 0xf8);
  assert(writes == 1); service(); assert(ioState == IO_IDLE);

  // A delete before the worker runs must not recreate the deleted file.
  colour(0, 0, 255); capture("deleted", true); service();
  forget("deleted"); finish();
  assert(!FFat.exists("/patterns/deleted.thumb"));

  // A deleted/reinstalled slug rejects an old read even when it completed.
  fixture("replace", 0xffff); get("replace"); serviceDisk();
  forget("replace"); colour(0, 255, 0); capture("replace", false);
  collectIO(); assert(get("replace")[0] == 0x07e0);

  // Formatting can recycle the same slot address for a different slug.
  forgetAll();
  fixture("format", 0xffff); get("format");
  FFat.files.clear(); forgetAll();
  colour(0, 0, 255); capture("new", false); finish();
  assert(get("new")[0] == 0x001f); assert(slotCount == 1);

  fixture("truncated", 0xffff); FFat.files["/patterns/truncated.thumb"].resize(9);
  get("truncated"); finish(); opened = fileOpens;
  assert(get("truncated") == nullptr); assert(ioState == IO_IDLE);
  assert(fileOpens == opened);

  // Optional PSRAM exhaustion must not consume internal RAM or block retry.
  slotFor("alloc"); outOfMemory = true;
  assert(!capture("alloc", true)); assert(!get("alloc"));
  assert(ioState == IO_IDLE); outOfMemory = false;
  assert(capture("alloc", true)); failWrites = true; service(); finish();
  assert(!find("alloc")->savedThisBoot); service(); assert(ioState == IO_IDLE);
  failWrites = false; capture("alloc", true); service(); finish();
  assert(find("alloc")->savedThisBoot);

  forgetAll(); free(slots); slots = nullptr;
  puts("thumbnail mailbox: read/capture, immutable save, deletion, format, short I/O, PSRAM OOM passed");
}
