// Modules that stay loaded: the bookkeeping (src/core_module_resident.h) on
// its own, then the loader's own park/resume/unload/evict code, lifted from
// src/core_module_loader.h by check_runtime.py, against a heap that knows
// which blocks are PSRAM and a crash breadcrumb that records what it is told.
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#ifdef _MSC_VER
#include <atomic>
#define __ATOMIC_ACQUIRE 0
#define __ATOMIC_ACQ_REL 0
template<class T> T __atomic_load_n(T* p, int) { return std::atomic_ref<T>(*p).load(); }
template<class T, class V> T __atomic_add_fetch(T* p, V v, int) {
  return std::atomic_ref<T>(*p).fetch_add(static_cast<T>(v)) + static_cast<T>(v);
}
#endif

constexpr unsigned MALLOC_CAP_INTERNAL=1, MALLOC_CAP_8BIT=2, MALLOC_CAP_SPIRAM=4;
constexpr unsigned MALLOC_CAP_EXEC=8, MALLOC_CAP_32BIT=16;

// PSRAM and the internal heap, block by block. A free() of anything neither
// handed out is an assert: that is what freeing a code block through its
// line-aligned `memory` instead of the heap's `block` would look like.
static size_t psramSize=64*1024, psramUsed=0, internalFree=100000;
static bool psramRefuses=false;
// PSRAM that says no to the next N asks with plenty free in total: no block
// that large, which eviction may or may not cure.
static int psramNoBlock=0;
static std::map<void*,size_t> psramOwned, internalOwned;
static unsigned frees=0;
static size_t heap_caps_get_free_size(unsigned caps) {
  return (caps & MALLOC_CAP_SPIRAM) ? psramSize-psramUsed : internalFree;
}
static size_t heap_caps_get_largest_free_block(unsigned caps) { return heap_caps_get_free_size(caps); }
static void* heap_caps_malloc(size_t n, unsigned caps) {
  if(caps & MALLOC_CAP_SPIRAM) {
    if(psramNoBlock>0) { --psramNoBlock; return nullptr; }
    if(psramRefuses || n>psramSize-psramUsed) return nullptr;
    void* p=malloc(n); assert(p); psramOwned[p]=n; psramUsed+=n; return p;
  }
  if(n>internalFree) return nullptr;
  void* p=malloc(n); assert(p); internalOwned[p]=n; internalFree-=n; return p;
}
static void* heap_caps_calloc(size_t n, size_t s, unsigned caps) {
  void* p=heap_caps_malloc(n*s,caps); if(p) memset(p,0,n*s); return p;
}
static void testFree(void* p) {
  if(!p) return;
  ++frees;
  auto e=psramOwned.find(p);
  if(e!=psramOwned.end()) { psramUsed-=e->second; psramOwned.erase(e); free(p); return; }
  auto i=internalOwned.find(p);
  assert(i!=internalOwned.end());
  internalFree+=i->second; internalOwned.erase(i); free(p);
}
static bool esp_ptr_external_ram(const void* p) {
  const char* at=static_cast<const char*>(p);
  for(const auto& block : psramOwned) {
    const char* base=static_cast<const char*>(block.first);
    if(at>=base && at<base+block.second) return true;
  }
  return false;
}

// Small limits so a test heap can be filled: the floor makeRoom() keeps is
// PF_MODULE_RUNTIME_MAX_BYTES + PF_MODULE_RESIDENT_HEADROOM = 5120 bytes.
#define PF_MODULE_RESIDENT_MAX 3
#define PF_MODULE_RUNTIME_MAX_BYTES 4096u
#define PF_MODULE_RESIDENT_HEADROOM 1024u
#include "core_module_memory.h"
#include "core_module_resident.h"

static uint32_t clockUs=0;
static uint32_t micros() { return clockUs+=7; }
struct Logger { template<class... T> void printf(const char*,T...) {} } Serial;
namespace PFCrash {
enum Phase : uint32_t { IDLE=0, LOADING, CONSTRUCTORS, SETUP, UPDATE, DRAW };
static const void* owner=nullptr;
static char slug[80];
static uintptr_t codeBase=0;
static uint32_t codeSize=0, phase=IDLE;
inline void forget() { owner=nullptr; slug[0]=0; codeBase=0; codeSize=0; phase=IDLE; }
inline void running(const void* who, const char* path) {
  owner=who; snprintf(slug,sizeof(slug),"%s",path); codeBase=0; codeSize=0;
}
inline void code(uintptr_t base, uint32_t bytes) { codeBase=base; codeSize=bytes; }
inline void enter(Phase p) { phase=p; }
}
struct PFPatternModule { const char* name; };

