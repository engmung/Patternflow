import path from "node:path";

// Where the firmware sources live. The module builder needs them for the ABI
// headers and the linker script a .pfm is compiled against.
//
// This used to carry the registry path and the static flash parts too, for
// building whole images with a pattern baked in. That path is gone: updating
// the firmware is its own flow now (patternflow.work/update), which was the
// only thing a full rebuild really offered over a 6 KB module.

export function firmwareSrcDir(): string {
  return process.env.FIRMWARE_SRC_DIR ?? path.resolve(process.cwd(), "../firmware/patternflow");
}
