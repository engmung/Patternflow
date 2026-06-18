---
name: update-bom
description: Use when the BOM in BUILD_GUIDE.md needs to be checked against or synchronized with the schematic in hardware/pcb/schematic.pdf or the KiCad source in hardware/pcb/kicad/. Trigger when adding, removing, or changing electronic components, or when the user asks to verify BOM correctness.
---

# Update BOM Skill

Follow these steps to safely synchronize the Bill of Materials with the hardware design:

1. **Read current BOM table** in `BUILD_GUIDE.md` §1.
2. **Cross-reference** with `hardware/pcb/kicad/patternflow.kicad_sch` (if readable) or `hardware/pcb/schematic.pdf` (note its existence and ask user for confirmation if unable to parse PDF directly).
3. **Verify counts match:**
   - Resistors (R1–R12) = 12x 10kΩ 0805
   - Capacitors (C1–C10, C12–C15) = 14x 100nF 0805
   - Bulk Capacitor (C11) = 1x 1000µF electrolytic
   - Connectors (J1, J2, J3)
   - Encoders (SW1–SW4) = 4x EC11
   - MCU (U1) = ESP32-S3-WROOM-1 (N16R8)
4. **Report mismatches** to the user before making any edits.
5. **After confirming**, update `BUILD_GUIDE.md` and any relevant AliExpress affiliate sourcing links to match the verified components.
