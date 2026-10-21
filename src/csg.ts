import Module from "manifold-3d";
import * as THREE from "three";

let wasm: any = null;
export let Manifold: any = null;

export async function initWasm() {
  if (wasm) return;
  try {
    wasm = await Module({
      locateFile: (file = "") => {
        return new URL(file, import.meta.url).href;
      },
    });
    wasm.setup();
    Manifold = wasm.Manifold;
    console.log("Manifold WASM initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Manifold WASM:", err);
    throw err;
  }
}

export function manifoldToBufferGeometry(manifoldInstance: any): THREE.BufferGeometry {
  const mesh = manifoldInstance.getMesh();
  const geom = new THREE.BufferGeometry();

  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(mesh.vertProperties, mesh.numProp),
  );
  geom.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geom.computeVertexNormals();
  return geom;
}

export function createSolidManifold(
  shape: string,
  scale: number,
) {
  if (!Manifold) {
    throw new Error("Manifold is not initialized yet.");
  }
  const s = scale * 1.5;
  switch (shape) {
    case "cylinder": {
      const raw = Manifold.cylinder(s, s * 0.5, s * 0.5, 32, true);
      return raw.rotate([-90, 0, 0]);
    }
    case "cone": {
      const raw = Manifold.cylinder(s, s * 0.5, 0.0, 32, true);
      return raw.rotate([-90, 0, 0]);
    }
    default:
      return Manifold.cube([s, s, s], true);
  }
}
