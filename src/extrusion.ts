import * as THREE from "three";

export interface BoundaryEdge {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface CoplanarRegion {
  triangles: number[]; // Triangle indices
  normal: THREE.Vector3;
  center: THREE.Vector3;
  boundaryEdges: BoundaryEdge[];
  vertices: THREE.Vector3[];
}

/**
 * Finds all triangles coplanar and contiguous with the hit triangle,
 * then returns the outer boundary edges and all participating vertices.
 */
export function getCoplanarRegion(
  geometry: THREE.BufferGeometry,
  seedTriIndex: number,
  angleEpsilonDeg = 1.0,
): CoplanarRegion | null {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return null;

  const numTris = geometry.index
    ? geometry.index.count / 3
    : posAttr.count / 3;

  const getTriVertex = (triIdx: number, corner: number, out: THREE.Vector3) => {
    const idx = geometry.index
      ? geometry.index.getX(triIdx * 3 + corner)
      : triIdx * 3 + corner;
    out.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
  };

  const getTriNormal = (triIdx: number, out: THREE.Vector3) => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    getTriVertex(triIdx, 0, a);
    getTriVertex(triIdx, 1, b);
    getTriVertex(triIdx, 2, c);
    return out.subVectors(c, b).cross(a.clone().sub(b)).normalize();
  };

  const targetNormal = new THREE.Vector3();
  getTriNormal(seedTriIndex, targetNormal);

  const seedPoint = new THREE.Vector3();
  getTriVertex(seedTriIndex, 0, seedPoint);
  // Plane equation: n . p = d
  const targetPlaneOffset = targetNormal.dot(seedPoint);

  const cosThreshold = Math.cos(THREE.MathUtils.degToRad(angleEpsilonDeg));
  const planeEpsilon = 1e-3;

  // 1. Identify all coplanar triangles on the same surface plane
  const coplanarTris: number[] = [];
  const tempNorm = new THREE.Vector3();
  const tempPt = new THREE.Vector3();

  for (let t = 0; t < numTris; t++) {
    getTriNormal(t, tempNorm);
    if (tempNorm.dot(targetNormal) >= cosThreshold) {
      getTriVertex(t, 0, tempPt);
      const planeOffset = tempNorm.dot(tempPt);
      if (Math.abs(planeOffset - targetPlaneOffset) < planeEpsilon) {
        coplanarTris.push(t);
      }
    }
  }

