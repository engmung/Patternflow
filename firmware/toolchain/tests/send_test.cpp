#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cerrno>
#include <vector>
#include <algorithm>
#define memcpy_P memcpy
#define strlen_P strlen
constexpr int MSG_DONTWAIT=64;
static uint32_t nowMs=0, lastPoll=0, maxGap=0, polls=0;
static bool connected=true, callerOnLoop=false;
static int scenario=0, sends=0;
static std::vector<uint8_t> received;
static uint32_t millis() { return nowMs; }
static void delay(unsigned ms) { nowMs+=ms; }
struct Log { template<class... T> void printf(const char*,T...) {} } Serial;
struct WiFiClient {
  bool connected() const { return ::connected; }
  int fd() const { return 1; }
  void stop() { ::connected=false; }
};
struct WebServer {
  WiFiClient client() { return {}; }
  void sendHeader(const char*,const char*) {}
  void setContentLength(size_t) {}
  void send(int,const char*,const char*) {}
};
namespace PFLoopSync { bool onLoopTask() { return callerOnLoop; } }
namespace PFNetMaintenance {
void poll() { ++polls; maxGap=std::max(maxGap,nowMs-lastPoll); lastPoll=nowMs; }
}
static int send(int fd,const void* data,size_t n,int flags) {
  assert(fd==1 && flags==MSG_DONTWAIT); ++sends;
  if(scenario==1 || (scenario==0 && sends%3==0)) { errno=EAGAIN; return -1; }
  if(scenario==2) { errno=ECONNRESET; return -1; }
  if(scenario==3) { errno=EINTR; return -1; }
  if(scenario==4) { delay(19000); n=1; } // progress, but total ceiling still applies
  n=std::min(n,size_t(127));
  auto p=static_cast<const uint8_t*>(data); received.insert(received.end(),p,p+n);
  return static_cast<int>(n);
}
#include "core_send.h"
static void reset(int which,bool loop=false) {
  scenario=which;callerOnLoop=loop;nowMs=lastPoll=maxGap=polls=0;sends=0;connected=true;received.clear();
}
int main() {
  WebServer server;
  std::vector<uint8_t> source(12345);
  for(size_t i=0;i<source.size();++i) source[i]=static_cast<uint8_t>(i*17);
  reset(0); PFSend::drain(server,source.data(),source.size());
  assert(received==source && connected && maxGap<=5 && polls>100);
  reset(1); PFSend::drain(server,source.data(),source.size());
  assert(!connected && received.empty() && nowMs>20000 && nowMs<=20005 && maxGap<=5);
  reset(1,true); PFSend::drain(server,source.data(),source.size());
  assert(!connected && nowMs>5000 && nowMs<=5005);
  reset(2); PFSend::drain(server,source.data(),source.size());
  assert(!connected && sends==1 && nowMs==0);
  reset(3); PFSend::drain(server,source.data(),source.size());
  assert(!connected && nowMs<=20005 && received.empty());
  reset(4); PFSend::drain(server,source.data(),source.size());
  assert(!connected && nowMs>120000 && received.size()==7);
  puts("PASS: partial writes preserve bytes; EAGAIN/EINTR yield; disconnect, loop budget and total ceiling terminate");
}
