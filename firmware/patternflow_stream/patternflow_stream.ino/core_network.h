#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include "core_streaming.h"
#include "web_index.h"

#define PF_WIFI_STA  1
#define PF_WIFI_AP   0

// Default placeholders. Override per-device via stream_secrets.h
// (gitignored). Copy stream_secrets.example.h to stream_secrets.h.
#define PF_STREAM_WIFI_SSID "YOUR_WIFI_SSID"
#define PF_STREAM_WIFI_PASS "YOUR_WIFI_PASSWORD"
#define PF_STREAM_AP_SSID   "PatternFlow"
#define PF_STREAM_AP_PASS   "patternflow"

#if __has_include("stream_secrets.h")
#include "stream_secrets.h"
#endif

#if PF_WIFI_STA
  static const char* WIFI_SSID = PF_STREAM_WIFI_SSID;
  static const char* WIFI_PASS = PF_STREAM_WIFI_PASS;
#elif PF_WIFI_AP
  static const char* AP_SSID = PF_STREAM_AP_SSID;
  static const char* AP_PASS = PF_STREAM_AP_PASS;
#endif

static const char* MDNS_NAME = "patternflow";

WebServer        httpServer(80);
WebSocketsServer wsStream(81);
WebSocketsServer wsControl(82);

uint32_t wsStreamClientCount = 0;

void initNetwork() {
#if PF_WIFI_STA
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // 중요: WiFi sleep 끔, 응답성 향상
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(300); Serial.print(".");
  }
  Serial.printf("\nIP: %s\n", WiFi.localIP().toString().c_str());
#else
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.setSleep(false);
  Serial.printf("AP: %s  IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
#endif

  if (MDNS.begin(MDNS_NAME)) {
    Serial.printf("mDNS: http://%s.local\n", MDNS_NAME);
  }
}

void onStreamEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsStreamClientCount++;
      Serial.printf("[/stream] +client #%u (total %u)\n", num, wsStreamClientCount);
      break;
    case WStype_DISCONNECTED:
      if (wsStreamClientCount > 0) wsStreamClientCount--;
      Serial.printf("[/stream] -client #%u (total %u)\n", num, wsStreamClientCount);
      break;
    case WStype_BIN:
      handleStreamChunk(payload, length);
      break;
    case WStype_ERROR:
      Serial.printf("[/stream] error #%u\n", num);
      break;
    default: break;
  }
}

void onControlEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[/control] +client #%u\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[/control] -client #%u\n", num);
      break;
    case WStype_TEXT: {
      // 노브 로그는 너무 많이 찍히니 hello만 응답
      String msg((const char*)payload, length);
      if (msg.indexOf("\"hello\"") >= 0) {
        Serial.printf("[/control] handshake from #%u\n", num);
        char ack[160];
        snprintf(ack, sizeof(ack),
          "{\"type\":\"hello_ack\",\"width\":%d,\"height\":%d,"
          "\"format\":\"RGB888\",\"chunkRows\":4}",
          PANEL_RES_W, PANEL_RES_H);
        wsControl.sendTXT(num, ack);
      }
      break;
    }
    default: break;
  }
}

void initWebServer() {
  httpServer.on("/", HTTP_GET, []() {
    httpServer.send_P(200, "text/html; charset=utf-8", INDEX_HTML);
  });
  httpServer.onNotFound([]() {
    httpServer.send(404, "text/plain", "Not Found");
  });
  httpServer.begin();

  wsStream.begin();
  wsStream.onEvent(onStreamEvent);

  wsControl.begin();
  wsControl.onEvent(onControlEvent);

  Serial.println("HTTP:80  WS-stream:81  WS-control:82");
}