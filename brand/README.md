# AERIS vector identity

The mark combines an ascending **A** with an upward sweep of air. Three filled paths, open cuts, and a compact silhouette replace the generic activity-line logo.

| File | Use |
|---|---|
| `aeris-mark.svg` | Editable vector master; rendered directly in the application |
| `aeris-icon.svg` | Desktop application icon with a dark rounded backplate |
| `aeris-tray.svg` | Stronger monochrome silhouette for the notification area |
| `aeris-monochrome.svg` | Single-colour symbol using `currentColor` |

Edit **only `aeris-mark.svg`** to change the geometry. Run `pnpm run icons` to regenerate the derived SVGs, PNG/ICO/ICNS files, and README banner. `ppnpm run icons --preview` also writes a review sheet under the ignored `artifacts/` directory.

The source contains no embedded bitmap, font, external reference, or SVG filter. Application UI and browser favicon consume SVG. Native application resources and the tray require platform formats, generated from the vector source: Windows ICO (16, 20, 24, 32, 40, 48, 64, 128, 256 px), macOS ICNS (256, 512, 1024 px), and Linux/application PNG (512 px). These are generated outputs, not design originals. CI regenerates and compares all assets on every operating system.

Colours: midnight `#081827`, cyan `#55D9F5`, blue `#299BC9`, ice `#C5F4FF`. Preserve the viewBox and clear space; do not stretch the mark. Use the monochrome version on light backgrounds.
