# Matrix fonts (panel OS UI)

From [trip5/Matrix-Fonts](https://github.com/trip5/Matrix-Fonts) (CC-BY).

| File | Use |
|------|-----|
| `MatrixLight8X.h` | SELECT titles, MQTT message banners |
| `MatrixLight6.h` | NETWORK / OSC / AUD / KNOB MAP / chrome hints |

Regenerate after updating a `.bdf`:

```bash
python toolchain/bdf_to_gfxfont.py src/fonts/MatrixLight8X.bdf \
  -o src/fonts/MatrixLight8X.h --name MatrixLight8X
python toolchain/bdf_to_gfxfont.py src/fonts/MatrixLight6.bdf \
  -o src/fonts/MatrixLight6.h --name MatrixLight6
```

ASCII `0x20`–`0x7E` only (overlays run text through `asciiFold`).
