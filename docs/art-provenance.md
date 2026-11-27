# Character art provenance

The widget includes the selected image `guide-service/widget/avatars/tamsin-rook.png` and the frame stack derived from it in `guide-service/widget/avatars/tamsin/`.

- Character: Tamsin Rook, an original punk/cyberpunk netrunner guide concept.
- Generation: Krea 2 with the Krea 2 style-reference workflow; official selection recorded in the source concept notes on 2026-11-26, seed 8202.
- The public kit contains the selected Krea output only. It does not include the original/reference image, the contact sheet, other concept rounds, workflow JSON, or the cancelled `tamsin-640101` variants.
- The image is an individual fully clothed character illustration on a solid yellow background; it is separate from the software license.

Krea's model/service and style-reference terms may impose conditions that are distinct from the MIT license. Check the current Krea terms and your intended use before commercial use or redistribution. The software license in this repo does not grant rights to model weights or third-party references. No model weights are included.

## Derived widget frames and eye layers

- `avatars/tamsin/base/` and `avatars/tamsin/<style>-<mode>/`: 19 transparent WebP frames per theme (12 expressions, a blink frame, 6 lip-sync mouths), made from the selected image with Qwen-Image-Edit 2511 expression edits and BiRefNet cutouts, then tinted per theme (colour blend of hair tips, neon trim and iris glow; skin and face untouched).
- `avatars/tamsin/eyes/`: per-eye layers (sclera mask, complete iris, pupil, upper and lower lids, head/body masks) for the open-eye frames, plus `eyes.json` geometry. The outlines and iris circles were fitted by hand and checked by eye; they are not SAM output.
- These files are (c) Corey, showcase only (see `ART-LICENSE.md`).
