// Production allocation and lifecycle code; hardware replaced at its boundary.
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <utility>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <chrono>
#ifdef _MSC_VER
#define __ATOMIC_ACQUIRE 0
#define __ATOMIC_RELEASE 0
#define __ATOMIC_ACQ_REL 0
template<class T> T __atomic_load_n(T* p, int) { return std::atomic_ref<T>(*p).load(); }
template<class T, class V> void __atomic_store_n(T* p, V v, int) {
  std::atomic_ref<T>(*p).store(static_cast<T>(v));
}
template<class T, class V> T __atomic_exchange_n(T* p, V v, int) {
  return std::atomic_ref<T>(*p).exchange(static_cast<T>(v));
}
#endif
constexpr unsigned MALLOC_CAP_INTERNAL=1, MALLOC_CAP_8BIT=2, MALLOC_CAP_SPIRAM=4;
constexpr unsigned MALLOC_CAP_EXEC=8, MALLOC_CAP_32BIT=16;
static size_t internalFree=100000, largest=100000;
static bool externalFails=false;
static std::map<void*,size_t> internalOwned;
static size_t heap_caps_get_free_size(unsigned) { return internalFree; }
static size_t externalLargest=1u<<20;
static size_t heap_caps_get_largest_free_block(unsigned caps) {
  if (caps & MALLOC_CAP_SPIRAM) return externalFails ? 0 : externalLargest;
  return largest;
}
static size_t externalAsked=0;
static void* heap_caps_malloc(size_t n, unsigned caps) {
  if (caps & MALLOC_CAP_SPIRAM) { externalAsked=n; return externalFails ? nullptr : malloc(n); }
  if (n>internalFree || n>largest) return nullptr;
  void* p=malloc(n); assert(p); internalOwned[p]=n; internalFree-=n;
  return p;
}
static void* heap_caps_calloc(size_t n,size_t s,unsigned caps) {
  void* p=heap_caps_malloc(n*s,caps); if(p) memset(p,0,n*s); return p;
}
static void heap_caps_free(void* p) {
  auto i=internalOwned.find(p);
  if(i!=internalOwned.end()) { internalFree+=i->second; internalOwned.erase(i); }
  free(p);
}
#include "core_module_memory.h"
#include "core_module_resident.h"
#include "sidecar_name.h"

using TaskHandle_t = void*;
static thread_local TaskHandle_t task=reinterpret_cast<void*>(1);
static TaskHandle_t xTaskGetCurrentTaskHandle() { return task; }
static uint32_t micros() {
  return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::microseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}
// A stalled loop is told by the clock, and nobody waits ten real seconds for
// one: real time supplies the 25 ms slices, leapMs the stall. Taken from the
// 64-bit count rather than micros()/1000, which steps back to zero every 71
// minutes - a step the loop's age would read as 49 days without a beat.
static std::atomic<uint32_t> leapMs{0};
static uint32_t millis() {
  return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count())+leapMs;
}
constexpr unsigned portMAX_DELAY=0xffffffffu, pdTRUE=1, pdPASS=1;
#define pdMS_TO_TICKS(x) (x)
// One tick. Shortened where a case wants its caller to look thousands of times.
static std::atomic<unsigned> tickUs{1000};
struct Semaphore { std::mutex m; std::condition_variable cv; bool ready=false; };
using SemaphoreHandle_t=Semaphore*;
static Semaphore* xSemaphoreCreateBinary() { return new Semaphore; }
static Semaphore* xSemaphoreCreateMutex() { auto p=new Semaphore; p->ready=true; return p; }
static unsigned xSemaphoreTake(Semaphore* s,unsigned ms) {
  std::unique_lock<std::mutex> lock(s->m);
  if(ms==portMAX_DELAY) s->cv.wait(lock,[&]{return s->ready;});
  else if(!s->cv.wait_for(lock,std::chrono::microseconds(uint64_t(ms)*tickUs),[&]{return s->ready;})) return 0;
  s->ready=false; return pdTRUE;
}
static void xSemaphoreGive(Semaphore* s) {
  std::lock_guard<std::mutex> lock(s->m); s->ready=true; s->cv.notify_one();
}
struct Logger { void println(const char*) {} template<class... T> void printf(const char*,T...) {} } Serial;
namespace PFRuntime { inline void noteSync(uint32_t) {} }
#include "core_loop_sync.h"
// A thread standing in for the network task. Its maintenance hook runs once a
// slice, just before the caller decides whether to give up on the loop - the
// one moment these cases need to meet - and `looks` counts them. With
// `rendezvous` set the caller is held at that point until the loop says go,
// and for `callerLag` spins more, so the two can be let at the request in the
// same instant whichever of them is the quicker off the mark.
static std::atomic<unsigned> looks{0};
static std::atomic<bool> rendezvous{false}, atDoor{false}, go{false};
static std::atomic<int> callerLag{0};
// A few nanoseconds a spin, in work the optimiser has to leave in: a loop of
// loads whose value nobody used compiled to nothing, and the aim never moved.
static void spin(int spins) {
  static thread_local std::atomic<unsigned> turns{0};
  for(; spins>0; --spins) ++turns;
}
static void becomeCaller() {
  task=reinterpret_cast<void*>(2);
  PFNetMaintenance::attach([]{
    ++looks;
    if(!rendezvous) return;
    atDoor=true;
    while(!go) {}
    spin(callerLag);
    atDoor=false;
  });
}
static bool callerLooked(unsigned times) {
  const unsigned from=looks;
  const auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(10);
  while(looks-from<times) {
    if(std::chrono::steady_clock::now()>limit) return false;
    std::this_thread::yield();
  }
  return true;
}
static bool posted() { return __atomic_load_n(&PFLoopSync::pendingFn,__ATOMIC_ACQUIRE)!=nullptr; }