#define free(p) testFree(p)
namespace PFModuleLoader {
#include "loader_state.h"
#include "loader_alloc.h"
#include "loader_unload.h"
#include "loader_timings.h"
#include "loader_resident.h"
}
#undef free

// ── The bookkeeping alone ─────────────────────────────────────────────
struct Toy { void* block; int id; };
static unsigned toyReleases=0;
static void releaseToy(Toy& toy) { ++toyReleases; free(toy.block); toy.block=nullptr; }
static bool tableRefuses=false;
// A table keeps its slots for the boot. These do not outlive the case.
static void* toyTables[4]; static int toyTableCount=0;
static void* toyTable(size_t bytes) {
  if(tableRefuses) return nullptr;
  assert(toyTableCount<4);
  return toyTables[toyTableCount++]=calloc(1,bytes);
}
using Toys=PFModuleResident::Table<Toy,3,toyTable,releaseToy>;
static Toy toy(int id) { return Toy{malloc(8),id}; }
template<class Table>
static bool parkToy(Table& table, const char* path, int id, const char* keep=nullptr) {
  Toy fresh=toy(id);
  if(table.park(path,10,[&](Toy& slot){ slot=fresh; },keep)) return true;
  free(fresh.block);   // not taken: the caller still owns it and unloads it
  return false;
}
template<class Table>
static int takeToy(Table& table, const char* path) {
  Toy back{nullptr,-1};
  if(!table.take(path,[&](Toy& slot){ back=slot; })) return -1;
  free(back.block);
  return back.id;
}

static void bookkeeping() {
  // No slots compiled in: nothing parks and nothing is allocated to find out.
  {
    PFModuleResident::Table<Toy,0,toyTable,releaseToy> none;
    bool filled=false;
    assert(!none.park("/a",1,[&](Toy&){ filled=true; }) && !filled && !none.allocated());
    assert(none.capacity()==0 && !none.has("/a") && none.evictAll()==0);
  }
  Toys table;
  // No table to be had: the park is refused before anything is taken, and the
  // next park tries again.
  tableRefuses=true;
  assert(!parkToy(table,"/a",1) && !table.allocated() && table.count==0);
  tableRefuses=false;
  // Park, find, take: the module comes back exactly once.
  assert(parkToy(table,"/a",1) && table.allocated() && table.count==1 && table.bytes==10);
  assert(table.has("/a") && !table.has("/b") && !table.has(nullptr));
  assert(takeToy(table,"/a")==1 && takeToy(table,"/a")==-1);
  assert(table.count==0 && table.bytes==0 && table.resumes==1 && toyReleases==0);
  // No key, an empty key, a key too long to hold whole: never parked.
  char longPath[PFModuleResident::PATH_BYTES+1];
  memset(longPath,'x',sizeof(longPath)-1); longPath[sizeof(longPath)-1]=0;
  assert(!parkToy(table,nullptr,9) && !parkToy(table,"",9) && !parkToy(table,longPath,9));
  longPath[PFModuleResident::PATH_BYTES-1]=0;   // 71 characters: fits
  assert(parkToy(table,longPath,9) && takeToy(table,longPath)==9);
  // Full: the least recently PARKED goes first, by counter, not by clock.
  assert(parkToy(table,"/a",1) && parkToy(table,"/b",2) && parkToy(table,"/c",3));
  assert(table.count==3 && table.oldest()==table.find("/a"));
  assert(parkToy(table,"/d",4));
  assert(!table.has("/a") && table.count==3 && toyReleases==1 && table.evictions==1);
  // Taking one back and parking it again makes it the newest.
  assert(takeToy(table,"/b")==2 && parkToy(table,"/b",2));
  assert(table.oldest()==table.find("/c"));
  // `keep` - the one about to be resumed - is never what a full table evicts.
  assert(parkToy(table,"/e",5,"/c"));
  assert(table.has("/c") && !table.has("/d") && table.count==3 && toyReleases==2);
  // A path parked twice is one slot: the older copy is released.
  assert(parkToy(table,"/c",33));
  assert(table.count==3 && toyReleases==3 && takeToy(table,"/c")==33);
  // Until enough: least recently used first, and it stops there.
  assert(parkToy(table,"/f",6));                       // order now: b, e, f
  int asked=0;
  assert(table.evictUntil([&]{ return ++asked>1; })==1);
  assert(!table.has("/b") && table.has("/e") && table.has("/f"));
  // ...or until nothing is parked.
  assert(table.evictUntil([]{ return false; })==2 && table.count==0 && table.bytes==0);
  assert(!table.evictOldest() && table.evictUntil([]{ return false; })==0);
  // A table whose only resident is `keep` cannot make room for another.
  {
    PFModuleResident::Table<Toy,1,toyTable,releaseToy> one;
    assert(parkToy(one,"/a",1) && !parkToy(one,"/b",2,"/a") && one.has("/a"));
    assert(parkToy(one,"/b",2) && !one.has("/a") && one.evictAll()==1);
  }
  assert(parkToy(table,"/a",1) && parkToy(table,"/b",2) && table.evictAll()==2);
  assert(table.count==0 && table.bytes==0);
  // Looking without taking; evicting by a test of the module itself - only
  // the slots it names, released, the rest left exactly where they were.
  assert(parkToy(table,"/a",1) && parkToy(table,"/b",2) && parkToy(table,"/c",3));
  assert(table.peek("/b") && table.peek("/b")->id==2 && !table.peek("/x") && table.count==3);
  const unsigned released=toyReleases;
  assert(table.evictIf([](const Toy& t){ return t.id!=2; })==2);
  assert(table.count==1 && table.has("/b") && toyReleases==released+2 && table.bytes==10);
  assert(table.evictIf([](const Toy&){ return false; })==0 && table.count==1);
  assert(takeToy(table,"/b")==2 && table.count==0);
  for(int i=0; i<toyTableCount; ++i) free(toyTables[i]);
}

