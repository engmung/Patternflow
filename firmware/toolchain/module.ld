/* Partial-link script for Patternflow pattern modules (ld -r -T module.ld).
 *
 * Collapses the many COMDAT/function sections GCC emits into exactly four
 * allocatable sections. That is what keeps the on-device loader simple:
 * literals live inside .text, so every l32r (R_XTENSA_SLOT0_OP) stays
 * intra-section and remains correct once .text is loaded as one contiguous
 * block. Only absolute R_XTENSA_32 fixups and undefined libm symbols are
 * left for the loader to resolve.
 *
 * Linker relaxation metadata (.xt.prop / .xt.lit) and C++ section groups are
 * only meaningful to the linker, never to a loaded image, so they go away.
 */
SECTIONS
{
  .text 0 :
  {
    *(.literal .literal.*)
    *(.text .text.*)
  }

  .rodata :
  {
    *(.rodata .rodata.*)
  }

  .data :
  {
    *(.data .data.*)
  }

  /* Global constructors. Empty for every POD stock preset, but a community
   * pattern with a non-trivial global lands here and the loader walks it
   * (see core_module_loader.h::runInitArray). Placed explicitly so it is a
   * predictable section rather than a linker orphan. */
  .init_array :
  {
    *(.init_array .init_array.*)
    *(.ctors .ctors.*)
  }

  .bss (NOLOAD) :
  {
    *(.bss .bss.*)
    *(COMMON)
  }

  /DISCARD/ :
  {
    *(.comment)
    *(.note*)
    *(.xt.prop .xt.prop.*)
    *(.xt.lit .xt.lit.*)
    *(.xtensa.info)
    /* A module is never torn down cleanly — unload() drops the whole image at
     * once — so destructors would only ever run against freed memory. */
    *(.fini_array .fini_array.*)
    *(.dtors .dtors.*)
  }
}
