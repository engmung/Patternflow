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
template<class T> T __atomic_load_n(T* p, int) { return std::atomic_ref<T>(*p).load(); }
template<class T, class V> void __atomic_store_n(T* p, V v, int) {
  std::atomic_ref<T>(*p).store(static_cast<T>(v));
}
#endif
constexpr unsigned MALLOC_CAP_INTERNAL=1, MALLOC_CAP_8BIT=2, MALLOC_CAP_SPIRAM=4;
constexpr unsigned MALLOC_CAP_EXEC=8, MALLOC_CAP_32BIT=16;
static size_t internalFree=100000, largest=100000;
static bool externalFails=false;
static std::map<void*,size_t> internalOwned;
static size_t heap_caps_get_free_size(unsigned) { return internalFree; }
static size_t heap_caps_get_largest_free_block(unsigned) { return largest; }
static void* heap_caps_malloc(size_t n, unsigned caps) {
  if (caps & MALLOC_CAP_SPIRAM) return externalFails ? nullptr : malloc(n);
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

using TaskHandle_t = void*;
static thread_local TaskHandle_t task=reinterpret_cast<void*>(1);
static TaskHandle_t xTaskGetCurrentTaskHandle() { return task; }
static uint32_t micros() {
  return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::microseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count());
}
static uint32_t millis() { return micros()/1000; }
constexpr unsigned portMAX_DELAY=0xffffffffu, pdTRUE=1, pdPASS=1;
#define pdMS_TO_TICKS(x) (x)
struct Semaphore { std::mutex m; std::condition_variable cv; bool ready=false; };
using SemaphoreHandle_t=Semaphore*;
static Semaphore* xSemaphoreCreateBinary() { return new Semaphore; }
static Semaphore* xSemaphoreCreateMutex() { auto p=new Semaphore; p->ready=true; return p; }
static unsigned xSemaphoreTake(Semaphore* s,unsigned ms) {
  std::unique_lock<std::mutex> lock(s->m);
  if(ms==portMAX_DELAY) s->cv.wait(lock,[&]{return s->ready;});
  else if(!s->cv.wait_for(lock,std::chrono::milliseconds(ms),[&]{return s->ready;})) return 0;
  s->ready=false; return pdTRUE;
}
static void xSemaphoreGive(Semaphore* s) {
  std::lock_guard<std::mutex> lock(s->m); s->ready=true; s->cv.notify_one();
}
struct Logger { void println(const char*) {} template<class... T> void printf(const char*,T...) {} } Serial;
namespace PFRuntime { inline void noteSync(uint32_t) {} }
#include "core_loop_sync.h"

constexpr int MODULE_PATH_BYTES=96, MODULE_NAME_BYTES=64, NUM_PRESETS=1, PF_CUSTOM_SLOT_COUNT=0;
struct PatternEntry { const char* name; const char* modulePath; };
static PatternEntry entries[]={{"Origin",nullptr},{"A","/a.pfm"},{"B","/b.pfm"}};
static PatternEntry* patterns=entries;
static int NUM_PATTERNS=3, activePatternIdx=1, currentPatternIdx=1, numModules=2;
static char moduleNames[2][MODULE_NAME_BYTES]{};
static int FFat=0;
static bool createFails=false, notified=false, reorder=false, removeB=false;
static unsigned created=0;
static unsigned retryPauseMs=0;
static void vTaskDelay(unsigned ms) { retryPauseMs+=ms; }
namespace PFModuleLoader {
struct Descriptor { const char* name; } descriptor{"loaded"};
inline Descriptor* active=&descriptor;
inline unsigned unloads=0, loads=0;
inline unsigned allocationFailures=0;
inline bool invalidFile=false;
inline void unload() { ++unloads; active=nullptr; }
inline bool load(int,const char*) {
  ++loads;
  if(invalidFile) return false;
  if(allocationFailures) { --allocationFailures; ++PFModuleMemory::refusals; return false; }
  active=&descriptor; return true;
}
inline bool fail(const char*) { return false; }
inline const char* error() { return "test"; }
}
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
  assert(!PFModuleMemory::code(100)); // fragmentation despite ample total heap
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
  delete PFLoopSync::doneSignal; delete PFLoopSync::callerLock;
  puts("PASS: reserve/fallback/fragmentation/race, deferred loop requests, task failure, mutation hold, rescan and deleted selection");
}
