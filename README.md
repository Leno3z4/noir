# DLICOM: ASCEND

Pixel-art browser infinite jumper prototype for the DLICOM game jam.

## Mechanics
- Automatic upward bounce
- Left/right steering with acceleration and friction
- Horizontal screen wrap-around
- Upward-only camera
- Procedurally generated, wall-anchored tile platforms
- Platforms use equal vertical spacing and stay within jump reach
- The run starts on a single tile at the left wall
- Platforms alternate between the left and right walls as height increases
- Platforms below the viewport are removed
- Falling below the camera ends the run
- Sustained movement increases maximum speed
- Height-based difficulty with moving platforms
- Seeded runs and local best score
- Keyboard + mobile side-touch controls

## Run locally
No package install is required:
```bash
python -m http.server 8000
```
Then open http://localhost:8000.

The mascot is currently a canvas placeholder and can be replaced with the final DLICOM sprite.
