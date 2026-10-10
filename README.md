# Smoothie

A proof-of-concept procedural 3D modeling engine featuring an in-browser WebGL viewport powered by headless Blender (`bpy`) running inside an isolated Linux container[cite: 6, 8]. 

Geometry is generated procedurally on the server using `bmesh`, evaluated against Blender modifier stacks, and streamed directly to the browser as raw binary `.glb` buffers over a WebSocket connection.

---

## Architecture

- **Backend:** FastAPI and Uvicorn running on Python 3.11 inside Docker[cite: 8, 10]. The service builds geometry via `bmesh`, executes modifier evaluations, exports `.glb` buffers in real time, and persists `.blend` files for native inspection[cite: 6, 10].
- **Transport:** WebSocket binary frames (`ArrayBuffer`) delivering sub-frame round-trip geometry updates[cite: 6, 10].
- **Frontend:** Vanilla JavaScript and Three.js rendered to a native WebGL canvas[cite: 10, 13].
- **Zero-Toolchain Client:** No `npm`, `node`, bundlers, or remote CDNs[cite: 12]. All Three.js dependencies are vendored locally in `./static/vendor/` and resolved natively by the browser via standard `<script type="importmap">`[cite: 10, 12].
- **Container Isolation:** Blender's headless C/C++ runtime and Mesa/X11 dependencies (`libgl1`, `libglu1-mesa`, `libx11-6`, etc.) are isolated from the host OS inside Docker[cite: 8].

