import Module from "manifold-3d";
import * as THREE from "three";

let wasm: any = null;
export let Manifold: any = null;
export let Mesh: any = null;

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
    Mesh = wasm.Mesh;
    console.log("Manifold WASM initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Manifold WASM:", err);
    throw err;
  }
}

/**
 * Converts any closed Three.js BufferGeometry (including beveled boxes,
 * cylinders, and cones) into a watertight Manifold CSG solid.
 */
export function geometryToManifold(geometry: THREE.BufferGeometry): any {
  if (!Manifold) {
    throw new Error("Manifold is not initialized yet.");
  }

  const posAttr = geometry.attributes.position;
  if (!posAttr) {
    throw new Error("Geometry has no position attribute.");
  }

  // Deduplicate vertices along seams to produce a continuous 2-manifold
  const precision = 1e5;
  const coordMap = new Map<string, number>();
  const uniquePositions: number[] = [];
  const remap = new Uint32Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const key = `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;
    let idx = coordMap.get(key);
    if (idx === undefined) {
      idx = uniquePositions.length / 3;
      coordMap.set(key, idx);
      uniquePositions.push(x, y, z);
    }
    remap[i] = idx;
  }

  // Remap triangle indices and drop degenerate / collapsed triangles
  const rawIndices = geometry.index ? geometry.index.array : null;
  const count = rawIndices ? rawIndices.length : posAttr.count;
  const validTris: number[] = [];

  for (let i = 0; i < count; i += 3) {
    const a = rawIndices ? remap[rawIndices[i]] : remap[i];
    const b = rawIndices ? remap[rawIndices[i + 1]] : remap[i + 1];
    const c = rawIndices ? remap[rawIndices[i + 2]] : remap[i + 2];

    if (a !== b && b !== c && a !== c) {
      validTris.push(a, b, c);
    }
  }

  const meshData = {
    numProp: 3,
    vertProperties: new Float32Array(uniquePositions),
    triVerts: new Uint32Array(validTris),
  };

  if (wasm && wasm.Mesh) {
    try {
      const m = new wasm.Mesh(meshData);
      if (typeof m.merge === "function") {
        m.merge();
      }
      return new Manifold(m);
    } catch {
      return new Manifold(meshData);
    }
  }

  return new Manifold(meshData);
}

export function createSolidManifold(
  shape: string,
  scale: number | THREE.Vector3 | [number, number, number] = 1.0,
) {
  if (!Manifold) {
    throw new Error("Manifold is not initialized yet.");
  }

  let sx = 1.0;
  let sy = 1.0;
  let sz = 1.0;

  if (typeof scale === "number") {
    sx = scale;
    sy = scale;
    sz = scale;
  } else if (Array.isArray(scale)) {
    sx = scale[0];
    sy = scale[1];
    sz = scale[2];
  } else if (scale instanceof THREE.Vector3) {
    sx = scale.x;
    sy = scale.y;
    sz = scale.z;
  }

  const baseSize = 1.5;
  let solid: any;

  switch (shape) {
    case "cylinder": {
      const raw = Manifold.cylinder(baseSize, baseSize * 0.5, baseSize * 0.5, 32, true);
      solid = raw.rotate([-90, 0, 0]);
      break;
    }
    case "cone": {
      const raw = Manifold.cylinder(baseSize, baseSize * 0.5, 0.0, 32, true);
      solid = raw.rotate([-90, 0, 0]);
      break;
    }
    default:
      solid = Manifold.cube([baseSize, baseSize, baseSize], true);
      break;
  }

  return solid.scale([sx, sy, sz]);
}

// src/csg.ts

/**
 * Computes normals with a crease angle threshold.
 * Edges sharper than creaseAngle will have hard normals (split vertices),
 * while surfaces curving gently (like cylinders) remain smooth.
 */
function computeCreasedNormals(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngleRad: number = (30 * Math.PI) / 180,
): THREE.BufferGeometry {
  const numTris = indices.length / 3;
  const faceNormals = new Float32Array(numTris * 3);

  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  // 1. Calculate unweighted face normal for each triangle
  for (let t = 0; t < numTris; t++) {
    const i3 = t * 3;
    const a = indices[i3] * 3;
    const b = indices[i3 + 1] * 3;
    const c = indices[i3 + 2] * 3;

    pA.set(positions[a], positions[a + 1], positions[a + 2]);
    pB.set(positions[b], positions[b + 1], positions[b + 2]);
    pC.set(positions[c], positions[c + 1], positions[c + 2]);

    cb.subVectors(pC, pB);
    ab.subVectors(pA, pB);
    cb.cross(ab).normalize();

    faceNormals[i3] = cb.x;
    faceNormals[i3 + 1] = cb.y;
    faceNormals[i3 + 2] = cb.z;
  }

  // 2. Map each original vertex index to all triangles that reference it
  const vertToTris: number[][] = [];
  const numVerts = positions.length / 3;
  for (let i = 0; i < numVerts; i++) {
    vertToTris.push([]);
  }
  for (let t = 0; t < numTris; t++) {
    const i3 = t * 3;
    vertToTris[indices[i3]].push(t);
    vertToTris[indices[i3 + 1]].push(t);
    vertToTris[indices[i3 + 2]].push(t);
  }

  const cosThreshold = Math.cos(creaseAngleRad);
  const outPositions = new Float32Array(numTris * 9);
  const outNormals = new Float32Array(numTris * 9);

  const thisNorm = new THREE.Vector3();
  const otherNorm = new THREE.Vector3();
  const smoothNorm = new THREE.Vector3();

  // 3. For each triangle vertex, average normals only from neighboring faces
  //    whose dihedral angle is within the crease angle threshold
  for (let t = 0; t < numTris; t++) {
    const t3 = t * 3;
    thisNorm.set(faceNormals[t3], faceNormals[t3 + 1], faceNormals[t3 + 2]);

    for (let corner = 0; corner < 3; corner++) {
      const origVert = indices[t3 + corner];
      const origPosIdx = origVert * 3;
      const outIdx = (t * 3 + corner) * 3;

      // Position
      outPositions[outIdx] = positions[origPosIdx];
      outPositions[outIdx + 1] = positions[origPosIdx + 1];
      outPositions[outIdx + 2] = positions[origPosIdx + 2];

      // Smooth normal accumulator
      smoothNorm.set(0, 0, 0);
      const adjTris = vertToTris[origVert];

      for (let k = 0; k < adjTris.length; k++) {
        const neighborTri = adjTris[k];
        const n3 = neighborTri * 3;
        otherNorm.set(faceNormals[n3], faceNormals[n3 + 1], faceNormals[n3 + 2]);

        // If face normals deviate less than the crease threshold, average them
        if (thisNorm.dot(otherNorm) >= cosThreshold) {
          smoothNorm.add(otherNorm);
        }
      }

      if (smoothNorm.lengthSq() > 0) {
        smoothNorm.normalize();
      } else {
        smoothNorm.copy(thisNorm);
      }

      outNormals[outIdx] = smoothNorm.x;
      outNormals[outIdx + 1] = smoothNorm.y;
      outNormals[outIdx + 2] = smoothNorm.z;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(outPositions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(outNormals, 3));
  return geom;
}

export function manifoldToBufferGeometry(
  manifoldInstance: any,
  creaseAngleDeg: number = 30,
): THREE.BufferGeometry {
  const mesh = manifoldInstance.getMesh();
  const positions = mesh.vertProperties as Float32Array;
  const indices = mesh.triVerts as Uint32Array;

  // Use 30-degree crease threshold: keeps 90-degree boxes and cuts crisp,
  // while keeping 32-segment cylinders smooth.
  return computeCreasedNormals(
    positions,
    indices,
    THREE.MathUtils.degToRad(creaseAngleDeg),
  );
}