// ── The loader's residency ─────────────────────────────────────────────
using namespace PFModuleLoader;
static PFPatternModule descriptors[]={{"a"},{"b"},{"c"},{"d"},{"e"}};
constexpr size_t CODE=256, LINE=64;

// What a successful load() leaves behind, without an ELF: the code a line
// into a PSRAM block (so `memory` is not the heap's pointer and `exec` is the
// instruction-bus alias), one data section, its timings, its path.
static void fakeLoad(const char* path, int which, size_t data, bool dataInternal=false,
                     bool codeExternal=true) {
  unload();
  if(strlen(path)<sizeof(currentPath)) memcpy(currentPath,path,strlen(path)+1);
  currentGeneration=storageNow();
  uint8_t* block=static_cast<uint8_t*>(heap_caps_malloc(
      CODE+LINE, codeExternal ? MALLOC_CAP_SPIRAM : MALLOC_CAP_INTERNAL|MALLOC_CAP_EXEC));
  assert(block);
  uint8_t* code=codeExternal ? block+16 : block;
  LoadedSection& text=sections[sectionCount++];
  text.index=1; text.size=(uint32_t)CODE; text.memory=code; text.block=block;
  text.exec=codeExternal ? (uintptr_t)code+0x06000000u : (uintptr_t)code;
  text.executable=true;
  uint8_t* bytes=static_cast<uint8_t*>(heap_caps_calloc(
      1,data,dataInternal ? MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT : MALLOC_CAP_SPIRAM));
  assert(bytes);
  LoadedSection& rodata=sections[sectionCount++];
  rodata.index=2; rodata.size=(uint32_t)data; rodata.memory=bytes;
  (codeExternal ? lastPsramBytes : lastInternalBytes)+=(uint32_t)(CODE+LINE);
  (dataInternal ? lastInternalBytes : lastPsramBytes)+=(uint32_t)data;
  lastCodeExternal=codeExternal;
  lastCodeBytes=(uint32_t)CODE;
  lastReadUs=1000u*which+1; lastRelocateUs=1000u*which+2;
  lastSetupUs=1000u*which+3; lastTotalUs=1000u*which+6;
  active=&descriptors[which];
  PFCrash::running(path,path);
  PFCrash::code(text.exec,text.size);
}

