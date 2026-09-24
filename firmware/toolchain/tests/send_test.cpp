#include <cassert>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cerrno>
#include <string>
#include <vector>
#include <algorithm>
#include <utility>
#define memcpy_P memcpy
#define strlen_P strlen
#define PF_IMPROV_FW_VERSION "0.0.0-test"
constexpr int MSG_DONTWAIT=64;
static uint32_t nowMs=0, lastPoll=0, maxGap=0, polls=0;
static bool connected=true, callerOnLoop=false;
static int scenario=0, sends=0;
static std::vector<uint8_t> received;
static uint32_t millis() { return nowMs; }
static void delay(unsigned ms) { nowMs+=ms; }
struct Log { template<class... T> void printf(const char*,T...) {} } Serial;

// What esptool stamped into the app descriptor, as the IDF call reports it:
// hex pairs, as many as fit before the NUL. All zeros is an image built
// without --elf-sha256-offset.
static const char* elfSha="";
static int esp_ota_get_app_elf_sha256(char* dst,size_t size) {
  const size_t n=std::min((size-1)/2*2,strlen(elfSha));
  memcpy(dst,elfSha,n); dst[n]='\0';
  return static_cast<int>(n+1);
}

// The server as core_send.h uses it. Every call lands in `calls`, in order,
// so a test can say what was read before the first header went out and what
// a response consisted of.
using String=std::string;
enum HTTPMethod { HTTP_DELETE, HTTP_GET, HTTP_HEAD, HTTP_POST, HTTP_PUT };
struct WiFiClient {
  bool connected() const { return ::connected; }
  int fd() const { return 1; }
  void stop() { ::connected=false; }
};
struct Arg { String key, value; };
static bool sameName(const String& a,const String& b) {
  return a.size()==b.size() && std::equal(a.begin(),a.end(),b.begin(),[](char x,char y){
    return std::tolower(static_cast<unsigned char>(x))==std::tolower(static_cast<unsigned char>(y)); });
}
struct WebServer {
  // The request.
  String host, path="/";
  HTTPMethod verb=HTTP_GET;
  std::vector<Arg> query, headersIn;
  // The response.
  std::vector<String> calls;
  std::vector<Arg> headersOut;

  WiFiClient client() { return {}; }
  String hostHeader() { calls.push_back("read host"); return host; }
  String uri() { calls.push_back("read uri"); return path; }
  HTTPMethod method() { calls.push_back("read method"); return verb; }
  int args() { calls.push_back("read args"); return static_cast<int>(query.size()); }
  String argName(int i) { calls.push_back("read argName"); return query.at(static_cast<size_t>(i)).key; }
  String arg(int i) { calls.push_back("read arg#"); return query.at(static_cast<size_t>(i)).value; }
  String arg(const String& name) {
    calls.push_back("read arg "+name);
    for(auto& a:query) if(a.key==name) return a.value;
    return "";
  }
  bool hasArg(const String& name) {
    calls.push_back("read hasArg "+name);
    for(auto& a:query) if(a.key==name) return true;
    return false;
  }
  String header(const String& name) {
    calls.push_back("read header "+name);
    for(auto& h:headersIn) if(sameName(h.key,name)) return h.value;
    return "";
  }
  bool hasHeader(const String& name) {
    calls.push_back("read hasHeader "+name);
    for(auto& h:headersIn) if(sameName(h.key,name) && !h.value.empty()) return true;
    return false;
  }
  void sendHeader(const String& name,const String& value,bool=false) {
    calls.push_back("header "+name+": "+value); headersOut.push_back({name,value});
  }
  void setContentLength(size_t n) { calls.push_back("length "+std::to_string(n)); }
  void send(int code,const char* type,const char* body) {
    assert(body && !*body);  // every send() here is headers only; bodies are drained
    calls.push_back("send "+std::to_string(code)+" "+type);
  }
  void send(int code) { calls.push_back("send "+std::to_string(code)); }

