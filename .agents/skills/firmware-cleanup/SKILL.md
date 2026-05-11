---
name: firmware-cleanup
description: Use when preparing firmware code for public release or pull request. Triggers on requests like "clean up the firmware", "prepare this code for release", or when reviewing firmware before commit.
---

# Firmware Cleanup Skill

Follow these steps to clean and prepare the firmware codebase for public distribution:

1. **Gate Debug Statements:** Remove or wrap all `Serial.print()` and `Serial.println()` statements behind `#ifdef DEBUG` macros so they don't clutter production performance.
2. **Remove Magic Numbers:** Extract magic numbers and replace them with named constants. If they relate to hardware pins or display limits, move them to `firmware/patternflow/config.h`. Otherwise, place them at the top of the relevant `.ino` file.
3. **Translate Comments:** Ensure all comments are translated into clear, professional English.
4. **Remove Dead Code:** Delete any commented-out code blocks or unused experimental functions.
5. **Verify Licenses:** Ensure the standard license header is present at the top of every `.ino` and `.h` file:
   - Must specify **MIT License**.
   - Must include copyright attribution (e.g., Copyright (c) SeungHun Lee [Year]).
6. **Compile Check:** Run a test compile of the firmware to verify no syntax errors were introduced during cleanup.
7. **Report Changes:** Provide the user with a summary of exactly what was modified, removed, or extracted.