static bool same(const ResidentModule& a, const ResidentModule& b) {
  if(a.sectionCount!=b.sectionCount || a.moduleAllocCount!=b.moduleAllocCount) return false;
  for(int i=0; i<a.sectionCount; ++i) {
    const LoadedSection& x=a.sections[i]; const LoadedSection& y=b.sections[i];
    if(x.index!=y.index || x.size!=y.size || x.memory!=y.memory || x.exec!=y.exec ||
       x.block!=y.block || x.executable!=y.executable) return false;
  }
  for(int i=0; i<a.moduleAllocCount; ++i) if(a.moduleAllocs[i]!=b.moduleAllocs[i]) return false;
  return a.runtimeBytes==b.runtimeBytes && a.runtimeInternalBytes==b.runtimeInternalBytes &&
         a.active==b.active && a.lastInternalBytes==b.lastInternalBytes &&
         a.lastPsramBytes==b.lastPsramBytes && a.lastCodeBytes==b.lastCodeBytes &&
         a.lastCodeExternal==b.lastCodeExternal && a.lastReadUs==b.lastReadUs &&
         a.lastRelocateUs==b.lastRelocateUs && a.lastSetupUs==b.lastSetupUs &&
         a.lastTotalUs==b.lastTotalUs && a.generation==b.generation;
}

static bool nothingCurrent() {
  return !active && sectionCount==0 && moduleAllocCount==0 && runtimeBytes==0 &&
         runtimeInternalBytes==0 && lastInternalBytes==0 && lastPsramBytes==0 &&
         !lastCodeExternal && currentPath[0]==0;
}

