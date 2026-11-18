# Smoothie 3D

A browser-based 3D CSG (Constructive Solid Geometry) modeling application powered by **Manifold** (via WebAssembly), **Three.js**, and **Deno**.

All geometry generation, parametric beveling, watertight mesh conversion, and boolean operations run directly in the browser with zero backend computation.

---

## Features

- **Parametric Primitives & Beveling:** Create cubes, cylinders, cones, and custom `.glb` meshes (Monkey) with real-time adjustable bevel width and segment resolution.
- **Interactive 3D Gizmos:** Translate (`W`), rotate (`E`), and scale (`R`) base or tool shapes in 3D space with a floating confirm/cancel HUD (`Enter` / `Esc`) and live bounding-box dimension readouts.
- **Watertight CSG Booleans:** Perform **Join (Union)** and **Cut (Difference)** operations between beveled shapes using Manifold's 2-manifold engine, complete with creased normal computation (30° threshold) to preserve sharp edges on curved surfaces.
- **Undo / Redo History:** Full boolean operation history (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`).
- **Model Export:** Export final watertight solids directly to binary `.glb` or `.stl` formats.

---

## Architecture

- **CSG Engine (`src/csg.ts`):** Initializes `manifold-3d` WASM, deduplicates Three.js buffer vertices into continuous 2-manifold solids (`geometryToManifold`), executes boolean operations, and reconstructs `THREE.BufferGeometry` with crease-angle normal splitting (`computeCreasedNormals`).
- **Viewport & UI (`src/app.ts`, `src/utils.ts`):** Manages the Three.js WebGL scene, `OrbitControls`, `TransformControls`, raycast selection, parametric bevel generation, and client-side `GLTFExporter` / `STLExporter`.
- **Build Pipeline (`build.ts`):** Uses `esbuild` and `@luca/esbuild-deno-loader` to bundle `src/app.ts` into `public/bundle.js` and copies `manifold.wasm` into `public/`.
- **Static Server (`serve.ts`):** Lightweight Deno HTTP server serving static assets and WASM/3D MIME types from `./public` on port `8000`.


---


## Getting Started

### Prerequisites

- [Deno](https://deno.com/) (v2.x recommended)

### Build & Run

1. **Bundle the application:**
   ```bash
   deno run -A build.ts
   ```
   *(Pass `--minify` for a production build without sourcemaps.)*

2. **Start the local server:**
   ```bash
   deno run --allow-net --allow-read serve.ts
   ```

3. **Open in browser:**
   Navigate to `http://localhost:8000`.

---

## Controls & Shortcuts

| Input | Action |
| :--- | :--- |
| **Left Click** | Select Base Object or Tool shape |
| **W / E / R** | Switch gizmo mode (Move / Rotate / Scale) |
| **Enter** | Confirm pending transform |
| **Esc** | Cancel pending transform and revert |
| **Ctrl + Z** | Undo last boolean operation (or delete active tool shape) |
| **Ctrl + Shift + Z / Ctrl + Y** | Redo boolean operation |

---

## License

See [LICENSE](./LICENSE) for details.
