# Tamsin Rook - VTuber layer split (Live2D / Inochi2D style)

(c) Corey, showcase only. Source art: `../TAMSIN-MASTER-HR.png` (HR master of `../TAMSIN-OFFICIAL.png`: RealESRGAN-anime 2x, Krea 2 refine, Qwen face pass) (Krea 2 Turbo + krea2_style_reference, seed 8202, Krea 2 Community License).
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

## How it was made (HR rig, seam-free)
1. `../TAMSIN-MASTER-HR.png` (1792x2688) matted with BiRefNet-HR-matting + pymatting closed-form + foreground colour estimation (`tamsin_matte.py`): soft hair strands, no yellow bleed, no islands < 200 px.
2. SAM2 + GroundingDINO masks for hair/face (run on the master at official-art scale), colour rules inside landmark boxes for eyes/brows/mouth, geometric regions for arms/legs/neck (`rig_segment.py`, `rig_partition.py`).
3. `rig_seamfree.py`: every master pixel belongs to exactly one layer (hard labels, master colour and alpha), so alpha-over in z-order reproduces the master. Each layer is also extended UNDER the layers above it
   (colour push-pull + nearest-edge, alpha 1): 6 px for small parts, 8 arms, 14-16 eye whites/neck, 48 jacket, 60 legs, 80 face, 140 back hair. `seam-report.txt` holds the numbers (mean diff < 2/255, 0 holes, 4 px move test).
4. `rig_export.py` writes the PSD, layers, `layers.json`, `preview.png`.

## Import into Inochi2D Creator
1. Inochi Creator: File > Import > Photoshop Document (.psd) and pick `tamsin-rook.psd`. Each PSD layer becomes a Part with its name and z-order.
   (If your build lacks PSD import, use File > Import > Image Folder with `layers/` and place parts from `layers.json` x/y.)
2. Re-parent as in `layers.json` "hierarchy": head (back-hair, face-base, eyes, brows, mouth, front-hair), torso (neck, arms), root (legs, torso-jacket).
3. Set each node's origin to the `pivot` in `layers.json` (canvas px; Creator's origin is relative to the node centre, so use `pivot_local` against the part's bbox).
4. Eyes: add `eye-L-white`/`eye-R-white` as Mask sources for the matching iris Parts so irises clip inside the eye, move irises with Look X/Y parameters, scale `*-lid` for blinks.
5. Mouth: bind a mesh deform to `mouth` for the vowel shapes. The `mouth-*` renders in `../expressions/` (closed, A, I, E, O, U) are the reference keyforms.
6. Export the puppet as `.inx` and load it in github.com/Sharkelot/companion-app, which uses Inochi2D (see its docs for where it loads puppets; not verified here).

## Known limits
- Canvas is 2x the official art (1792x2688); the master is a Krea 2 refine + Qwen face pass of the official art, so identity is close but the face is a re-draw. Eyes are still only ~70x50 px: re-render the head larger for a production Live2D model.
- Hidden areas are filled by push-pull/edge extension (smooth colour), not by Qwen; they only show when a part moves.
- Part boundaries on the black jacket/jeans are geometric; internal layer edges are hard (1 px stair-step) by design, because the lower layer is extended beneath.
- Eye whites/irises/lids are colour-rule parts, adequate for gaze and blink starters rather than final topology.