  String out(const char* name) const {
    for(auto& h:headersOut) if(h.key==name) return h.value;
    return "";
  }
  bool has(const char* name) const {
    for(auto& h:headersOut) if(h.key==name) return true;
    return false;
  }
  // The calls from the first header on: the response as it went out.
  std::vector<String> response() const {
    auto first=std::find_if(calls.begin(),calls.end(),[](const String& c){ return c.rfind("read ",0)!=0; });
    return std::vector<String>(first,calls.end());
  }
  // Nothing was read once a header had been queued: the decision was whole
  // before the response began.
  bool decidedFirst() const {
    bool writing=false;
    for(auto& c:calls) {
      const bool read=c.rfind("read ",0)==0;
      if(writing && read) return false;
      if(!read) writing=true;
    }
    return true;
  }
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

// gzip -n of "<!doctype html><title>t</title>\n": CRC-32 2ede181e, 32 bytes.
static const uint8_t PAGE_GZ[]={
  0x1f,0x8b,0x08,0x00,0x00,0x00,0x00,0x00,0x02,0xff,0xb3,0x51,0x4c,0xc9,0x4f,0x2e,
  0xa9,0x2c,0x48,0x55,0xc8,0x28,0xc9,0xcd,0xb1,0xb3,0x29,0xc9,0x2c,0xc9,0x49,0xb5,
  0x2b,0xb1,0xd1,0x87,0x30,0xb8,0x00,0x1e,0x18,0xde,0x2e,0x20,0x00,0x00,0x00};
static const char* PAGE_ETAG="W/\"2ede181e-20\"";
static const char* BUILD="0badf00d";

// One request through gz(): a fresh server with the given Host, query and
// If-None-Match, and the drain's socket reset. scenario 5 accepts every byte.
static WebServer request(const char* host,std::vector<Arg> query,const char* inm,
                         const char* type,const char* policy,
                         const uint8_t* body=PAGE_GZ,size_t len=sizeof(PAGE_GZ),
                         HTTPMethod verb=HTTP_GET,const char* path="/patterns") {
  reset(5);
  WebServer s;
  s.host=host; s.path=path; s.verb=verb; s.query=std::move(query);
  if(inm) s.headersIn.push_back({"if-none-match",inm});
  PFSend::gz(s,body,len,type,policy);
  assert(s.decidedFirst());
  return s;
}
static bool drained(const uint8_t* body,size_t len) {
  return received==std::vector<uint8_t>(body,body+len);
}

static void testDrain() {
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
}

static void testBuildId() {
  // FNV-1a reference vectors.
  assert(PFBuild::fnv1a32("")==0x811c9dc5u);
  assert(PFBuild::fnv1a32("a")==0xe40c292cu);
  assert(PFBuild::fnv1a32("foobar")==0xbf9cf968u);
  char out[9];
  elfSha="3f9a0c1e5b7d2a40c0ffee00deadbeef"; PFBuild::compute(out);
  assert(strcmp(out,"3f9a0c1e")==0);
  // Unstamped image, or nothing reported: the compile-time hash, never zeros.
  char fallback[9];
  snprintf(fallback,sizeof(fallback),"%08x",
           static_cast<unsigned>(PFBuild::fnv1a32(__DATE__ " " __TIME__ " " PF_IMPROV_FW_VERSION)));
  elfSha="00000000000000000000000000000000"; PFBuild::compute(out);
  assert(strcmp(out,fallback)==0 && strcmp(out,"00000000")!=0);
  elfSha=""; PFBuild::compute(out);
  assert(strcmp(out,fallback)==0);
  // id() computes once: what the descriptor says later does not move it.
  elfSha="0badf00d00000000"; const char* id=PFBuild::id();
  assert(strcmp(id,BUILD)==0);
  elfSha="ffffffffffffffff";
  assert(PFBuild::id()==id && strcmp(PFBuild::id(),BUILD)==0);
}

static void testHelpers() {
  PFSend::Trailer t{};
  assert(!PFSend::trailerOf(nullptr,40,t));
  assert(!PFSend::trailerOf(PAGE_GZ,17,t));
  assert(PFSend::trailerOf(PAGE_GZ,sizeof(PAGE_GZ),t) && t.crc==0x2ede181eu && t.isize==0x20);
  char etag[PFSend::ETAG_BYTES];
  PFSend::formatEtag(t,etag,sizeof(etag));
  assert(strcmp(etag,PAGE_ETAG)==0);
  PFSend::formatEtag({0xffffffffu,0xffffffffu},etag,sizeof(etag));
  assert(strcmp(etag,"W/\"ffffffff-ffffffff\"")==0);
  PFSend::formatEtag({0,0},etag,sizeof(etag));
  assert(strcmp(etag,"W/\"00000000-0\"")==0);

  // If-None-Match: weak comparison, lists, "*", and junk that must not match.
  const char* tag=PAGE_ETAG;
  assert(PFSend::inmMatches("W/\"2ede181e-20\"",tag));
  assert(PFSend::inmMatches("\"2ede181e-20\"",tag));
  assert(PFSend::inmMatches("\"2ede181e-20\"","\"2ede181e-20\""));
  assert(PFSend::inmMatches("W/\"aaaa\", W/\"2ede181e-20\"",tag));
  assert(PFSend::inmMatches("\"x\",\t\"2ede181e-20\"",tag));
  assert(PFSend::inmMatches("*",tag));
  assert(PFSend::inmMatches("junk, W/\"2ede181e-20\"",tag));
  assert(!PFSend::inmMatches("W/\"2ede181e-21\"",tag));
  assert(!PFSend::inmMatches("W/\"2ede181e-20",tag));
  assert(!PFSend::inmMatches("\"2ede181e-20x\"",tag));
  assert(!PFSend::inmMatches("\"2ede181e-2\"",tag));
  assert(!PFSend::inmMatches("2ede181e-20",tag));
  assert(!PFSend::inmMatches("",tag));
  assert(!PFSend::inmMatches(nullptr,tag));
  assert(!PFSend::inmMatches(",,, ",tag));

  // Hosts that can only be the panel, and ones that can be anything.
  for(const char* h:{"192.168.1.42","192.168.4.1:80","10.0.0.1","patternflow","patternflow:8080",
                     "PATTERNFLOW","patternflow.local","Patternflow-A1B2.LOCAL","patternflow.local:80",
                     "patternflow.local.","a.local","[fe80::1]","[fe80::1]:80","fe80::1","localhost"}) {
    if(!PFSend::hostCacheable(h)) { std::printf("expected cacheable: %s\n",h); assert(false); }
  }
  for(const char* h:{"","example.com","connectivitycheck.gstatic.com","captive.apple.com:80",
                     "patternflow.local.example.com","1.2.3","1.2.3.4.5","256.1.1.1","1.2.3.4:",
                     ".local","192.168.1.1.nip.io","patternflow.lan"}) {
    if(PFSend::hostCacheable(h)) { std::printf("expected not cacheable: %s\n",h); assert(false); }
  }
  assert(!PFSend::hostCacheable(nullptr));

  // The decision table.
  using PFSend::Reply;
  auto d=PFSend::decide(false,false,BUILD,BUILD,tag,tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_NO_STORE && !d.etag);
  d=PFSend::decide(false,true,"",BUILD,nullptr,tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_REVALIDATE && d.etag);
  d=PFSend::decide(false,true,nullptr,BUILD,tag,tag);
  assert(d.reply==Reply::NotModified && d.cacheControl==PFSend::CC_REVALIDATE && d.etag);
  d=PFSend::decide(false,true,BUILD,BUILD,"",tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_IMMUTABLE && d.etag);
  d=PFSend::decide(false,true,BUILD,BUILD,tag,tag);
  assert(d.reply==Reply::NotModified && d.cacheControl==PFSend::CC_IMMUTABLE);
  d=PFSend::decide(false,true,"12345678",BUILD,tag,tag);
  assert(d.reply==Reply::Redirect && d.cacheControl==PFSend::CC_NO_STORE && !d.etag);
  d=PFSend::decide(true,true,"2ede181e","2ede181e",tag,tag);
  assert(d.reply==Reply::NotModified && d.cacheControl==PFSend::CC_IMMUTABLE && d.etag);
  d=PFSend::decide(true,true,"deadbeef","2ede181e",tag,tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_NO_STORE && !d.etag);
  d=PFSend::decide(true,true,"","2ede181e",nullptr,tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_REVALIDATE && d.etag);
  d=PFSend::decide(true,false,"2ede181e","2ede181e",tag,tag);
  assert(d.reply==Reply::Full && d.cacheControl==PFSend::CC_NO_STORE && !d.etag);

  String escaped;
  PFSend::appendEscaped(escaped,"a b&c=d/\xc3\xa9~-._");
  assert(escaped=="a%20b%26c%3Dd%2F%C3%A9~-._");
}

static void testResponses() {
  const size_t len=sizeof(PAGE_GZ);
  const String lenCall="length "+std::to_string(len);

  // A bare page URL: kept, but asked about every time.
  auto s=request("192.168.1.42",{},nullptr,"text/html",PFSend::PAGE);
  assert((s.response()==std::vector<String>{"header Cache-Control: no-cache",
         String("header ETag: ")+PAGE_ETAG,"header Content-Encoding: gzip",lenCall,"send 200 text/html"}));
  assert(drained(PAGE_GZ,len));

  // ...and when the browser has it: a 304 with the 200's length, no body.
  s=request("patternflow.local",{},PAGE_ETAG,"text/html",PFSend::PAGE);
  assert((s.response()==std::vector<String>{String("header ETag: ")+PAGE_ETAG,
         "header Cache-Control: no-cache",lenCall,"send 304 text/html"}));
  assert(sends==0 && received.empty());

  // The running build's URL: immutable, and a 304 says so too.
  s=request("192.168.1.42",{{"v",BUILD}},nullptr,"text/html",PFSend::PAGE);
  assert(s.out("Cache-Control")==PFSend::CC_IMMUTABLE && s.out("ETag")==PAGE_ETAG);
  assert(s.response().back()=="send 200 text/html" && drained(PAGE_GZ,len));
  s=request("192.168.1.42",{{"v",BUILD}},"W/\"x\", \"2ede181e-20\"","text/html",PFSend::PAGE);
  assert((s.response()==std::vector<String>{String("header ETag: ")+PAGE_ETAG,
         String("header Cache-Control: ")+PFSend::CC_IMMUTABLE,lenCall,"send 304 text/html"}));
  assert(sends==0);

  // Another build's URL: a redirect to this one, every other argument kept
  // in order and escaped again, no body, nothing kept.
  s=request("192.168.1.42",{{"src","http://x/y?z"},{"v","12345678"},{"n","a b"}},PAGE_ETAG,
            "text/html",PFSend::PAGE);
  assert((s.response()==std::vector<String>{
         "header Location: /patterns?src=http%3A%2F%2Fx%2Fy%3Fz&v=0badf00d&n=a%20b",
         "header Cache-Control: no-store","send 302 text/plain"}));
  assert(sends==0 && !s.has("ETag"));
  // A POST's arguments came in its body, and never go into a URL.
  s=request("192.168.1.42",{{"v","12345678"},{"pass","secret"}},nullptr,"text/html",PFSend::PAGE,
            PAGE_GZ,len,HTTP_POST,"/");
  assert(s.out("Location")=="/?v=0badf00d" && sends==0);

  // A Host that could be anyone's: nothing kept, no validator, even for a
  // URL and an If-None-Match that would otherwise be a 304.
  for(const char* host:{"connectivitycheck.gstatic.com",""}) {
    s=request(host,{{"v",BUILD}},PAGE_ETAG,"text/html",PFSend::PAGE);
    assert((s.response()==std::vector<String>{"header Cache-Control: no-store",
           "header Content-Encoding: gzip",lenCall,"send 200 text/html"}));
    assert(drained(PAGE_GZ,len));
  }

  // The chrome, keyed by its own CRC.
  s=request("192.168.4.1",{{"h","2ede181e"}},PAGE_ETAG,"application/javascript",PFSend::STAMPED);
  assert((s.response()==std::vector<String>{String("header ETag: ")+PAGE_ETAG,
         String("header Cache-Control: ")+PFSend::CC_IMMUTABLE,lenCall,"send 304 application/javascript"}));
  s=request("192.168.4.1",{{"h","deadbeef"}},PAGE_ETAG,"application/javascript",PFSend::STAMPED);
  assert(s.out("Cache-Control")=="no-store" && !s.has("ETag"));
  assert(s.response().back()=="send 200 application/javascript" && drained(PAGE_GZ,len));
  s=request("192.168.4.1",{},nullptr,"application/javascript",PFSend::STAMPED);
  assert(s.out("Cache-Control")=="no-cache" && s.out("ETag")==PAGE_ETAG && drained(PAGE_GZ,len));
  // A page's v means nothing to the chrome, and h nothing to a page.
  s=request("192.168.4.1",{{"v","12345678"}},nullptr,"application/javascript",PFSend::STAMPED);
  assert(s.out("Cache-Control")=="no-cache" && !s.has("Location"));
  s=request("192.168.4.1",{{"h","deadbeef"}},nullptr,"text/html",PFSend::PAGE);
  assert(s.out("Cache-Control")=="no-cache" && !s.has("Location"));

  // A literal Cache-Control is the old behaviour: sent as is, never a 304.
  s=request("192.168.1.42",{},PAGE_ETAG,"application/javascript","public, max-age=86400");
  assert((s.response()==std::vector<String>{"header Cache-Control: public, max-age=86400",
         "header Content-Encoding: gzip",lenCall,"send 200 application/javascript"}));
  assert(drained(PAGE_GZ,len));

  // Too short to carry a gzip trailer: served, never kept or validated.
  s=request("192.168.1.42",{{"v",BUILD}},PAGE_ETAG,"text/html",PFSend::PAGE,PAGE_GZ,10);
  assert(s.out("Cache-Control")=="no-store" && !s.has("ETag") && drained(PAGE_GZ,10));

  // The favicon's 204: kept for a year on the panel's own names, and under
  // the same Host rule as pages, never under a site the phone was reaching.
  const std::pair<const char*,const char*> icons[]={
    {"192.168.4.1",PFSend::CC_IMMUTABLE},{"patternflow.local:80",PFSend::CC_IMMUTABLE},
    {"neverssl.com",PFSend::CC_NO_STORE},{"",PFSend::CC_NO_STORE}};
  for(const auto& icon:icons) {
    WebServer f;
    f.host=icon.first;
    PFSend::noContent(f);
    assert(f.decidedFirst());
    assert((f.response()==std::vector<String>{String("header Cache-Control: ")+icon.second,"send 204"}));
  }
}

int main() {
  testDrain();
  testBuildId();
  testHelpers();
  testResponses();
  puts("PASS: partial writes preserve bytes; EAGAIN/EINTR yield; disconnect, loop budget and total ceiling terminate");
  puts("PASS: build id; ETag, If-None-Match, Host gating and the PAGE/STAMPED table; 304/302/200 decided before any header, 304 carries the 200's length and no body; the favicon's 204 is Host-gated too");
}