constexpr int MODULE_PATH_BYTES=96, MODULE_NAME_BYTES=64, NUM_PRESETS=1, PF_CUSTOM_SLOT_COUNT=0;
struct PatternEntry { const char* name; const char* modulePath; };
// C is past NUM_PATTERNS until the resident cases, which need a third module.
static PatternEntry entries[]={{"Origin",nullptr},{"A","/a.pfm"},{"B","/b.pfm"},{"C","/c.pfm"}};
static PatternEntry* patterns=entries;
static int NUM_PATTERNS=3, activePatternIdx=1, currentPatternIdx=1, numModules=2;
static char moduleNames[2][MODULE_NAME_BYTES]{};
static int FFat=0;
static bool createFails=false, notified=false, reorder=false, removeB=false;
static unsigned created=0;
static unsigned retryPauseMs=0;
static void vTaskDelay(unsigned ms) { retryPauseMs+=ms; }
// The loader at the registry's boundary: real residency bookkeeping
// (core_module_resident.h), a malloc'd block standing in for a module's
// memory so the sanitizers see every free. What a module IS and when the real
// loader parks one is resident_test.cpp's business; here it is whether the
// registry parks, resumes and drops at the right moments.
namespace PFModuleLoader {
struct Descriptor { const char* name; } descriptor{"loaded"};
inline Descriptor* active=&descriptor;
inline unsigned unloads=0, loads=0, resumes=0, makeRooms=0, drops=0;
inline unsigned allocationFailures=0;
inline bool invalidFile=false;
// The module loaded next may be kept; the current one may be kept. The boot
// module of the cases below holds no block and is never kept, so the cases
// written before residency see what they always did.
inline bool parkableLoads=true, currentParkable=false;
inline char* memory=nullptr;
inline char currentPath[96]{};
// The storage generation, as the real loader keeps it: moved by every write,
// stamped on every load, carried through a park and a resume.
inline unsigned storage=0, currentGeneration=0;
inline void noteStorageWrite() { ++storage; }
struct Parked { Descriptor* active; char* memory; unsigned generation; };
inline void releaseParked(Parked& parked) { free(parked.memory); parked.memory=nullptr; }
inline void* allocateTable(size_t bytes) { return calloc(1,bytes); }
// Two slots, so a third module fills the table.
inline PFModuleResident::Table<Parked,2,allocateTable,releaseParked> table;
inline void unload() {
  ++unloads; active=nullptr; free(memory); memory=nullptr;
  currentPath[0]=0; currentParkable=false;
}
inline bool load(int,const char* path) {
  ++loads;
  unload();
  currentGeneration=storage;
  if(invalidFile) return false;
  if(allocationFailures) { --allocationFailures; ++PFModuleMemory::refusals; return false; }
  active=&descriptor; memory=static_cast<char*>(malloc(16));
  snprintf(currentPath,sizeof(currentPath),"%s",path);
  currentParkable=parkableLoads; return true;
}
inline bool fail(const char*) { return false; }
inline const char* error() { return "test"; }
inline bool parkable() { return active && memory && currentParkable && currentGeneration==storage; }
inline bool fresh(const Parked& parked) { return parked.generation==storage; }
inline void evictStale() { table.evictIf([](const Parked& parked){ return !fresh(parked); }); }
inline bool park(const char* keep=nullptr) {
  if(!parkable()) return false;
  evictStale();
  Descriptor* leaving=active; char* held=memory; const unsigned generation=currentGeneration;
  if(!table.park(currentPath,16,[&](Parked& slot){
        slot.active=leaving; slot.memory=held; slot.generation=generation; },keep))
    return false;
  active=nullptr; memory=nullptr; currentPath[0]=0; currentParkable=false;
  return true;
}
inline void leave(const char* keep=nullptr) { if(!park(keep)) unload(); }
inline bool isParked(const char* path) {
  const Parked* parked=table.peek(path);
  return parked && fresh(*parked);
}
inline bool resume(const char* path) {
  if(active || !isParked(path)) return false;
  Parked back{};
  if(!table.take(path,[&](Parked& slot){ back=slot; })) return false;
  active=back.active; memory=back.memory; currentParkable=true; currentGeneration=back.generation;
  snprintf(currentPath,sizeof(currentPath),"%s",path);
  ++resumes; return true;
}
inline void makeRoom() { ++makeRooms; evictStale(); }
inline void dropParked() { ++drops; table.evictAll(); }
inline bool dropStale() {
  evictStale();
  if(!active || currentGeneration==storage) return false;
  unload(); return true;
}
}
// The sidecar cache's forget calls, lifted from the registry: what every
// module-file writer already calls, core and feature alike.
static const char* const MODULE_DIR="/patterns";
static char (*sidecarPaths)[MODULE_PATH_BYTES]=nullptr;
static char (*sidecarNames)[MODULE_NAME_BYTES]=nullptr;
static bool* sidecarAbs=nullptr;
static int sidecarCount=0;
// sidecarForgetPath() compacts by copying the last slot over slot i, under
// `if (i != last)`; g++'s -Wrestrict does not follow the guard and calls the
// two slots possibly the same object. They are not, on the device or here.
#if defined(__GNUC__) && !defined(__clang__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wrestrict"
#endif
#include "sidecar_forget.h"
#if defined(__GNUC__) && !defined(__clang__)
#pragma GCC diagnostic pop
#endif
static int xTaskCreatePinnedToCore(void(*)(void*),const char*,uint32_t,void*,unsigned,void** out,int) {
  if(createFails) return 0;
  ++created; *out=reinterpret_cast<void*>(3); return pdPASS;
}
static void xTaskNotifyGive(void*) { notified=true; }
static void ulTaskNotifyTake(unsigned,unsigned) { assert(notified); }
static uint32_t uxTaskGetStackHighWaterMark(void*) { return 4096; }
#include "registry_lifecycle.h"
static void buildPatternList() {
  if(reorder) { std::swap(entries[1],entries[2]); reorder=false; }
  if(removeB) { entries[1]={"A","/a.pfm"}; NUM_PATTERNS=2; }
}
namespace Manager {
#include "patterns_lifecycle.h"
}
int main() {
  assert(!PFModuleMemory::fits(SIZE_MAX,100,50));
  assert(!PFModuleMemory::fits(1,100,101));
  externalFails=true; internalFree=PF_MODULE_INTERNAL_RESERVE+99;
  assert(!PFModuleMemory::data(100,true,true)); // PSRAM failure cannot bypass reserve
  internalFree=100000; largest=50;
  void* held=nullptr;
  assert(!PFModuleMemory::code(100,&held) && !held); // fragmentation despite ample total heap
  // Admission is on the SUM of the module's executable sections, and refuses
  // without allocating anything - no allocate-then-roll-back.
  largest=100000; externalFails=false;
  internalFree=PF_MODULE_INTERNAL_RESERVE+4000;
  assert(!PFModuleMemory::admitCode(2500+2500) && PFModuleMemory::dataBudget==0);
  assert(internalFree==PF_MODULE_INTERNAL_RESERVE+4000 && internalOwned.empty());
  assert(PFModuleMemory::admitCode(2500) && PFModuleMemory::dataBudget==1500);
  // Data past the budget moves to PSRAM and leaves code's share alone; data
  // within it is placed internally and charged. Neither can fail the load.
  void* wide=PFModuleMemory::data(3000,true,false);
  assert(wide && PFModuleMemory::dataBudget==1500);
  assert(internalFree==PF_MODULE_INTERNAL_RESERVE+4000);
  heap_caps_free(wide);
  void* narrow=PFModuleMemory::data(1000,true,false);
  assert(narrow && PFModuleMemory::dataBudget==500);
  assert(internalFree==PF_MODULE_INTERNAL_RESERVE+3000);
  heap_caps_free(narrow);
  // PSRAM gone: the reserve still binds the internal fallback.
  externalFails=true; PFModuleMemory::endLoad();
  assert(!PFModuleMemory::data(100000,true,true));
  externalFails=false; internalFree=100;
  void* p=PFModuleMemory::data(128,true,false); assert(p);
  for(int i=0;i<128;++i) assert(static_cast<unsigned char*>(p)[i]==0);
  heap_caps_free(p);

  // Code has a second home. With the fallback policy, what fits internally
  // still goes there and is charged; what does not fit moves to PSRAM, is
  // charged nothing, and leaves the whole budget to the module's data.
  internalFree=PF_MODULE_INTERNAL_RESERVE+4000; largest=100000;
  PFModuleMemory::codePolicy=PF_MODULE_CODE_PSRAM_FALLBACK;
  assert(PFModuleMemory::admitCode(2500) && !PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==1500);
  assert(PFModuleMemory::admitCode(5000) && PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==4000);
  void* far=PFModuleMemory::code(5000,&held);
  assert(far && internalOwned.empty() && internalFree==PF_MODULE_INTERNAL_RESERVE+4000);
  // ...in a block that owns whole cache lines, so the write-back never
  // touches a line the allocator or a neighbour is using.
  // One line of slack, the code on a line boundary inside the allocation:
  // every line it occupies is the allocation's own.
  assert(externalAsked==5056+64 && reinterpret_cast<uintptr_t>(far)%64==0);
  assert(static_cast<char*>(far)>=static_cast<char*>(held) &&
         static_cast<char*>(far)+5056<=static_cast<char*>(held)+externalAsked);
  heap_caps_free(held);
  // Room in total is not a block: code refused for fragmentation is exactly
  // what the second home is for.
  largest=2000;
  assert(PFModuleMemory::admitCode(2500) && PFModuleMemory::codeExternal);
  largest=100000;
  // Services under the reserve: budget is zero and code still has somewhere.
  internalFree=PF_MODULE_INTERNAL_RESERVE-1;
  assert(PFModuleMemory::admitCode(1) && PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==0);
  // PSRAM-first: code never takes internal RAM while PSRAM can hold it.
  internalFree=PF_MODULE_INTERNAL_RESERVE+4000;
  PFModuleMemory::codePolicy=PF_MODULE_CODE_PSRAM_FIRST;
  assert(PFModuleMemory::admitCode(2500) && PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==4000);
  // No PSRAM, or no block that large: both policies fall back to the internal
  // rule exactly - same verdict, same budget, nothing allocated to find out.
  externalLargest=2000;
  assert(PFModuleMemory::admitCode(2500) && !PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==1500);
  externalFails=true; externalLargest=1u<<20;
  assert(!PFModuleMemory::admitCode(5000) && !PFModuleMemory::codeExternal);
  assert(PFModuleMemory::dataBudget==0 && internalOwned.empty());
  PFModuleMemory::codePolicy=PF_MODULE_CODE_PSRAM_FALLBACK;
  assert(!PFModuleMemory::admitCode(5000) && !PFModuleMemory::codeExternal);
  // The old rule is still there to be chosen.
  externalFails=false;
  PFModuleMemory::codePolicy=PF_MODULE_CODE_INTERNAL;
  assert(!PFModuleMemory::admitCode(5000) && !PFModuleMemory::codeExternal);
  // ...and is what a unit falls back to once a PSRAM placement has failed to
  // verify: the same pick then lands internally instead of failing again.
  PFModuleMemory::codePolicy=PF_MODULE_CODE_PSRAM_FIRST;
  PFModuleMemory::codeDemoted=true;
  assert(PFModuleMemory::codeRule()==PF_MODULE_CODE_INTERNAL);
  assert(PFModuleMemory::admitCode(2500) && !PFModuleMemory::codeExternal);
  assert(!PFModuleMemory::admitCode(5000));
  PFModuleMemory::codeDemoted=false;
  PFModuleMemory::codePolicy=PF_MODULE_CODE_POLICY; PFModuleMemory::endLoad();
  internalFree=100;

  // A sidecar's name, as the build writes it and as a person might.
  {
    char name[64];
    assert(jsonStringValue("Wave Saw\", \"abi\": 2}", name, sizeof(name)) && !strcmp(name,"Wave Saw"));
    // An escaped quote is part of the name, not the end of it.
    assert(jsonStringValue("Say \\\"hi\\\" \\\\ there\"", name, sizeof(name)));
    assert(!strcmp(name,"Say \"hi\" \\ there"));
    // The build spells non-ASCII as \uXXXX; the stored name is UTF-8.
    assert(jsonStringValue("Dynamic Moir\\u00e9\"", name, sizeof(name)));
    assert(!strcmp(name,"Dynamic Moir\xC3\xA9"));
    assert(jsonStringValue("\\ud328\\ud134\"", name, sizeof(name)) && !strcmp(name,"\xED\x8C\xA8\xED\x84\xB4"));
    assert(jsonStringValue("\\ud83c\\udf0a\"", name, sizeof(name)) && !strcmp(name,"\xF0\x9F\x8C\x8A"));
    // A character that does not fit is left out whole, and nothing after it.
    char tight[6];
    assert(jsonStringValue("abcd\\u00e9z\"", tight, sizeof(tight)) && !strcmp(tight,"abcd"));
    assert(jsonStringValue("ab\xED\x8C\xA8z\"", tight, sizeof(tight)) && !strcmp(tight,"ab\xED\x8C\xA8"));
    // Control escapes vanish; what never closes, or holds nothing, is no name.
    assert(jsonStringValue("a\\nb\\tc\"", name, sizeof(name)) && !strcmp(name,"abc"));
    assert(!jsonStringValue("never closed", name, sizeof(name)));
    assert(!jsonStringValue("ends in a backslash\\", name, sizeof(name)));
    assert(!jsonStringValue("bad \\u12 escape\"", name, sizeof(name)));
    assert(!jsonStringValue("\"", name, sizeof(name)));
    assert(!jsonStringValue("\\n\\t\"", name, sizeof(name)));
  }

  PFLoopSync::attach();
  int attempts=0, commits=0;
  assert(!PFLoopSync::runWhen([&]{ ++attempts; return false; }));
  std::atomic<bool> finished=false;
  std::thread caller([&]{
    task=reinterpret_cast<void*>(2);
    assert(PFLoopSync::runWhen([&]{ if(++attempts<5) return false; ++commits; return true; }));
    finished=true;
  });
  unsigned frames=0;
  while(!finished) { PFLoopSync::service(); ++frames; std::this_thread::yield(); }
  caller.join(); assert(commits==1 && frames>=4);

  // The loop stops. Nothing services, the stamp turns PF_LOOP_STALL_MS old,
  // and the caller takes its request back and is told it did not run. What it
  // took back must never run - not when the loop wakes, not ever: the lambda
  // it pointed at went with the caller's stack frame.
  {
    int ran=0; bool answered=true;
    std::thread stuck([&]{ becomeCaller(); answered=PFLoopSync::run([&]{ ++ran; }); });
    while(!posted()) std::this_thread::yield();
    assert(!PFLoopSync::stalled() && PFLoopSync::gaveUp==0);
    leapMs+=PF_LOOP_STALL_MS;
    stuck.join();
    assert(!answered && ran==0 && PFLoopSync::gaveUp==1 && PFLoopSync::stalled());
    PFLoopSync::service();
    assert(ran==0 && !PFLoopSync::stalled());
  }
  // How long a caller has waited is not evidence. A transaction the loop
  // keeps testing outlasts the limit - a module's setup() is seconds - for as
  // long as the loop keeps arriving. When the loop then stops, it is taken
  // back like any other, and the attempt is not tried again.
  {
    int tries=0; bool committed=true;
    std::thread waiting([&]{ becomeCaller(); committed=PFLoopSync::runWhen([&]{ ++tries; return false; }); });
    while(!posted()) std::this_thread::yield();
    for(int frame=1; frame<=3; ++frame) {
      PFLoopSync::service();
      leapMs+=PF_LOOP_STALL_MS/2;
      assert(callerLooked(2) && posted() && tries==frame);
    }
    leapMs+=PF_LOOP_STALL_MS;
    waiting.join();
    assert(!committed && tries==3 && PFLoopSync::gaveUp==2);
    PFLoopSync::service();
    assert(tries==3);
  }
  // A call the loop has taken is waited out, however dead the loop looks from
  // outside while it is in there: the body is running on the caller's stack
  // frame. And the loop stamps on its way out, or the next request would find
  // a stalled loop one frame before it answered.
  {
    int ran=0; std::atomic<bool> returned=false;
    std::thread waiter([&]{
      becomeCaller();
      const bool ok=PFLoopSync::run([&]{
        leapMs+=2*PF_LOOP_STALL_MS;
        assert(callerLooked(2) && !returned);
        ++ran;
      });
      assert(ok); returned=true;
    });
    while(!ran) PFLoopSync::service();
    assert(!PFLoopSync::stalled());
    waiter.join(); assert(ran==1 && PFLoopSync::gaveUp==2);
  }
  // The age is never read from the future: with the loop stamping flat out,
  // a reader that took the clock before the stamp would see 49 days. Only a
  // millisecond turning over between its two reads can show that, so this
  // runs across three hundred of them.
  {
    std::atomic<bool> read=false;
    std::thread reader([&]{
      const auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(300);
      while(std::chrono::steady_clock::now()<until) {
        for(int i=0; i<1000; ++i) assert(PFLoopSync::loopAgeMs()<PF_LOOP_STALL_MS);
      }
      read=true;
    });
    while(!read) PFLoopSync::service();
    reader.join();
  }
  // The race itself: the caller reaching to take its request back at the
  // moment the loop reaches to take it. One exchange lands first. Either the
  // body runs once and its caller hears that it ran, or it never runs and its
  // caller hears that. Each call's record stands in for the caller's stack
  // frame and outlives it, so a body that runs after its caller has left
  // finds `live` false instead of whatever the next call put at that address.
  //
  // Whether this meets the race or only walks round it was settled by
  // breaking the code under it: with the caller taking its request back by a
  // load and a store, or the loop taking it by a load, the "told the truth"
  // assert went off on every run (g++ -O2, with and without the sanitizers,
  // on two cores and on twenty). A caller that leaves without looking at
  // what its exchange returned does not get this far: the call that has to
  // be waited out, two cases up, catches it.
  {
    struct Call { std::atomic<bool> live{false}; std::atomic<unsigned> ran{0}; };
    static Call calls[4000];
    tickUs=4;
    std::atomic<bool> over=false;
    unsigned completed=0; std::atomic<unsigned> withdrawn=0;
    std::thread racer([&]{
      becomeCaller();
      const auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(3);
      for(Call& call : calls) {
        if(std::chrono::steady_clock::now()>limit) break;
        call.live=true;
        const bool ok=PFLoopSync::runRaw([](void* p){
          Call* mine=static_cast<Call*>(p); assert(mine->live); ++mine->ran;
        }, &call);
        call.live=false;
        // Told the truth, and nothing of this call left on the table.
        assert(call.ran==(ok?1u:0u) && !posted());
        if(ok) ++completed; else ++withdrawn;
      }
      over=true;
    });
    uint32_t dice=1; unsigned lost=0;
    int lead=0;   // spins the loop gives the caller; negative, the caller gives the loop
    int step=16; bool callerWon=false;
    rendezvous=true;
    while(!over) {
      if(!posted()) continue;
      // Go quiet for a stall's worth, hold the caller at the point of looking,
      // let both go at once. How much start one needs over the other to make
      // a tie is the machine's business, so aim: the loop a little later
      // after a call it got to first, a little sooner after one the caller
      // took back, in steps that halve each time the winner changes. The two
      // exchanges then keep meeting, which a fixed delay does only by luck.
      const bool won=withdrawn!=lost; lost=withdrawn;
      if(won!=callerWon && step>1) step/=2;
      callerWon=won;
      if(won ? lead>-100000 : lead<100000) lead+=won ? -step : step;
      dice=dice*1664525u+1013904223u;
      const int jitter=int(dice>>30);
      callerLag=lead<0 ? jitter-lead : 0;
      leapMs+=PF_LOOP_STALL_MS;
      while(!atDoor && !over) {}
      go=true;
      spin(lead>0 ? lead+jitter : 0);
      PFLoopSync::service();
      while(atDoor) {}
      go=false;
    }
    racer.join(); rendezvous=false; tickUs=1000;
    PFLoopSync::service();
    unsigned bodies=0;
    for(Call& call : calls) bodies+=call.ran;
    assert(bodies==completed && PFLoopSync::gaveUp==2+withdrawn && !posted());
    printf("loop hand-off race: %u ran, %u withdrawn\n", completed, withdrawn.load());
    // How hard this case tries depends on the machine. Under g++ on Linux it
    // gets about 4,000 rounds and a non-atomic take on either side fails it
    // every run; under MSVC, whose waits are coarse, it gets about 200 and the
    // same mutation has passed. CI (g++, sanitizers) is the gate for the race,
    // a local run on Windows is not.
    // Both ways, or the two never met and everything above passed for want of
    // a race. The aim swings back each time one side wins, so with a core each
    // both must turn up - they did with a third thread spinning on the same
    // two cores. On a single core the threads take turns instead of tying
    // (the loop won 366 of 366 pinned to one), and a machine that has only
    // the one is let off; pinned to one core of many with taskset this still
    // fails, which is the honest answer for a run that raced nothing.
    if(std::thread::hardware_concurrency()>1) assert(completed && withdrawn);
  }

  createFails=true;
  assert(!activatePatternAsync(2));
  assert(activePatternIdx==1 && PFModuleLoader::active && PFModuleLoader::unloads==0);
  assert(PFModuleLoader::loads==0); // never synchronous fallback
  createFails=false;
  assert(activatePatternAsync(2)); assert(notified && loadInFlight);
  assert(!Manager::captureSelectionOnce()); // single-core fallback: busy, no eviction
  assert(!patternLoadsHeld && !Manager::restorePending);
  assert(activatePatternAsync(1)); // latest request while setup is in flight
  loadPatternJob();
  assert(Manager::captureSelectionOnce()); // finishes then holds, never starts queued loader
  assert(patternLoadsHeld && Manager::restorePending && !loadInFlight);
  auto count=created;
  assert(activatePatternAsync(1)); assert(activatePatternAsync(2));
  assert(created==count); // no loading through a storage mutation
  reorder=true;
  assert(Manager::restoreSelection());
  assert(!patternLoadsHeld && currentPatternIdx==1); // B moved from index 2 to 1
  assert(loadTargetIdx==1 && loadInFlight); // restore is asynchronous
  loadPatternJob(); serviceAsyncLoad();
  assert(Manager::captureSelectionOnce());
  assert(activatePatternAsync(1)); // B is then deleted before restore
  removeB=true; assert(Manager::restoreSelection());
  assert(currentPatternIdx==0 && activePatternIdx==0 && !loadInFlight);
  assert(created==1); // every later selection reuses the single reserved worker
  loadTargetIdx=1;
  PFModuleLoader::allocationFailures=2;
  auto beforeLoads=PFModuleLoader::loads;
  loadPatternJob();
  assert(loadResult && PFModuleLoader::loads-beforeLoads==3 && retryPauseMs==150);
  retryPauseMs=0; PFModuleLoader::allocationFailures=99;
  beforeLoads=PFModuleLoader::loads;
  loadPatternJob();
  assert(!loadResult && PFModuleLoader::loads-beforeLoads==6 && retryPauseMs==1500);
  PFModuleLoader::allocationFailures=0; PFModuleLoader::invalidFile=true;
  retryPauseMs=0; beforeLoads=PFModuleLoader::loads;
  loadPatternJob();
  assert(!loadResult && PFModuleLoader::loads-beforeLoads==1 && retryPauseMs==0);

  // ── Resident modules (src/core_module_resident.h) ──
  // Every write reported to the sidecar cache moves the storage generation:
  // a path the cache never held is still a file written, and a format is
  // every file at once.
  {
    sidecarPaths=static_cast<char(*)[MODULE_PATH_BYTES]>(calloc(2,MODULE_PATH_BYTES));
    sidecarNames=static_cast<char(*)[MODULE_NAME_BYTES]>(calloc(2,MODULE_NAME_BYTES));
    sidecarAbs=static_cast<bool*>(calloc(2,sizeof(bool)));
    const unsigned before=PFModuleLoader::storage;
    sidecarForgetSlug("never_cached");
    assert(PFModuleLoader::storage==before+1);
    snprintf(sidecarPaths[0],MODULE_PATH_BYTES,"%s","/patterns/x.pfm"); sidecarCount=1;
    sidecarForgetSlug("x");
    assert(PFModuleLoader::storage==before+2 && sidecarCount==0);
    sidecarCount=1; sidecarForgetAll();
    assert(PFModuleLoader::storage==before+3 && sidecarCount==0);
    free(sidecarPaths); free(sidecarNames); free(sidecarAbs);
    sidecarPaths=nullptr; sidecarNames=nullptr; sidecarAbs=nullptr;
  }
  // Back to the list the cases above started from, Origin running.
  PFModuleLoader::invalidFile=false; PFModuleLoader::allocationFailures=0;
  entries[1]={"A","/a.pfm"}; entries[2]={"B","/b.pfm"}; NUM_PATTERNS=3; removeB=false;
  PFModuleLoader::unload(); PFModuleLoader::dropParked();
  activePatternIdx=0; loadQueuedIdx=-1; loadTargetIdx=-1; loadFinished=false;
  assert(!loadInFlight && !patternLoadsHeld);
  // A loads on the worker, as it always did.
  notified=false;
  assert(activatePatternAsync(1) && loadInFlight && notified);
  loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1 && PFModuleLoader::active && !loadInFlight);
  const unsigned loadsWithA=PFModuleLoader::loads;
  // Leaving it for a preset parks it: nothing freed, nothing loaded.
  assert(switchesInstantly(0));
  assert(activatePatternAsync(0) && activePatternIdx==0 && !PFModuleLoader::active);
  assert(PFModuleLoader::isParked("/a.pfm") && PFModuleLoader::table.count==1);
  // Coming back resumes it inside the call, on this task: no worker, no load,
  // no thumbnail frame in between - and the name slot is refreshed as a load
  // refreshes it.
  notified=false; moduleNames[0][0]=0;
  assert(isResidentOrPreset(1) && switchesInstantly(1));
  assert(activatePatternAsync(1));
  assert(activePatternIdx==1 && PFModuleLoader::active && !loadInFlight && !notified);
  assert(PFModuleLoader::loads==loadsWithA && PFModuleLoader::resumes==1);
  assert(PFModuleLoader::table.count==0 && !strcmp(moduleNames[0],"loaded"));
  // A module that is not parked still loads on the worker; the outgoing one
  // is parked before the worker starts, and room is made for the incoming.
  const unsigned rooms=PFModuleLoader::makeRooms;
  notified=false;
  assert(!isResidentOrPreset(2) && !switchesInstantly(2));
  assert(activatePatternAsync(2) && loadInFlight && notified && activePatternIdx==-1);
  assert(PFModuleLoader::isParked("/a.pfm") && PFModuleLoader::makeRooms==rooms+1);
  // The worker owns the table now: the loop answers nothing from it, and no
  // switch is instant, presets included - it would only be queued.
  assert(!isResidentOrPreset(1) && isResidentOrPreset(0));
  assert(!switchesInstantly(0) && !switchesInstantly(1));
  // A request for A while B loads waits its turn, then resumes A rather
  // than loading it, and parks B on the way.
  assert(activatePatternAsync(1) && loadQueuedIdx==1);
  loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1 && !loadInFlight && PFModuleLoader::resumes==2);
  assert(PFModuleLoader::loads==loadsWithA+1);
  assert(PFModuleLoader::isParked("/b.pfm") && !PFModuleLoader::isParked("/a.pfm"));
  // Leaving a module that cannot be kept would cost its whole load when the
  // knob came back, so SELECT does not switch away from it on a detent.
  PFModuleLoader::currentParkable=false;
  assert(!switchesInstantly(0) && !switchesInstantly(2));
  PFModuleLoader::currentParkable=true;
  // The boot path (synchronous) resumes too, and parks what it leaves.
  assert(activatePattern(2) && activePatternIdx==2 && PFModuleLoader::resumes==3);
  assert(PFModuleLoader::isParked("/a.pfm") && PFModuleLoader::loads==loadsWithA+1);
  assert(activatePattern(1) && PFModuleLoader::resumes==4 && PFModuleLoader::isParked("/b.pfm"));
  // A storage mutation starts with nothing in memory: the running module AND
  // every parked one, since a file may be replaced or deleted from here on -
  // the parked ones even when a preset is what keeps running through it.
  assert(activatePatternAsync(0) && PFModuleLoader::isParked("/a.pfm"));
  assert(Manager::captureSelectionOnce());
  assert(PFModuleLoader::table.count==0 && activePatternIdx==0);
  assert(Manager::restoreSelection() && activePatternIdx==0 && !loadInFlight);
  assert(activatePatternAsync(1)); loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1);
  assert(Manager::captureSelectionOnce());
  assert(PFModuleLoader::table.count==0 && !PFModuleLoader::active && activePatternIdx==-1);
  assert(Manager::restoreSelection());
  assert(loadInFlight && loadTargetIdx==1);   // a fresh load, not a resume
  loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1 && PFModuleLoader::loads==loadsWithA+3);
  // A rebuild with nothing written since touches nothing: restorePath is
  // A's (from the capture), A is parked and loaded from the storage as it is,
  // so it is resumed, and B is parked on the way.
  assert(activatePatternAsync(2)); loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==2 && PFModuleLoader::isParked("/a.pfm"));
  unsigned resumesBefore=PFModuleLoader::resumes;
  assert(Manager::restoreSelection());
  assert(!loadInFlight && activePatternIdx==1 && PFModuleLoader::resumes==resumesBefore+1);
  assert(PFModuleLoader::isParked("/b.pfm"));
  // A writer that does not empty memory first - a feature installing a
  // pattern - reports the write through sidecarForgetSlug(), which moves the
  // storage generation. From that moment nothing loaded before it comes back
  // from memory: not the parked B, and not by an instant SELECT detent - not
  // even onto a preset, because leaving A would now cost its reload.
  PFModuleLoader::noteStorageWrite();
  assert(!PFModuleLoader::isParked("/b.pfm") && !isResidentOrPreset(2));
  assert(!switchesInstantly(2) && !switchesInstantly(0));
  notified=false;
  assert(activatePatternAsync(2) && loadInFlight && notified && loadTargetIdx==2);
  assert(PFModuleLoader::table.count==0);       // A unloaded, stale B evicted
  loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==2);
  // And the rebuild the write asks for does not leave the old code running
  // under the new file's name, even when the restore lands on the pattern
  // that is already on the panel: it is unloaded, and loaded from the file.
  assert(activatePatternAsync(1)); loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1 && PFModuleLoader::isParked("/b.pfm"));
  PFModuleLoader::noteStorageWrite();
  const unsigned unloadsBefore=PFModuleLoader::unloads, loadsBefore=PFModuleLoader::loads;
  assert(Manager::restoreSelection());           // restorePath is still A's
  assert(PFModuleLoader::table.count==0 && PFModuleLoader::unloads==unloadsBefore+1);
  assert(loadInFlight && loadTargetIdx==1 && activePatternIdx==-1);
  loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==1 && PFModuleLoader::loads==loadsBefore+1);
  // A refused load gets every parked module back before it retries.
  assert(activatePatternAsync(0) && PFModuleLoader::isParked("/a.pfm"));
  const unsigned dropsBefore=PFModuleLoader::drops;
  loadTargetIdx=2; PFModuleLoader::allocationFailures=1; retryPauseMs=0;
  loadPatternJob();
  assert(loadResult && PFModuleLoader::table.count==0 && PFModuleLoader::drops==dropsBefore+1);
  PFModuleLoader::dropParked(); PFModuleLoader::unload();
  // A full table makes room by its least recently used module - never the
  // one the switch is about to resume, even when that one is the oldest.
  NUM_PATTERNS=4; activePatternIdx=0;
  assert(activatePatternAsync(1)); loadPatternJob(); serviceAsyncLoad();
  assert(activatePatternAsync(2)); loadPatternJob(); serviceAsyncLoad();
  assert(activatePatternAsync(3)); loadPatternJob(); serviceAsyncLoad();
  assert(activePatternIdx==3 && PFModuleLoader::table.count==2);
  assert(PFModuleLoader::isParked("/a.pfm") && PFModuleLoader::isParked("/b.pfm"));
  resumesBefore=PFModuleLoader::resumes;
  notified=false;
  assert(activatePatternAsync(1) && !loadInFlight && !notified);
  assert(activePatternIdx==1 && PFModuleLoader::resumes==resumesBefore+1);
  assert(PFModuleLoader::isParked("/c.pfm") && !PFModuleLoader::isParked("/b.pfm"));
  PFModuleLoader::dropParked(); PFModuleLoader::unload();
  delete PFLoopSync::doneSignal; delete PFLoopSync::callerLock;
  puts("PASS: reserve/fallback/fragmentation/race, deferred loop requests, stalled-loop hand-off, task failure, mutation hold, rescan and deleted selection, park/resume/drop around loads, storage mutations and writes nobody captured for");
}
