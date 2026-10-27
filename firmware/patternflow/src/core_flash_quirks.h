// ═══════════════════════════════════════════════════════════
// PatternFlow - Flash quirks
//
// ── Macronix flash: driver reads in a mode that works (issue #424) ──────
// On a board whose flash is a Macronix part (JEDEC c2xxxx, seen: c22018),
// core 2.0.17 / IDF v4.4.7 returns wrong bytes when the flash driver (SPI1)
// reads in QIO or DIO, the two modes that send the address over more than
// one line. Measured on such a board, 16 sectors of a freshly formatted
// volume read through esp_partition_read against their memory-mapped copy:
//
//   QIO, DIO                      13 of 16 sectors wrong (20,568 bytes)
//   QOUT, DOUT, FASTRD, SLOWRD    16 of 16 correct
//
// Everything that reads through the driver is hit: NVS, the OTA checks,
// wear levelling and FATFS. Wear levelling misreads its own state, so a
// Format "does not stick" and the pattern volume never mounts. Code and
// constants are fetched by the cache (SPI0), not by the driver, and are not
// affected. The same board mounts the same volume fine on core 3.x.
//
// So on a Macronix chip the driver reads with the address on one line:
// QIO becomes QOUT (data still on four lines), DIO becomes DOUT. Any other
// chip, and any build that already reads that way, is left as it was. The
// cache keeps its own mode; only the driver's read command changes, and
// writes and erases never used these modes.
//
// A global constructor, because of when it runs: after IDF has detected the
// chip (do_core_init comes before do_global_ctors) and before initArduino()
// opens NVS, so every read through the driver after boot takes the safe mode.
// ═══════════════════════════════════════════════════════════

#pragma once

#include <esp_flash.h>

__attribute__((constructor)) static void pfFlashMacronixReadMode() {
  esp_flash_t* chip = esp_flash_default_chip;
  if (!chip || (chip->chip_id >> 16) != 0xC2) return;
  if (chip->read_mode == SPI_FLASH_QIO) {
    chip->read_mode = SPI_FLASH_QOUT;
  } else if (chip->read_mode == SPI_FLASH_DIO) {
    chip->read_mode = SPI_FLASH_DOUT;
  }
}
