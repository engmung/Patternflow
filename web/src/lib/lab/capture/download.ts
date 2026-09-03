// ── Save-to-disk ─────────────────────────────────────────────────────────────

import type { MatrixSize } from "@/lib/pattern/matrix";

function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "pattern";
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function captureFileName(
  title: string,
  output: MatrixSize,
  extension: string,
  date = new Date(),
): string {
  return `patternflow-${slug(title)}-${output.width}x${output.height}-${stamp(date)}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke late: Firefox starts the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
