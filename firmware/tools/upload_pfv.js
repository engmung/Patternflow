#!/usr/bin/env node
/**
 * upload_pfv.js — Upload PFV files to Patternflow ESP32 via Serial
 *
 * Usage:
 *   node upload_pfv.js <COM_PORT> <file.pfv>
 *
 * Example:
 *   node upload_pfv.js COM3 clip_128x64_12fps.pfv
 *
 * Requirements:
 *   npm install serialport
 *
 * The ESP32 firmware must be running with the Video pattern loaded.
 * The script sends "PFV:<filename>:<size>\n" then the raw binary data.
 */

const { SerialPort } = require("serialport");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node upload_pfv.js <COM_PORT> <file.pfv>");
  console.log("Example: node upload_pfv.js COM3 my_video.pfv");
  process.exit(1);
}

const portPath = args[0];
const filePath = args[1];

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const fileData = fs.readFileSync(filePath);
const fileName = path.basename(filePath);
const fileSize = fileData.length;

// Validate PFV1 header. The web baker writes the canonical 64-byte header:
// magic, headerSize, width, height, fpsMilli (fps * 1000), frameCount, format.
const PFV_HEADER_SIZE = 64;
const PFV_WIDTH = 128;
const PFV_HEIGHT = 64;
const PFV_FORMAT_RGB565_LE = 0x01;
const PFV_FRAME_BYTES = PFV_WIDTH * PFV_HEIGHT * 2;

if (fileData.length < PFV_HEADER_SIZE || fileData.toString("ascii", 0, 4) !== "PFV1") {
  console.error("Not a valid PFV1 file");
  process.exit(1);
}

const headerSize = fileData.readUInt16LE(4);
const width = fileData.readUInt16LE(6);
const height = fileData.readUInt16LE(8);
const fpsMilli = fileData.readUInt16LE(10);
const frameCount = fileData.readUInt32LE(12);
const format = fileData[16];
const expectedSize = headerSize + frameCount * PFV_FRAME_BYTES;

if (
  headerSize !== PFV_HEADER_SIZE ||
  width !== PFV_WIDTH ||
  height !== PFV_HEIGHT ||
  format !== PFV_FORMAT_RGB565_LE
) {
  console.error(
    `Unsupported PFV1 header: header=${headerSize}, size=${width}x${height}, format=0x${format.toString(16)}`
  );
  process.exit(1);
}

if (fileData.length !== expectedSize) {
  console.error(`PFV1 size mismatch: expected ${expectedSize} bytes, got ${fileData.length}`);
  process.exit(1);
}

const fps = (fpsMilli / 1000).toFixed(1);
console.log(
  `File: ${fileName} (${(fileSize / 1024).toFixed(1)} KB, ${frameCount} frames, ${fps} fps)`
);

const port = new SerialPort({
  path: portPath,
  baudRate: 115200,
});

let responseBuffer = "";

port.on("open", () => {
  console.log(`Connected to ${portPath}`);
  console.log(`Sending upload command...`);

  // Wait a moment for ESP32 to be ready
  setTimeout(() => {
    const cmd = `PFV:${fileName}:${fileSize}\n`;
    port.write(cmd);
  }, 500);
});

port.on("data", (data) => {
  responseBuffer += data.toString();
  const lines = responseBuffer.split("\n");
  responseBuffer = lines.pop(); // keep incomplete line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    console.log(`  ESP32: ${trimmed}`);

    if (trimmed.startsWith("READY:")) {
      console.log(`Uploading ${(fileSize / 1024).toFixed(1)} KB...`);
      sendData();
    } else if (trimmed.startsWith("OK:")) {
      const bytes = parseInt(trimmed.split(":")[1]);
      console.log(`\n✓ Upload complete! ${bytes} bytes written to FATFS`);
      setTimeout(() => {
        port.close();
        process.exit(0);
      }, 500);
    } else if (trimmed.startsWith("ERR:")) {
      console.error(`\n✗ Upload failed: ${trimmed}`);
      port.close();
      process.exit(1);
    }
  }
});

port.on("error", (err) => {
  console.error(`Serial error: ${err.message}`);
  process.exit(1);
});

function sendData() {
  const CHUNK_SIZE = 2048;
  let offset = 0;

  function sendNextChunk() {
    if (offset >= fileSize) return;

    const end = Math.min(offset + CHUNK_SIZE, fileSize);
    const chunk = fileData.subarray(offset, end);

    port.write(chunk, (err) => {
      if (err) {
        console.error(`Write error: ${err.message}`);
        return;
      }

      offset = end;
      const pct = Math.round((offset / fileSize) * 100);
      process.stdout.write(
        `\r  Progress: ${pct}% (${(offset / 1024).toFixed(0)}/${(fileSize / 1024).toFixed(0)} KB)`
      );

      // Small delay between chunks to avoid buffer overflow
      setTimeout(sendNextChunk, 5);
    });
  }

  sendNextChunk();
}
