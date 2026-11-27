# Tamsin eye tracking

How the widget makes Tamsin's eyes follow the page, what is verified, and what is not.

## What it does

- **Layers per eye (L and R):** sclera (the eye white, inpainted under the iris and under the lids; its alpha is the clip mask), a complete iris disc (the part hidden under the lid is rebuilt from the radial profile of the visible part), the pupil with its catch-lights, and an upper and a lower lid crop that include the lash line. All are transparent lossless WebP in `guide-service/widget/avatars/tamsin/eyes/`. Iris and lid layers exist per theme (ten themes plus `base`); the iris is tinted with the theme's tertiary token, the pupil scales 0.9x in light themes and 1.1x in dark ones. Each frame also has a `head-mask` and a `body-mask` for the head/body split.
- **Rendering:** the iris and pupil sit inside a container masked by the sclera layer (`mask-image`), so the iris cannot leave the eye; the lids sit above. Only CSS transforms are animated.
- **Frames with the rig:** neutral, smirk, pout, sad, talk, thinking and the six lip-sync mouths. The other expressions (happy, joy, laugh, surprised, blush, wink) keep their baked eyes; gaze simply holds while one of them shows.

## Motion model (`guide-service/widget/gaze.js`)

- Each eye computes yaw and pitch from its own centre to one shared target point (the pointer, on a plane 520 px in front of her). Because the point is shared, the eyes converge when it is near her face and run nearly parallel when it is far away.
- The iris offset is soft-clamped to an ellipse inside the sclera: 32% of the opening width horizontally, 22% of its height vertically, easing in over the last 30% of the radius (no hard stop).
- Saccades: jumps of 40-80 ms (minimum-jerk), a small damped settle, and micro-jitter while fixating. Catch-up saccades follow a moving pointer at most every 80 ms.
- Lids: the upper lid drops slightly when she looks down and rises when she looks up. Blinks come every 2-6 s (randomised) and on large gaze jumps; the lids close, there is no frame swap.
- Head-eye coordination: when the raw gaze is beyond the eye range, the head group (hair, face, eyes) rotates up to 6 degrees and shifts up to 3 px toward the target. The pivot is at the choker; the body layer stays put and the jacket collar belongs to the body.

## Inputs

Passive `pointermove` on `window` (mouse and pen), the last tap for touch, the focused element for keyboard focus, and the speech bubble (or now and then the viewer) after 4 s without input. While she is speaking she looks at the viewer with occasional glances at the page element the tour is highlighting.

## Performance and accessibility

- One `requestAnimationFrame` loop (the widget's existing animation loop). One gaze step measured about 0.01 ms in Chrome, about 60 steps per second while moving and 30 while only jittering.
- Paused when the widget is minimised, when the figure is off-screen (`IntersectionObserver`) or when the tab is hidden. Element rectangles are cached; the gaze step reads no layout.
- `prefers-reduced-motion`: no saccades, jitter, blinks or head movement, only a slow partial follow.

## Verification

- `node --test guide-service/widget/tests/gaze.test.js`: ellipse clamp, vergence, head-follow threshold, saccade timing, blink interval, lids, input priority, reduced motion.
- `pytest`: asset checks (every layer exists per theme and is real transparent RGBA, tinted irises match the theme tokens, the iris centre stays inside the sclera mask at the far end of its travel, lids are open over the eye, head and body masks composite without a seam) and wiring checks for `guide.js`. It also runs the node tests when node is installed.
- Visual checks were done in a desktop browser with real pointer events at eight positions around her, near her face and at the centre; the irises stayed inside the eyes and pointed toward the pointer. Not covered: real touch hardware, assistive-technology testing, and performance on a physical mid-range phone.

## Limits

- The eye outlines and iris circles were fitted by hand for each frame and checked by eye, not segmented automatically.
- At the full 6 degree head turn, hair strands that hang over the jacket collar break slightly because they cannot be separated from the collar.
- The layers are cut from the shipped frames. If you replace the character art you need new layers; the generator lives in the art repository, not in this kit.