  // 2. Count edge occurrences to find the perimeter boundary (edges used exactly once)
  const edgeCount = new Map<string, { count: number; edge: BoundaryEdge }>();
  const coordKey = (v: THREE.Vector3) =>
    `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;

  const addEdge = (v1: THREE.Vector3, v2: THREE.Vector3) => {
    const k1 = coordKey(v1);
    const k2 = coordKey(v2);
    // Canonical edge key independent of direction
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;

    const existing = edgeCount.get(key);
    if (existing) {
      existing.count++;
    } else {
      // Preserve winding order of original triangle
      edgeCount.set(key, { count: 1, edge: { start: v1.clone(), end: v2.clone() } });
    }
  };

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  for (const t of coplanarTris) {
    getTriVertex(t, 0, vA);
    getTriVertex(t, 1, vB);
    getTriVertex(t, 2, vC);

    addEdge(vA, vB);
    addEdge(vB, vC);
    addEdge(vC, vA);
  }

  const boundaryEdges: BoundaryEdge[] = [];
  for (const item of edgeCount.values()) {
    if (item.count === 1) {
      boundaryEdges.push(item.edge);
    }
  }

  // 3. Extract unique vertex positions
  const regionVertices: THREE.Vector3[] = [];
  const seenVerts = new Set<string>();
  const center = new THREE.Vector3();

  for (const edge of boundaryEdges) {
    for (const pt of [edge.start, edge.end]) {
      const k = coordKey(pt);
      if (!seenVerts.has(k)) {
        seenVerts.add(k);
        regionVertices.push(pt.clone());
        center.add(pt);
      }
    }
  }

  if (regionVertices.length > 0) {
    center.divideScalar(regionVertices.length);
  }

  return {
    triangles: coplanarTris,
    normal: targetNormal,
    center,
    boundaryEdges,
    vertices: regionVertices,
  };
}

export function createExtrusionPrismGeometry(
  sourceGeom: THREE.BufferGeometry,
  region: CoplanarRegion,
  distance: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  const disp = region.normal.clone().multiplyScalar(distance);
  const posAttr = sourceGeom.attributes.position;

  const getTriVertex = (triIdx: number, corner: number, out: THREE.Vector3) => {
    const idx = sourceGeom.index
      ? sourceGeom.index.getX(triIdx * 3 + corner)
      : triIdx * 3 + corner;
    out.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
  };

  let vertIndex = 0;

  // 1. Bottom Cap (Original Triangles, inverted winding if extruding outward)
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (const t of region.triangles) {
    getTriVertex(t, 0, a);
    getTriVertex(t, 1, b);
    getTriVertex(t, 2, c);

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

    if (distance > 0) {
      // Invert winding for bottom cap of outward solid
      indices.push(vertIndex, vertIndex + 2, vertIndex + 1);
    } else {
      indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
    }
    vertIndex += 3;
  }

  // 2. Top Cap (Displaced along normal)
  for (const t of region.triangles) {
    getTriVertex(t, 0, a);
    getTriVertex(t, 1, b);
    getTriVertex(t, 2, c);

    a.add(disp);
    b.add(disp);
    c.add(disp);

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

    if (distance > 0) {
      indices.push(vertIndex, vertIndex + 1, vertIndex + 2);
    } else {
      indices.push(vertIndex, vertIndex + 2, vertIndex + 1);
    }
    vertIndex += 3;
  }

  // 3. Side Walls (Quads connecting boundary edges)
  for (const edge of region.boundaryEdges) {
    const p1 = edge.start;
    const p2 = edge.end;
    const p1Disp = p1.clone().add(disp);
    const p2Disp = p2.clone().add(disp);

    // Quad vertices: 0: p1, 1: p2, 2: p2Disp, 3: p1Disp
    positions.push(
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p2Disp.x, p2Disp.y, p2Disp.z,
      p1Disp.x, p1Disp.y, p1Disp.z,
    );

    if (distance > 0) {
      indices.push(
        vertIndex, vertIndex + 1, vertIndex + 2,
        vertIndex, vertIndex + 2, vertIndex + 3,
      );
    } else {
      indices.push(
        vertIndex, vertIndex + 2, vertIndex + 1,
        vertIndex, vertIndex + 3, vertIndex + 2,
      );
    }
    vertIndex += 4;
  }

  const prismGeom = new THREE.BufferGeometry();
  prismGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  prismGeom.setIndex(indices);
  prismGeom.computeVertexNormals();
  return prismGeom;
}

import { geometryToManifold, manifoldToBufferGeometry } from "./csg.ts";
import type { AppState } from "./utils.ts";

export function applyFaceExtrusion(
  state: AppState,
  region: CoplanarRegion,
  distance: number,
): void {
  if (!state.baseMesh || Math.abs(distance) < 1e-4) return;

  const baseMesh = state.baseMesh as THREE.Mesh;

  // 1. Ensure current base manifold exists
  if (!state.currentManifold) {
    state.currentManifold = geometryToManifold(baseMesh.geometry);
  }

  // 2. Build the watertight prism geometry for the delta sweep
  const prismGeom = createExtrusionPrismGeometry(
    baseMesh.geometry,
    region,
    distance,
  );
  const prismSolid = geometryToManifold(prismGeom);

  // 3. Save state for Undo/Redo
  state.manifoldUndoStack.push(state.currentManifold);
  state.manifoldRedoStack.length = 0;
  state.undoCount = state.manifoldUndoStack.length;
  state.redoCount = 0;
  state.hasBooleans = true;

  // 4. Extrude (pull > 0) = UNION; Intrude (push < 0) = DIFFERENCE
  const base = state.currentManifold;
  state.currentManifold = distance > 0 ? base.add(prismSolid) : base.subtract(prismSolid);

  // 5. Update mesh in Three.js
  const updatedGeom = manifoldToBufferGeometry(state.currentManifold);
  baseMesh.geometry.dispose();
  baseMesh.geometry = updatedGeom;

  prismGeom.dispose();
}
