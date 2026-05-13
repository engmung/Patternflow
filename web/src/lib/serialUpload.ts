/**
 * Web Serial PFV uploader.
 *
 * Sends PFV data directly to an ESP32 running the Patternflow firmware.
 * Protocol: "PFV:<filename>:<size>\n" followed by raw PFV bytes.
 *
 * License: MIT
 */

export function supportsWebSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export interface UploadProgress {
  phase: "connecting" | "sending" | "done" | "error";
  percent: number;
  message: string;
}

export interface DeviceFile {
  name: string;
  size: number;
}

export interface DeviceInfo {
  files: DeviceFile[];
  freeBytes: number;
}

export async function uploadPfvToDevice(
  pfvData: ArrayBuffer,
  filename: string,
  onProgress: (p: UploadProgress) => void,
): Promise<void> {
  if (!supportsWebSerial()) {
    throw new Error("Web Serial is not supported. Use Chrome or Edge.");
  }

  onProgress({ phase: "connecting", percent: 0, message: "Select the ESP32 COM port." });

  const port = await requestAndOpenPort();
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    writer = port.writable!.getWriter();
    reader = port.readable!.getReader();

    const cmd = `PFV:${filename}:${pfvData.byteLength}\n`;
    await writer.write(new TextEncoder().encode(cmd));

    onProgress({ phase: "connecting", percent: 0, message: "Waiting for ESP32..." });

    const ready = await waitForLine(reader, "READY:", 5000);
    if (!ready) {
      throw new Error("ESP32 did not respond. Flash the latest firmware, reset the board, and close other serial tools.");
    }

    onProgress({ phase: "sending", percent: 0, message: "Uploading..." });

    const chunkSize = 2048;
    const data = new Uint8Array(pfvData);
    let sent = 0;

    while (sent < data.length) {
      const end = Math.min(sent + chunkSize, data.length);
      await writer.write(data.subarray(sent, end));
      sent = end;

      const pct = Math.round((sent / data.length) * 100);
      onProgress({
        phase: "sending",
        percent: pct,
        message: `${pct}% - ${(sent / 1024).toFixed(0)}/${(data.length / 1024).toFixed(0)} KB`,
      });

      await sleep(3);
    }

    const result = await waitForLine(reader, "OK:", 15000);
    if (!result) throw new Error("Upload timed out or failed.");

    onProgress({ phase: "done", percent: 100, message: "Upload complete." });
  } finally {
    reader?.releaseLock();
    writer?.releaseLock();
    await closePort(port);
  }
}

export async function listDeviceFiles(): Promise<DeviceInfo> {
  const lines = await sendSerialCommand("PFV:LIST");
  const files: DeviceFile[] = [];
  let freeBytes = 0;

  for (const line of lines) {
    if (line.startsWith("FILE:")) {
      const parts = line.substring(5).split(":");
      files.push({ name: parts[0], size: parseInt(parts[1]) || 0 });
    } else if (line.startsWith("FREE:")) {
      freeBytes = parseInt(line.substring(5)) || 0;
    }
  }
  return { files, freeBytes };
}

export async function clearDeviceFiles(): Promise<number> {
  const lines = await sendSerialCommand("PFV:CLEAR");
  const freeLine = lines.find((l) => l.startsWith("FREE:"));
  return freeLine ? parseInt(freeLine.substring(5)) || 0 : 0;
}

export async function deleteDeviceFile(filename: string): Promise<void> {
  const name = filename.startsWith("/") ? filename.substring(1) : filename;
  await sendSerialCommand(`PFV:DELETE:${name}`);
}

async function sendSerialCommand(cmd: string, timeoutMs = 5000): Promise<string[]> {
  if (!supportsWebSerial()) {
    throw new Error("Web Serial is not supported. Use Chrome or Edge.");
  }

  const port = await requestAndOpenPort();
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    writer = port.writable!.getWriter();
    reader = port.readable!.getReader();

    await writer.write(new TextEncoder().encode(cmd + "\n"));

    const lines = await readLinesUntil(reader, timeoutMs, (line) =>
      line.startsWith("FREE:") || line.startsWith("OK:"),
    );

    if (lines.length === 0) {
      throw new Error("ESP32 did not respond. Flash the latest firmware, reset the board, and close other serial tools.");
    }

    return lines;
  } finally {
    reader?.releaseLock();
    writer?.releaseLock();
    await closePort(port);
  }
}

async function requestAndOpenPort(): Promise<SerialPort> {
  let port: SerialPort;
  try {
    port = await navigator.serial.requestPort();
  } catch {
    throw new Error("No port selected. Choose the ESP32 COM port in the browser dialog.");
  }

  try {
    await port.open({ baudRate: 115200 });
  } catch {
    throw new Error("Could not open the serial port. Close Arduino Serial Monitor or any other app using it.");
  }

  return port;
}

async function closePort(port: SerialPort): Promise<void> {
  try {
    await port.close();
  } catch {
    // Ignore close errors after failed serial operations.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  prefix: string,
  timeoutMs: number,
): Promise<string | null> {
  const lines = await readLinesUntil(reader, timeoutMs, (line) => line.startsWith(prefix));
  return lines.find((line) => line.startsWith(prefix)) ?? null;
}

async function readLinesUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  shouldStop: (line: string) => boolean,
): Promise<string[]> {
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      sleep(100).then(() => ({ value: undefined, done: false })),
    ]);

    if (done) break;
    if (value) buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      if (line.startsWith("ERR:")) throw new Error(`ESP32: ${line}`);
      lines.push(line);
      if (shouldStop(line)) return lines;
    }
  }

  return lines;
}