static void loader() {
  static const char A[]="/patterns/a.pfm", B[]="/patterns/b.pfm", C[]="/patterns/c.pfm";
  static const char D[]="/patterns/d.pfm";
  // Residency on means data sections go to PSRAM first.
  assert(PFModuleMemory::dataPsramFirst);

  // No PSRAM for the table on the first park: the module is unloaded exactly
  // as it would have been, and every byte of it comes back.
  fakeLoad(A,0,512);
  assert(parkable());
  psramRefuses=true;
  leave();
  psramRefuses=false;
  assert(!resident.allocated() && resident.count==0 && nothingCurrent());
  assert(psramUsed==0 && internalOwned.empty() && PFCrash::owner==nullptr);

  // Parked: the globals are cleared and nothing is freed. unload() afterwards
  // frees nothing either - a parked module is not current, and unload() only
  // ever frees what is.
  fakeLoad(A,0,512);
  void* runtime=moduleAlloc(100);
  assert(runtime && runtimeBytes==100 && runtimeInternalBytes==0 && moduleAllocCount==1);
  ResidentModule before{};
  captureCurrent(before);
  const uint32_t heldA=lastPsramBytes+runtimeBytes;
  leave();
  const size_t withA=psramUsed;
  const unsigned freesParked=frees;
  assert(resident.allocated() && resident.count==1 && resident.bytes==heldA && isParked(A));
  assert(nothingCurrent() && PFCrash::owner==nullptr && PFCrash::codeSize==0);
  unload(); unload();
  assert(frees==freesParked && psramUsed==withA && resident.count==1);

  // Resumed: field for field what it left with, its own load timings
  // included; the breadcrumb names it, by the caller's pointer, with the
  // range its code is fetched from, and not inside any call.
  const char* asked=A;
  assert(!resume("/patterns/elsewhere.pfm"));
  PFCrash::phase=PFCrash::DRAW;
  assert(resume(asked));
  ResidentModule after{};
  captureCurrent(after);
  assert(same(before,after) && !strcmp(currentPath,A) && parkable());
  assert(resumed && lastResumeUs>0 && resident.count==0 && resident.bytes==0 && resident.resumes==1);
  assert(PFCrash::owner==asked && !strcmp(PFCrash::slug,A) && PFCrash::phase==PFCrash::IDLE);
  assert(PFCrash::codeBase==sections[0].exec && PFCrash::codeSize==sections[0].size);
  assert(frees==freesParked && psramUsed==withA);
  // ...and it goes on allocating as itself.
  assert(moduleAlloc(50) && runtimeBytes==150 && moduleAllocCount==2);

  // Leaving it again: /api/status's load.resumed describes the module on the
  // panel, and with a preset there it is false - the timings stay as A had
  // them.
  leave();
  assert(!resumed && lastResumeUs==0 && lastTotalUs==6 && isParked(A));

  // Resuming over a current module would orphan it: refused.
  fakeLoad(B,1,512);
  assert(!resume(A) && active==&descriptors[1] && isParked(A));

  // Not kept, so unloaded, and every byte comes back: any internal RAM at
  // all, a file that may have changed, code that never left internal RAM.
  const size_t internalBaseline=internalFree;
  const unsigned beforeNotKept=resident.count;
  fakeLoad(C,2,512,true);
  assert(!parkable());
  leave();
  assert(nothingCurrent() && resident.count==beforeNotKept && internalFree==internalBaseline);
  fakeLoad(C,2,512,false,false);
  assert(!parkable());
  leave();
  assert(!isParked(C) && internalFree==internalBaseline);
  fakeLoad(C,2,512);
  psramRefuses=true;
  assert(moduleAlloc(64) && runtimeInternalBytes==64);   // the internal fallback
  psramRefuses=false;
  assert(!parkable());
  leave();
  assert(!isParked(C) && internalFree==internalBaseline);

  // A module file written, from any task: one atomic add, nothing freed.
  // A is parked from before it, so A is never resumed again - isParked() and
  // resume() say no while its slot is still held - and the running C, loaded
  // before it too, is unloaded when left rather than parked.
  fakeLoad(A,0,512); leave();
  assert(isParked(A) && resident.count==1);
  fakeLoad(C,2,512);
  const size_t beforeWrite=psramUsed;
  const unsigned freesBeforeWrite=frees;
  noteStorageWrite();
  assert(frees==freesBeforeWrite && psramUsed==beforeWrite && resident.count==1);
  assert(!isParked(A) && !parkable());
  leave();
  assert(nothingCurrent() && !resume(A) && nothingCurrent() && resident.count==1);
  // The loop evicts it the next time it owns the table: here, a park. A
  // module loaded after the write is kept as usual.
  const unsigned evictionsBefore=resident.evictions;
  fakeLoad(B,1,512);
  assert(parkable());
  leave();
  assert(isParked(B) && resident.count==1 && resident.evictions==evictionsBefore+1);
  // ...or a fresh load making room, or a module's own allocation.
  noteStorageWrite();
  makeRoom();
  assert(resident.count==0 && resident.evictions==evictionsBefore+2);
  fakeLoad(B,1,512); leave();
  fakeLoad(C,2,512);
  noteStorageWrite();
  assert(moduleAlloc(16) && resident.count==0 && resident.evictions==evictionsBefore+3);
  leave();
  // A module parked and resumed keeps the generation it loaded under.
  fakeLoad(A,0,512); leave();
  assert(resume(A) && parkable());
  noteStorageWrite();
  assert(!parkable());
  leave();
  // The rebuild after a write: stale parked copies go, and so does the
  // running module, unloaded, when it is one of them. After a rebuild with
  // nothing written since, nothing is touched.
  fakeLoad(B,1,512); leave();
  fakeLoad(C,2,512);
  assert(!dropStale() && active==&descriptors[2] && isParked(B));
  noteStorageWrite();
  assert(dropStale() && nothingCurrent() && resident.count==0);
  assert(!dropStale());

  // Evicting a parked module frees exactly what unloading it would have:
  // the heap is back where it was before it loaded.
  const size_t empty=psramUsed;
  fakeLoad(A,0,512);
  assert(moduleAlloc(200));
  leave();
  assert(psramUsed>empty && resident.count==1);
  const unsigned evictedBefore=resident.evictions;
  dropParked();
  assert(psramUsed==empty && resident.count==0 && resident.evictions==evictedBefore+1);

  // A full table (3 here) makes room by its least recently used - never the
  // one the caller is about to resume.
  fakeLoad(A,0,512); leave();
  fakeLoad(B,1,512); leave();
  fakeLoad(C,2,512); leave();
  assert(resident.count==3);
  fakeLoad(D,3,512);
  const unsigned evicted=resident.evictions;
  leave(A);                                  // A is the oldest: B goes instead
  assert(resident.count==3 && isParked(A) && !isParked(B) && isParked(C) && isParked(D));
  assert(resident.evictions==evicted+1 && resume(A) && active==&descriptors[0]);

  // The same file parked twice is one slot: the older copy goes, whole.
  leave();                                   // A parked again: table C, D, A
  fakeLoad(A,4,512);                         // a second copy of the same file
  const size_t twoCopies=psramUsed;
  leave();
  assert(resident.count==3 && isParked(A) && psramUsed<twoCopies);
  assert(resume(A) && active==&descriptors[4]);
  leave();

  // Before a fresh load, parked modules go least recently used first until
  // PSRAM has the runtime limit plus the headroom free - and no further.
  dropParked();
  const size_t floorBytes=PF_MODULE_RUNTIME_MAX_BYTES+PF_MODULE_RESIDENT_HEADROOM;
  const size_t footprint=CODE+LINE+2000;
  psramSize=psramUsed+3*footprint+4000;      // three parked leave 4000 free
  fakeLoad(A,0,2000); leave();
  fakeLoad(B,1,2000); leave();
  fakeLoad(C,2,2000); leave();
  assert(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)<floorBytes);
  makeRoom();
  assert(!isParked(A) && isParked(B) && isParked(C));
  assert(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)>=floorBytes);
  // A floor that cannot be met empties the table, and goes no further.
  psramSize=psramUsed+100;
  makeRoom();
  assert(resident.count==0 && heap_caps_get_free_size(MALLOC_CAP_SPIRAM)<floorBytes);

  // api->alloc() while modules are parked may not leave less than the
  // headroom free: parked modules go, oldest first, only as many as that
  // takes, and the allocation is in PSRAM.
  const size_t headroom=PF_MODULE_RESIDENT_HEADROOM;
  psramSize=psramUsed+3*footprint+2000;
  fakeLoad(A,0,2000); leave();
  fakeLoad(B,1,2000); leave();
  fakeLoad(C,2,2000);                        // C runs with 2000 bytes free
  const uint32_t refusals=PFModuleMemory::refusals;
  assert(moduleAlloc(500) && isParked(A) && isParked(B));    // leaves 1500: nothing goes
  assert(moduleAlloc(700) && !isParked(A) && isParked(B));   // would leave 800: A goes
  assert(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)>=headroom);
  assert(runtimeInternalBytes==0 && runtimeBytes==1200 && PFModuleMemory::refusals==refusals);
  leave();
  dropParked();
  // When evicting every parked module cannot give it the headroom, the
  // allocation still gets what is free, as it would have before residency:
  // the headroom is never a refusal.
  const size_t small=CODE+LINE+100;
  psramSize=psramUsed+3*small+100;
  fakeLoad(A,0,100); leave();
  fakeLoad(B,1,100); leave();
  fakeLoad(C,2,100);                         // C runs with 100 bytes free
  assert(moduleAlloc(500) && resident.count==0 && runtimeInternalBytes==0);
  assert(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)<headroom);
  assert(PFModuleMemory::refusals==refusals);
  leave();
  dropParked();
  // Parking may not leave less than the headroom free either. Older parked
  // modules go first; one that alone holds the last of it is unloaded.
  psramSize=psramUsed+3*footprint+600;
  fakeLoad(A,0,2000); leave();
  fakeLoad(B,1,2000); leave();
  fakeLoad(C,2,2000);                        // C runs with 600 bytes free
  leave();
  assert(!isParked(A) && isParked(B) && isParked(C));
  assert(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)>=headroom);
  dropParked();
  psramSize=psramUsed+footprint+600;
  fakeLoad(A,0,2000);                        // alone, 600 bytes free
  leave();
  assert(resident.count==0 && nothingCurrent());
  psramSize=psramUsed+2*footprint+600;
  fakeLoad(A,0,2000); leave();
  fakeLoad(B,1,2000);                        // B runs with 600 bytes free
  leave(A);                                  // `keep` survives the floor
  assert(isParked(A) && !isParked(B) && nothingCurrent());
  dropParked();
  // PSRAM that refuses for want of a block, with plenty free: the refusal
  // costs the oldest parked module and PSRAM is asked again, before the
  // internal heap is - and no refusal is counted for a request that ended in
  // PSRAM.
  psramSize=psramUsed+3*footprint+20000;
  fakeLoad(A,0,2000); leave();
  fakeLoad(B,1,2000); leave();
  fakeLoad(C,2,2000);
  psramNoBlock=1;
  assert(moduleAlloc(100) && !isParked(A) && isParked(B));
  assert(runtimeInternalBytes==0 && PFModuleMemory::refusals==refusals);
  // Nothing left to give back: data()'s internal fallback, as before
  // residency, and the module can no longer be kept.
  psramNoBlock=3;
  assert(moduleAlloc(16) && resident.count==0 && runtimeInternalBytes==16 && !parkable());
  psramNoBlock=0;
  leave();

  // Everything given back.
  dropParked(); unload();
  psramSize=64*1024;
  assert(internalOwned.empty() && internalFree==100000);
  assert(psramOwned.size()==1);              // the table itself, kept for the boot
}

int main() {
  bookkeeping();
  loader();
  puts("PASS: resident table (park/take/peek/LRU/keep/double park/evict-until/evict-if/no table) and the loader's park/resume/unload/evict, storage generation, floor, alloc headroom and backstop");
}
