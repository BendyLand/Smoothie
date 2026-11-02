import * as THREE from "three";
import { initWasm } from "./csg.ts";
import {
  createAppState,
  initMonkeyCache,
  createPrimitiveGeometry,
  selectObject,
  setupEventListeners,
  startRenderLoop,
} from "./utils.ts";

await initWasm();
const state = createAppState();
initMonkeyCache(state);
const baseGeom = createPrimitiveGeometry("cube", null, 0, 4);
const baseMat = new THREE.MeshStandardMaterial({
  color: 0x61afef,
  roughness: 0.4,
  metalness: 0.2,
});
state.baseMesh = new THREE.Mesh(baseGeom, baseMat);
state.baseMesh.userData.shapeType = "cube";
state.scene.add(state.baseMesh);
selectObject(state, state.baseMesh);
setupEventListeners(state);
startRenderLoop(state);
