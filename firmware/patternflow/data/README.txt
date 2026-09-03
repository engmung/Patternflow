This directory mirrors the device's FATFS partition.

  data/patterns/<slug>.pfm   loadable pattern modules (gitignored — build outputs)

The normal way a .pfm reaches a panel is over Wi-Fi: upload it on the device's
/patterns page, or let the site install it. This folder exists for the other
route — writing the whole partition over USB:

  python firmware/toolchain/build_module.py --all     # modules/ -> data/patterns/
  cd firmware/patternflow && pio run -t uploadfs      # data/ -> FATFS

Requirements:
  - The partition table in platformio.ini (partitions/app3M_fat9M_16MB.csv)
    reserves ~9 MB of FATFS; everything in data/ must fit.
  - uploadfs REPLACES the partition. Modules people uploaded over Wi-Fi are
    gone afterwards unless they are in data/patterns/ too.

File naming:
  - Lowercase slugs, no spaces: origin.pfm, layer_stack.pfm
  - The slug must match the module's NAME (build_module.py derives it).
