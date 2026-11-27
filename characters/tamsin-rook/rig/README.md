# Tamsin Rook - VTuber layer split (Live2D / Inochi2D style)

(c) Corey, showcase only. Source art: `../TAMSIN-OFFICIAL.png` (Krea 2 Turbo + krea2_style_reference, seed 8202, Krea 2 Community License).
Derivatives use only Krea 2 and Qwen-Image-Edit 2511 (Apache-2.0); no Illustrious models.

## Files
- `tamsin-rook.psd` - layered PSD, canvas 1792x2688 (2x the official 896x1344), every layer full-canvas and aligned, bottom to top in z-order.
- `layers/NN-<name>.png` - the same layers cropped to their bbox (RGBA, transparent, no yellow fringe). `layers.json` has each layer's
  name, z-order, bbox (x, y, w, h on the canvas), pivot (absolute and local), parent, and notes.
- `preview.png` - flat recomposite of all layers (should equal the official art on transparency).
- `_seg/` (BiRefNet cutout + SAM2/GroundingDINO masks), `_stage1/` (partition before inpaint), `_stage2/` (inpainted layers), `_stage2/_fills/` (Qwen inputs/outputs).

## Layers (z 0 = bottom)
back-hair, legs, right-cyber-arm, torso-jacket, left-arm, neck, face-base, eye-L/R-white, eye-L/R-iris, eye-L/R-lid, brow-L/R, mouth, front-hair.
Left/right are as seen by the viewer. The viewer-left brow is mostly hidden under the fringe in the official art, so `brow-L` is a stub.

## How it was made
1. BiRefNet-general cutout (ComfyUI) of the official art, edge-refined (yellow background un-mixed, premultiplied-safe colours).
2. SAM2 + GroundingDINO masks for hair/face (good); eyes/brows/mouth come from colour rules inside landmark boxes
   (GroundingDINO returned whole-box masks for tiny face parts); arms/legs/neck are geometric regions. Every cutout pixel belongs to
   exactly one layer (soft edges, renormalised), so the layers recompose the original.
3. Qwen-Image-Edit 2511 inpaints what each big layer hides (back hair behind face and fringe, the face under eyes/brows/mouth/fringe, torso under neck
   and arms, legs under the jacket). Only the hidden zone is taken from Qwen; the layer's own pixels stay bit-exact.

## Import into Inochi2D Creator
1. Inochi Creator: File > Import > Photoshop Document (.psd) and pick `tamsin-rook.psd`. Each PSD layer becomes a Part with its name and z-order.
   (If your build lacks PSD import, use File > Import > Image Folder with `layers/` and place parts from `layers.json` x/y.)
2. Re-parent as in `layers.json` "hierarchy": head (back-hair, face-base, eyes, brows, mouth, front-hair), torso (neck, arms), root (legs, torso-jacket).
3. Set each node's origin to the `pivot` in `layers.json` (canvas px; Creator's origin is relative to the node centre, so use `pivot_local` against the part's bbox).
4. Eyes: add `eye-L-white`/`eye-R-white` as Mask sources for the matching iris Parts so irises clip inside the eye, move irises with Look X/Y parameters, scale `*-lid` for blinks.
5. Mouth: bind a mesh deform to `mouth` for the vowel shapes. The `mouth-*` renders in `../expressions/` (closed, A, I, E, O, U) are the reference keyforms.
6. Export the puppet as `.inx` and load it in github.com/Sharkelot/companion-app, which uses Inochi2D (see its docs for where it loads puppets; not verified here).

## Known limits
- Canvas is a 2x Lanczos upscale of the 896x1344 official art, so eye and mouth parts are small (eyes about 70x50 px). Re-render the head larger before shipping a production Live2D model.
- Part boundaries on the black jacket/jeans are geometric and approximate; boundaries sit inside black clothing so seams do not show when layers are static.
- Eye whites/irises/lids are colour-rule parts, adequate for gaze and blink starters rather than final topology.
