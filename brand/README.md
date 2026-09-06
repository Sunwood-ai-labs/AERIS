# AERIS vector identity

The mark combines an ascending **A** with an upward sweep of air. Three filled paths, open cuts, and a compact silhouette replace the generic activity-line logo.

| File | Use |
|---|---|
| `aeris-mark.svg` | Editable vector master; rendered directly in the application |
| `aeris-icon.svg` | Windows application icon with a dark rounded backplate |
| `aeris-tray.svg` | Stronger monochrome silhouette for the notification area |
| `aeris-monochrome.svg` | Single-colour symbol using `currentColor` |

Edit **only `aeris-mark.svg`** to change the geometry. Run `npm run icons` to regenerate the derived SVGs, Windows PNG/ICO files, and README banner. `npm run icons -- --preview` also writes a review sheet under the ignored `artifacts/` directory.

The source contains no embedded bitmap, font, external reference, or SVG filter. Application UI and browser favicon consume SVG. Windows executable resources and the tray require raster-compatible formats, so PNG and multi-resolution ICO files are generated from the vector source. ICO sizes: 16, 20, 24, 32, 40, 48, 64, 128, 256 pixels. The PNG/ICO files are generated outputs, not design originals.

Colours: midnight `#081827`, cyan `#55D9F5`, blue `#299BC9`, ice `#C5F4FF`. Preserve the viewBox and clear space; do not stretch the mark. Use the monochrome version on light backgrounds.
