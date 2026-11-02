# Smoothie

A proof-of-concept procedural 3D modeling engine featuring an in-browser WebGL viewport powered by headless Blender (`bpy`) running inside an isolated Linux container. 

Geometry is generated procedurally on the server using `bmesh`, evaluated against Blender modifier stacks, and streamed directly to the browser as raw binary `.glb` buffers over a WebSocket connection.

---

## Architecture

- **Backend:** FastAPI and Uvicorn running on Python 3.11 inside Docker. The service builds geometry via `bmesh`, executes modifier evaluations, exports `.glb` buffers in real time, and persists `.blend` files for native inspection.
- **Transport:** WebSocket binary frames (`ArrayBuffer`) delivering sub-frame round-trip geometry updates.
- **Frontend:** Vanilla JavaScript and Three.js rendered to a native WebGL canvas.
- **Zero-Toolchain Client:** No `npm`, `node`, bundlers, or remote CDNs. All Three.js dependencies are vendored locally in `./static/vendor/` and resolved natively by the browser via standard `<script type="importmap">`.
- **Container Isolation:** Blender's headless C/C++ runtime and Mesa/X11 dependencies (`libgl1`, `libglu1-mesa`, `libx11-6`, etc.) are isolated from the host OS inside Docker.

