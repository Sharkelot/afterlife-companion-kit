# Tamsin Rook (showcase)

© Corey, all rights reserved - showcase only, make your own. Not covered by the repository's MIT licence (see `ART-LICENSE.md`).

Official art `TAMSIN-OFFICIAL.png` (Krea 2 Turbo + krea2_style_reference, seed 8202) and derivatives made only with Krea 2 and Qwen-Image-Edit 2511:

- `TAMSIN-MASTER-HR.png` - 1792x2688 HR master (RealESRGAN anime 2x, Krea 2 refine, Qwen face pass); the rig and every frame come from it.
- `expressions-sheet.jpg` - 4x3 expression sheet from the HR frames on a checkerboard (neutral, happy, joy, smirk, tsundere pout, laughing, surprised, blush, wink, thinking, sad, talking).
- `mouth-shapes-sheet.jpg` - lip-sync set from the HR frames: closed, A, I, E, O, U.
- `frame-consistency.txt` - every expression/mouth frame has only its face region (face, brows, eyes, mouth, near-face hair) taken from the edit and the body from the neutral frame; mean abs diff outside the face is < 1/255.
- `theme-tint-sheet.jpg` - 10 site themes; hair tips, neon trim/circuit glow and eye glow follow the theme tokens, skin and face untouched.
- `rig/` - seam-free Live2D/Inochi2D-style layer split (`seam-report.txt`): `tamsin-rook.psd`, `layers/*.png`, `layers.json` (z-order, bbox, pivots, hierarchy) and import notes for Inochi2D Creator in `rig/README.md`.

Source pipeline and the transparent-WebP widget frames live in the main project (`afterlife-guide`, `concepts-r3/tamsin-krea/` and `guide-tts/widget/avatars/tamsin/`).
