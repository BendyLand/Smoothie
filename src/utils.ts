import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { TransformControls } from "three/addons/TransformControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

import {
  geometryToManifold,
  initWasm,
  Manifold,
  manifoldToBufferGeometry,
} from "./csg.ts";

import {
  applyFaceExtrusion,
  CoplanarRegion,
  createExtrusionPrismGeometry,
  getCoplanarRegion,
} from "./extrusion.ts";

export interface AppUI {
  canvas: HTMLCanvasElement;
  shapeSelect: HTMLSelectElement;
  labelActiveTarget: HTMLElement;
  addShapeBtn: HTMLButtonElement;
  btnTranslate: HTMLButtonElement;
  btnRotate: HTMLButtonElement;
  btnScale: HTMLButtonElement;
  btnExtrude: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnUnion: HTMLButtonElement;
  btnDiff: HTMLButtonElement;
  bevelWidth: HTMLInputElement;
  bevelWidthVal: HTMLSpanElement;
  bevelSegments: HTMLInputElement;
  bevelSegmentsVal: HTMLSpanElement;
  shapeScale: HTMLInputElement;
  shapeScaleVal: HTMLSpanElement;
  gizmoHud: HTMLElement;
  hudConfirm: HTMLButtonElement;
  hudCancel: HTMLButtonElement;
  targetDimensions: HTMLElement;
}

export interface AppState {
  currentManifold: any;
  manifoldUndoStack: any[];
  manifoldRedoStack: any[];
  ui: AppUI;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  transformGizmo: TransformControls;
  loader: GLTFLoader;
  baseMesh: THREE.Object3D | null;
  shapeStack: THREE.Mesh[];
  selectedObject: THREE.Object3D | null;
  currentBaseShape: string;
  monkeyGeometry: THREE.BufferGeometry | null;
  isGizmoInteracting: boolean;
  pointerStartX: number;
  pointerStartY: number;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  transformSnapshot: TransformSnapshot | null;
  hudScreenVector: THREE.Vector3;
  undoCount: number;
  redoCount: number;
  hasBooleans: boolean;
  hasPendingTransform: boolean;

  // Extrude Mode State
  isExtrudeMode: boolean;
  isExtruding: boolean;
  hoveredRegion: CoplanarRegion | null;
  activeExtrudeRegion: CoplanarRegion | null;
  extrudeOutline: THREE.LineSegments | null;
  extrudePreviewMesh: THREE.Mesh | null;
  extrudeDistance: number;
  extrudeScreenDir: THREE.Vector2;
}

export interface AppUI {
  canvas: HTMLCanvasElement;
  shapeSelect: HTMLSelectElement;
  labelActiveTarget: HTMLElement;
  addShapeBtn: HTMLButtonElement;
  btnTranslate: HTMLButtonElement;
  btnRotate: HTMLButtonElement;
  btnScale: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnUnion: HTMLButtonElement;
  btnDiff: HTMLButtonElement;
  bevelWidth: HTMLInputElement;
  bevelWidthVal: HTMLSpanElement;
  bevelSegments: HTMLInputElement;
  bevelSegmentsVal: HTMLSpanElement;
  shapeScale: HTMLInputElement;
  shapeScaleVal: HTMLSpanElement;
  gizmoHud: HTMLElement;
  hudConfirm: HTMLButtonElement;
  hudCancel: HTMLButtonElement;
  targetDimensions: HTMLElement;
}

export interface TransformSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface AppState {
  currentManifold: any;
  manifoldUndoStack: any[];
  manifoldRedoStack: any[];
  ui: AppUI;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  transformGizmo: TransformControls;
  loader: GLTFLoader;
  baseMesh: THREE.Object3D | null;
  shapeStack: THREE.Mesh[];
  selectedObject: THREE.Object3D | null;
  currentBaseShape: string;
  monkeyGeometry: THREE.BufferGeometry | null;
  isGizmoInteracting: boolean;
  pointerStartX: number;
  pointerStartY: number;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  transformSnapshot: TransformSnapshot | null;
  hudScreenVector: THREE.Vector3;
  undoCount: number;
  redoCount: number;
  hasBooleans: boolean;
  hasPendingTransform: boolean;
}

export function createAppState(): AppState {
  const canvas = document.getElementById("viewport") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181818);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(5, 4, 6);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;

  const transformGizmo = new TransformControls(camera, renderer.domElement);
  scene.add(transformGizmo);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
  scene.add(grid);

  const ui: AppUI = {
    canvas,
    shapeSelect: document.getElementById("shape-select") as HTMLSelectElement,
    labelActiveTarget: document.getElementById(
      "active-target-label",
    ) as HTMLElement,
    addShapeBtn: document.getElementById("add-shape-btn") as HTMLButtonElement,
    btnTranslate: document.getElementById("mode-translate") as HTMLButtonElement,
    btnRotate: document.getElementById("mode-rotate") as HTMLButtonElement,
    btnScale: document.getElementById("mode-scale") as HTMLButtonElement,
    btnExtrude: document.getElementById("mode-extrude") as HTMLButtonElement,
    btnDelete: document.getElementById("btn-delete") as HTMLButtonElement,
    btnUnion: document.getElementById("btn-union") as HTMLButtonElement,
    btnDiff: document.getElementById("btn-diff") as HTMLButtonElement,
    bevelWidth: document.getElementById("bevel-width") as HTMLInputElement,
    bevelWidthVal: document.getElementById("bevel-width-val") as HTMLSpanElement,
    bevelSegments: document.getElementById("bevel-segments") as HTMLInputElement,
    bevelSegmentsVal: document.getElementById("bevel-segments-val") as HTMLSpanElement,
    shapeScale: document.getElementById("shape-scale") as HTMLInputElement,
    shapeScaleVal: document.getElementById("shape-scale-val") as HTMLSpanElement,
    gizmoHud: document.getElementById("gizmo-hud") as HTMLElement,
    hudConfirm: document.getElementById("hud-confirm") as HTMLButtonElement,
    hudCancel: document.getElementById("hud-cancel") as HTMLButtonElement,
    btnUndo: document.getElementById("btn-undo") as HTMLButtonElement,
    btnRedo: document.getElementById("btn-redo") as HTMLButtonElement,
    targetDimensions: document.getElementById("target-dimensions") as HTMLElement,
  };

  // Wireframe highlight outline for hovered face
  const outlineMat = new THREE.LineBasicMaterial({
    color: 0x61afef,
    linewidth: 2,
    depthTest: false,
  });
  const extrudeOutline = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMat);
  extrudeOutline.renderOrder = 1000;
  extrudeOutline.visible = false;
  scene.add(extrudeOutline);

  // Semitransparent live preview mesh during dragging
  const previewMat = new THREE.MeshStandardMaterial({
    color: 0x98c379,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
  });
  const extrudePreviewMesh = new THREE.Mesh(new THREE.BufferGeometry(), previewMat);
  extrudePreviewMesh.visible = false;
  scene.add(extrudePreviewMesh);

  const state: AppState = {
    ui,
    renderer,
    scene,
    camera,
    orbit,
    transformGizmo,
    loader: new GLTFLoader(),
    baseMesh: null,
    shapeStack: [],
    selectedObject: null,
    currentBaseShape: "cube",
    monkeyGeometry: null,
    isGizmoInteracting: false,
    pointerStartX: 0,
    pointerStartY: 0,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    transformSnapshot: null,
    hudScreenVector: new THREE.Vector3(),
    undoCount: 0,
    redoCount: 0,
    hasBooleans: false,
    hasPendingTransform: false,
    currentManifold: null,
    manifoldUndoStack: [],
    manifoldRedoStack: [],

    isExtrudeMode: false,
    isExtruding: false,
    hoveredRegion: null,
    activeExtrudeRegion: null,
    extrudeOutline,
    extrudePreviewMesh,
    extrudeDistance: 0,
    extrudeScreenDir: new THREE.Vector2(),
  };

  updateUiControlsAvailability(state);
  return state;
}

export function initMonkeyCache(state: AppState): void {
  state.loader.load(
    "./monkey.glb",
    (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !state.monkeyGeometry) {
          state.monkeyGeometry = (child as THREE.Mesh).geometry.clone();
        }
      });
    },
    undefined,
    (err) => {
      console.error("Failed to preload /monkey.glb:", err);
    },
  );
}

export function createBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevelWidth: number,
  bevelSegments: number,
): THREE.BufferGeometry {
  const maxBevel = Math.min(width, height, depth) / 2 - 0.01;
  const b = Math.max(0, Math.min(bevelWidth, maxBevel));
  if (b <= 0) {
    return new THREE.BoxGeometry(width, height, depth);
  }

  const segs = Math.max(2, bevelSegments * 2);
  const geom = new THREE.BoxGeometry(width, height, depth, segs, segs, segs);
  const pos = geom.attributes.position;

  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  const innerW = halfW - b;
  const innerH = halfH - b;
  const innerD = halfD - b;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const cx = Math.max(-innerW, Math.min(innerW, x));
    const cy = Math.max(-innerH, Math.min(innerH, y));
    const cz = Math.max(-innerD, Math.min(innerD, z));

    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0) {
      pos.setXYZ(
        i,
        cx + (dx / len) * b,
        cy + (dy / len) * b,
        cz + (dz / len) * b,
      );
    }
  }

  geom.computeVertexNormals();
  return geom;
}

export function createBeveledCylinderGeometry(
  radius: number,
  height: number,
  bevelWidth: number,
  bevelSegments: number,
): THREE.BufferGeometry {
  const maxBevel = Math.min(radius - 0.05, height / 2 - 0.05);
  const b = Math.max(0, Math.min(bevelWidth, maxBevel));
  const radialSegments = Math.max(16, bevelSegments * 8);

  if (b <= 0) {
    return new THREE.CylinderGeometry(radius, radius, height, radialSegments);
  }

  const points: THREE.Vector2[] = [];
  const h2 = height / 2;

  points.push(new THREE.Vector2(0, -h2));
  points.push(new THREE.Vector2(radius - b, -h2));

  const arcSteps = Math.max(2, bevelSegments);
  for (let i = 1; i <= arcSteps; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = -h2 + b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }

  for (let i = 1; i <= arcSteps; i++) {
    const angle = (Math.PI / 2) * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = h2 - b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }

  points.push(new THREE.Vector2(0, h2));

  const geom = new THREE.LatheGeometry(points, radialSegments);
  geom.computeVertexNormals();
  return geom;
}

export function createBeveledConeGeometry(
  radius: number,
  height: number,
  bevelWidth: number,
  bevelSegments: number,
): THREE.BufferGeometry {
  const maxBevel = Math.min(radius - 0.05, height / 2 - 0.05);
  const b = Math.max(0, Math.min(bevelWidth, maxBevel));
  const radialSegments = Math.max(16, bevelSegments * 8);

  if (b <= 0) {
    return new THREE.ConeGeometry(radius, height, radialSegments);
  }

  const points: THREE.Vector2[] = [];
  const h2 = height / 2;

  points.push(new THREE.Vector2(0, -h2));
  points.push(new THREE.Vector2(radius - b, -h2));

  const arcSteps = Math.max(2, bevelSegments);
  for (let i = 1; i <= arcSteps; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = -h2 + b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }

  points.push(new THREE.Vector2(0, h2));

  const geom = new THREE.LatheGeometry(points, radialSegments);
  geom.computeVertexNormals();
  return geom;
}

export function createPrimitiveGeometry(
  type: string,
  monkeyGeometry: THREE.BufferGeometry | null,
  bevelWidth: number = 0,
  bevelSegments: number = 4,
): THREE.BufferGeometry {
  if (type === "cylinder") {
    return createBeveledCylinderGeometry(0.75, 1.5, bevelWidth, bevelSegments);
  }
  else if (type === "cone") {
    return createBeveledConeGeometry(0.75, 1.5, bevelWidth, bevelSegments);
  }
  else if (type === "monkey") {
    if (monkeyGeometry) {
      return monkeyGeometry.clone();
    }
    return createBeveledBoxGeometry(1.5, 1.5, 1.5, bevelWidth, bevelSegments);
  }
  return createBeveledBoxGeometry(1.5, 1.5, 1.5, bevelWidth, bevelSegments);
}

export function applyHighlight(
  obj: THREE.Object3D | null,
  isHighlighted: boolean,
): void {
  if (!obj) return;
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.emissive = isHighlighted
          ? new THREE.Color(0x334466)
          : new THREE.Color(0x000000);
      }
    }
  });
}

export function captureTransformSnapshot(state: AppState): void {
  if (!state.selectedObject) {
    state.transformSnapshot = null;
    return;
  }
  state.transformSnapshot = {
    position: state.selectedObject.position.clone(),
    quaternion: state.selectedObject.quaternion.clone(),
    scale: state.selectedObject.scale.clone(),
  };
}

export function updateSelectedGeometry(state: AppState): void {
  if (!state.selectedObject) return;

  const bevelWidth = parseFloat(state.ui.bevelWidth.value);
  const bevelSegments = parseInt(state.ui.bevelSegments.value, 10);

  if (
    state.selectedObject !== state.baseMesh &&
    (state.selectedObject as THREE.Mesh).isMesh
  ) {
    const mesh = state.selectedObject as THREE.Mesh;
    const shapeType = (mesh.userData.shapeType as string) || "cube";
    mesh.userData.bevelWidth = bevelWidth;
    mesh.userData.bevelSegments = bevelSegments;

    const oldGeom = mesh.geometry;
    mesh.geometry = createPrimitiveGeometry(
      shapeType,
      state.monkeyGeometry,
      bevelWidth,
      bevelSegments,
    );
    oldGeom.dispose();
  }
  else if (state.selectedObject === state.baseMesh && state.baseMesh) {
    const shapeType = (state.baseMesh.userData.shapeType as string) ||
      state.currentBaseShape || "cube";
    state.baseMesh.userData.bevelWidth = bevelWidth;
    state.baseMesh.userData.bevelSegments = bevelSegments;

    state.baseMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const oldGeom = mesh.geometry;
        mesh.geometry = createPrimitiveGeometry(
          shapeType,
          state.monkeyGeometry,
          bevelWidth,
          bevelSegments,
        );
        oldGeom.dispose();
      }
    });
  }
}

export function selectObject(
  state: AppState,
  obj: THREE.Object3D | null,
): void {
  if (state.selectedObject === obj) return;

  applyHighlight(state.selectedObject, false);
  state.selectedObject = obj;
  state.hasPendingTransform = false;
  state.ui.gizmoHud.style.display = "none";

  if (state.selectedObject) {
    state.transformGizmo.attach(state.selectedObject);
    applyHighlight(state.selectedObject, true);
    captureTransformSnapshot(state);

    const currentScale = state.selectedObject.scale.x;
    state.ui.shapeScale.value = currentScale.toFixed(2);
    state.ui.shapeScaleVal.textContent = currentScale.toFixed(2);

    const bevelWidth = state.selectedObject.userData.bevelWidth ??
      parseFloat(state.ui.bevelWidth.value);
    state.ui.bevelWidth.value = bevelWidth.toFixed(2);
    state.ui.bevelWidthVal.textContent = bevelWidth.toFixed(2);

    const bevelSegments = state.selectedObject.userData.bevelSegments ??
      parseInt(state.ui.bevelSegments.value, 10);
    state.ui.bevelSegments.value = bevelSegments.toString();
    state.ui.bevelSegmentsVal.textContent = bevelSegments.toString();

    if (state.selectedObject === state.baseMesh) {
      state.ui.labelActiveTarget.textContent = "Base Object";
      state.ui.labelActiveTarget.style.color = "#61afef";
      if (state.baseMesh && state.baseMesh.userData.shapeType) {
        state.ui.shapeSelect.value = state.baseMesh.userData.shapeType;
      }
    } else {
      const type = state.selectedObject.userData.shapeType || "cube";
      state.ui.labelActiveTarget.textContent = `Tool (${
        type.charAt(0).toUpperCase() + type.slice(1)
      })`;
      state.ui.labelActiveTarget.style.color = "#e06c75";
      state.ui.shapeSelect.value = type;
    }
  } else {
    state.transformGizmo.detach();
    state.transformSnapshot = null;
    state.ui.gizmoHud.style.display = "none";
    state.ui.labelActiveTarget.textContent = "None";
    state.ui.labelActiveTarget.style.color = "#888888";
  }
  updateUiControlsAvailability(state);
  updateTargetDimensions(state);
}

export function confirmTransform(state: AppState): void {
  if (!state.selectedObject) return;

  captureTransformSnapshot(state);
  state.hasPendingTransform = false;
  state.ui.gizmoHud.style.display = "none";
  updateTargetDimensions(state);
}

export function cancelTransform(state: AppState): void {
  if (!state.selectedObject || !state.transformSnapshot) return;

  state.selectedObject.position.copy(state.transformSnapshot.position);
  state.selectedObject.quaternion.copy(state.transformSnapshot.quaternion);
  state.selectedObject.scale.copy(state.transformSnapshot.scale);

  state.selectedObject.updateMatrixWorld(true);
  state.transformGizmo.attach(state.selectedObject);

  state.hasPendingTransform = false;
  state.ui.gizmoHud.style.display = "none";
  updateTargetDimensions(state);
  updateUiControlsAvailability(state);
}

export function getSelectableRoot(
  obj: THREE.Object3D,
  sceneRoot: THREE.Scene,
): THREE.Object3D | null {
  let curr: THREE.Object3D | null = obj;
  while (curr && curr.parent && curr.parent !== sceneRoot) {
    curr = curr.parent;
  }
  return curr;
}

export function sendParameters(state: AppState): void {
  const payload = {
    shape: state.ui.shapeSelect.value,
    scale: parseFloat(state.ui.shapeScale.value),
    bevel_width: parseFloat(state.ui.bevelWidth.value),
    bevel_segments: parseInt(state.ui.bevelSegments.value, 10),
  };
}

export function addSecondaryShape(state: AppState): void {
  const shapeType = state.ui.shapeSelect.value;
  const bevelWidth = parseFloat(state.ui.bevelWidth.value);
  const bevelSegments = parseInt(state.ui.bevelSegments.value, 10);

  const geom = createPrimitiveGeometry(
    shapeType,
    state.monkeyGeometry,
    bevelWidth,
    bevelSegments,
  );

  const mat = new THREE.MeshStandardMaterial({
    color: 0xe06c75,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.shapeType = shapeType;
  mesh.userData.bevelWidth = bevelWidth;
  mesh.userData.bevelSegments = bevelSegments;
  mesh.position.set(0, 0.5, 0);

  state.scene.add(mesh);
  state.shapeStack.push(mesh);
  selectObject(state, mesh);
}

export function deleteSelectedShape(state: AppState): void {
  if (!state.selectedObject || state.selectedObject === state.baseMesh) return;

  const target = state.selectedObject as THREE.Mesh;
  const idx = state.shapeStack.indexOf(target);
  if (idx !== -1) {
    state.shapeStack.splice(idx, 1);
  }

  state.scene.remove(target);

  if (state.shapeStack.length > 0) {
    selectObject(state, state.shapeStack.at(-1)!);
  }
  else {
    selectObject(state, state.baseMesh);
  }
}

export function toRelativeTransform(
  toolObj: THREE.Object3D,
  baseMesh: THREE.Object3D | null,
) {
  toolObj.updateMatrixWorld(true);
  if (baseMesh) baseMesh.updateMatrixWorld(true);

  const invBase = baseMesh
    ? baseMesh.matrixWorld.clone().invert()
    : new THREE.Matrix4();
  const relMatrix = new THREE.Matrix4().multiplyMatrices(
    invBase,
    toolObj.matrixWorld,
  );

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  relMatrix.decompose(pos, quat, scale);

  const euler = new THREE.Euler().setFromQuaternion(quat, "XYZ");
  const rot = [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z),
  ];

  return { pos, quat, rot, scale };
}

export function updateGizmoHud(state: AppState): void {
  const target = state.transformGizmo.object ?? state.selectedObject;
  if (!target || !state.hasPendingTransform) {
    state.ui.gizmoHud.style.display = "none";
    return;
  }

  state.camera.updateMatrixWorld(true);

  const worldPos = new THREE.Vector3();
  target.getWorldPosition(worldPos);

  const cameraLocalPos = worldPos.clone().applyMatrix4(
    state.camera.matrixWorldInverse,
  );
  if (cameraLocalPos.z >= 0) {
    state.ui.gizmoHud.style.display = "none";
    return;
  }

  const screenPos = worldPos.clone().project(state.camera);
  const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

  state.ui.gizmoHud.style.display = "flex";
  state.ui.gizmoHud.style.transform = `translate3d(${screenX + 45}px, ${screenY - 45}px, 0)`;
}

export function setupEventListeners(state: AppState): void {
  state.transformGizmo.addEventListener(
    "dragging-changed",
    (event: { value: boolean }) => {
      state.orbit.enabled = !event.value;
      state.isGizmoInteracting = event.value;
      if (!event.value) {
        updateTargetDimensions(state);
      }
    },
  );

  state.ui.btnExtrude.addEventListener("click", () => {
    setExtrudeMode(state, !state.isExtrudeMode);
  });

  state.transformGizmo.addEventListener("objectChange", () => {
    state.hasPendingTransform = true;
  });

  state.transformGizmo.addEventListener("change", () => {
    updateTargetDimensions(state);
    updateUiControlsAvailability(state);
  });

  state.ui.hudConfirm.addEventListener("click", () => {
    confirmTransform(state);
  });

  state.ui.hudCancel.addEventListener("click", () => {
    cancelTransform(state);
  });

  state.ui.addShapeBtn.addEventListener("click", () => {
    addSecondaryShape(state);
  });

  // Switch modes from Move/Rotate/Scale back to standard transforms
  state.ui.btnTranslate.addEventListener("click", () => {
    setExtrudeMode(state, false);
    state.transformGizmo.setMode("translate");
  });

  state.ui.btnRotate.addEventListener("click", () => {
    setExtrudeMode(state, false);
    state.transformGizmo.setMode("rotate");
  });

  state.ui.btnScale.addEventListener("click", () => {
    setExtrudeMode(state, false);
    state.transformGizmo.setMode("scale");
  });

  state.ui.btnDelete.addEventListener("click", () => {
    deleteSelectedShape(state);
  });

  state.ui.btnUnion.addEventListener("click", () => {
    commitBoolean(state, "UNION");
  });

  state.ui.btnDiff.addEventListener("click", () => {
    commitBoolean(state, "DIFFERENCE");
  });

  state.ui.btnUndo.addEventListener("click", () => {
    triggerUndo(state);
  });

  state.ui.btnRedo.addEventListener("click", () => {
    triggerRedo(state);
  });

  state.ui.shapeScale.addEventListener("input", (e: Event) => {
    const isBaseSelected = !state.selectedObject ||
      state.selectedObject === state.baseMesh;
    if (isBaseSelected && state.hasBooleans) {
      return;
    }

    const val = parseFloat((e.target as HTMLInputElement).value);
    state.ui.shapeScaleVal.textContent = val.toFixed(2);

    if (state.selectedObject) {
      state.selectedObject.scale.set(val, val, val);
      state.hasPendingTransform = true;
      updateTargetDimensions(state);
      state.selectedObject.updateMatrixWorld(true);

      if (state.selectedObject === state.baseMesh) {
        sendParameters(state);
      }
    }
  });

  state.ui.shapeSelect.addEventListener("change", () => {
    const newType = state.ui.shapeSelect.value;

    if (state.selectedObject && state.selectedObject !== state.baseMesh) {
      // Update secondary tool shape
      const target = state.selectedObject as THREE.Mesh;
      const bevelWidth = target.userData.bevelWidth ??
        parseFloat(state.ui.bevelWidth.value);
      const bevelSegments = target.userData.bevelSegments ??
        parseInt(state.ui.bevelSegments.value, 10);

      target.geometry.dispose();
      target.geometry = createPrimitiveGeometry(
        newType,
        state.monkeyGeometry,
        bevelWidth,
        bevelSegments,
      );
      target.userData.shapeType = newType;
      state.ui.labelActiveTarget.textContent = `Tool (${
        newType.charAt(0).toUpperCase() + newType.slice(1)
      })`;
    }
    else {
      // Target is baseMesh (or nothing selected, defaults to base)
      if (state.hasBooleans) {
        // Revert select dropdown if locked by existing booleans
        if (state.baseMesh?.userData?.shapeType) {
          state.ui.shapeSelect.value = state.baseMesh.userData.shapeType;
        }
        return;
      }

      state.currentBaseShape = newType;
      state.undoCount = 0;
      state.redoCount = 0;
      state.hasBooleans = false;
      (state as any).currentManifold = null;

      if (state.baseMesh) {
        state.baseMesh.userData.shapeType = newType;
        const bevelWidth = parseFloat(state.ui.bevelWidth.value);
        const bevelSegments = parseInt(state.ui.bevelSegments.value, 10);

        // Swap geometry on baseMesh
        if ((state.baseMesh as THREE.Mesh).isMesh) {
          const mesh = state.baseMesh as THREE.Mesh;
          mesh.geometry.dispose();
          mesh.geometry = createPrimitiveGeometry(
            newType,
            state.monkeyGeometry,
            bevelWidth,
            bevelSegments,
          );
        }
        else {
          // Fallback for compound objects
          state.baseMesh.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.geometry.dispose();
              mesh.geometry = createPrimitiveGeometry(
                newType,
                state.monkeyGeometry,
                bevelWidth,
                bevelSegments,
              );
            }
          });
        }
      }

      sendParameters(state);
    }

    updateUiControlsAvailability(state);
    updateTargetDimensions(state);
  });

  state.ui.bevelWidth.addEventListener("input", (e: Event) => {
    const isBaseSelected = !state.selectedObject ||
      state.selectedObject === state.baseMesh;
    if (isBaseSelected && state.hasBooleans) return;

    const target = e.target as HTMLInputElement;
    state.ui.bevelWidthVal.textContent = target.value;
    updateSelectedGeometry(state);
  });

  state.ui.bevelWidth.addEventListener("change", () => {
    const isBaseSelected = !state.selectedObject ||
      state.selectedObject === state.baseMesh;
    if (isBaseSelected && state.hasBooleans) return;

    if (isBaseSelected) {
      sendParameters(state);
    }
  });

  state.ui.bevelSegments.addEventListener("input", (e: Event) => {
    const isBaseSelected = !state.selectedObject ||
      state.selectedObject === state.baseMesh;
    if (isBaseSelected && state.hasBooleans) return;

    const target = e.target as HTMLInputElement;
    state.ui.bevelSegmentsVal.textContent = target.value;
    updateSelectedGeometry(state);
  });

  state.ui.bevelSegments.addEventListener("change", () => {
    const isBaseSelected = !state.selectedObject ||
      state.selectedObject === state.baseMesh;
    if (isBaseSelected && state.hasBooleans) return;

    if (isBaseSelected) {
      sendParameters(state);
    }
  });

  self.addEventListener("pointerdown", (e: PointerEvent) => {
    state.pointerStartX = e.clientX;
    state.pointerStartY = e.clientY;
  });

  self.addEventListener("pointerup", (e: PointerEvent) => {
    if (e.target !== state.ui.canvas) return;
    if (state.isGizmoInteracting || state.transformGizmo.axis !== null) return;

    const deltaX = Math.abs(e.clientX - state.pointerStartX);
    const deltaY = Math.abs(e.clientY - state.pointerStartY);
    if (deltaX > 5 || deltaY > 5) return;

    const rect = state.ui.canvas.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, state.camera);

    const toolHits = state.raycaster.intersectObjects(state.shapeStack, false);
    if (toolHits.length > 0) {
      selectObject(state, toolHits[0].object);
      return;
    }

    if (state.baseMesh) {
      const baseHits = state.raycaster.intersectObjects([state.baseMesh], true);
      if (baseHits.length > 0) {
        const root = getSelectableRoot(baseHits[0].object, state.scene);
        selectObject(state, root ?? state.baseMesh);
        return;
      }
    }
    selectObject(state, null);
  });

  self.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (
        e.key.toLowerCase() === "y" ||
        (e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        triggerRedo(state);
        return;
      }
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        triggerUndo(state);
        return;
      }
    }

    if (e.key === "f" || e.key === "F") {
      setExtrudeMode(state, !state.isExtrudeMode);
    }
    if (e.key === "w" || e.key === "W") {
      setExtrudeMode(state, false);
      state.transformGizmo.setMode("translate");
    }
    if (e.key === "e" || e.key === "E") {
      setExtrudeMode(state, false);
      state.transformGizmo.setMode("rotate");
    }
    if (e.key === "r" || e.key === "R") {
      setExtrudeMode(state, false);
      state.transformGizmo.setMode("scale");
    }
  });

  // Pointer Move: Hover highlighting and Extrude dragging
  self.addEventListener("pointermove", (e: PointerEvent) => {
    if (!state.isExtrudeMode || !state.baseMesh) return;

    const rect = state.ui.canvas.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Active drag: update live preview prism along screen-projected face normal
    if (state.isExtruding && state.activeExtrudeRegion && state.extrudePreviewMesh) {
      const deltaScreenX = e.clientX - state.pointerStartX;
      const deltaScreenY = -(e.clientY - state.pointerStartY);
      const mouseDelta = new THREE.Vector2(deltaScreenX, deltaScreenY);

      const projectedDist = mouseDelta.dot(state.extrudeScreenDir);
      state.extrudeDistance = projectedDist * 0.01;

      // Colorize preview: Green for pull, Orange/Red for push
      const mat = state.extrudePreviewMesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.color.setHex(state.extrudeDistance >= 0 ? 0x98c379 : 0xe06c75);
      }

      state.extrudePreviewMesh.geometry.dispose();
      state.extrudePreviewMesh.geometry = createExtrusionPrismGeometry(
        (state.baseMesh as THREE.Mesh).geometry,
        state.activeExtrudeRegion,
        state.extrudeDistance,
      );
      state.extrudePreviewMesh.visible = true;
      return;
    }

    // Hover state: raycast onto baseMesh to find coplanar region under cursor
    state.raycaster.setFromCamera(state.mouse, state.camera);
    const hits = state.raycaster.intersectObject(state.baseMesh, false);

    if (hits.length > 0 && hits[0].faceIndex !== undefined) {
      const geom = (state.baseMesh as THREE.Mesh).geometry;
      const region = getCoplanarRegion(geom, hits[0].faceIndex);
      state.hoveredRegion = region;
      updateFaceHighlight(state, region);
    } else {
      state.hoveredRegion = null;
      updateFaceHighlight(state, null);
    }
  });

  // Pointer Down: Lock camera and initiate extrusion
  self.addEventListener("pointerdown", (e: PointerEvent) => {
    state.pointerStartX = e.clientX;
    state.pointerStartY = e.clientY;

    if (state.isExtrudeMode && state.hoveredRegion && state.baseMesh) {
      state.isExtruding = true;
      state.orbit.enabled = false;
      state.activeExtrudeRegion = state.hoveredRegion;
      state.extrudeDistance = 0;

      // Project face normal to screen space so mouse movement follows the 3D vector
      const origin = state.activeExtrudeRegion.vertices[0] ?? new THREE.Vector3();
      const worldNorm = state.activeExtrudeRegion.normal.clone();
      const p0 = origin.clone().project(state.camera);
      const p1 = origin.clone().add(worldNorm).project(state.camera);

      state.extrudeScreenDir.set(p1.x - p0.x, p1.y - p0.y).normalize();
      if (state.extrudeScreenDir.lengthSq() < 1e-4) {
        state.extrudeScreenDir.set(0, 1);
      }
    }
  });

  // Pointer Up: Commit boolean extrusion to Manifold and cleanup
  self.addEventListener("pointerup", (e: PointerEvent) => {
    if (state.isExtruding && state.activeExtrudeRegion) {
      applyFaceExtrusion(state, state.activeExtrudeRegion, state.extrudeDistance);

      state.isExtruding = false;
      state.orbit.enabled = true;
      state.activeExtrudeRegion = null;

      if (state.extrudePreviewMesh) {
        state.extrudePreviewMesh.visible = false;
      }

      updateTargetDimensions(state);
      updateUiControlsAvailability(state);

      // Re-evaluate hover under final pointer position
      const rect = state.ui.canvas.getBoundingClientRect();
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      state.raycaster.setFromCamera(state.mouse, state.camera);

      if (state.baseMesh) {
        const hits = state.raycaster.intersectObject(state.baseMesh, false);
        if (hits.length > 0 && hits[0].faceIndex !== undefined) {
          state.hoveredRegion = getCoplanarRegion(
            (state.baseMesh as THREE.Mesh).geometry,
            hits[0].faceIndex,
          );
        } else {
          state.hoveredRegion = null;
        }
      }
      updateFaceHighlight(state, state.hoveredRegion);
      return;
    }

    if (e.target !== state.ui.canvas || state.isExtrudeMode) return;
    if (state.isGizmoInteracting || state.transformGizmo.axis !== null) return;

    const deltaX = Math.abs(e.clientX - state.pointerStartX);
    const deltaY = Math.abs(e.clientY - state.pointerStartY);
    if (deltaX > 5 || deltaY > 5) return;

    const rect = state.ui.canvas.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.mouse, state.camera);

    const toolHits = state.raycaster.intersectObjects(state.shapeStack, false);
    if (toolHits.length > 0) {
      selectObject(state, toolHits[0].object);
      return;
    }

    if (state.baseMesh) {
      const baseHits = state.raycaster.intersectObjects([state.baseMesh], true);
      if (baseHits.length > 0) {
        const root = getSelectableRoot(baseHits[0].object, state.scene);
        selectObject(state, root ?? state.baseMesh);
        return;
      }
    }
    selectObject(state, null);
  });

  self.addEventListener("resize", () => {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const btnExportGlb = document.getElementById("btn-export-glb");
  if (btnExportGlb) {
    btnExportGlb.addEventListener("click", () => {
      console.log("Download .glb clicked");
      exportGLB(state);
    });
  }
  else {
    console.error("Could not find #btn-export-glb in DOM");
  }

  const btnExportStl = document.getElementById("btn-export-stl");
  if (btnExportStl) {
    btnExportStl.addEventListener("click", () => {
      console.log("Download .stl clicked");
      exportSTL(state);
    });
  }
  else {
    console.error("Could not find #btn-export-stl in DOM");
  }
}

export function startRenderLoop(state: AppState): void {
  function renderFrame(): void {
    requestAnimationFrame(renderFrame);
    state.orbit.update();
    updateGizmoHud(state);
    state.renderer.render(state.scene, state.camera);
  }
  renderFrame();
}

export function commitBoolean(
  state: AppState,
  operation: "UNION" | "DIFFERENCE",
): void {
  if (state.shapeStack.length === 0 || !state.baseMesh) return;

  const toolObj =
    state.selectedObject && state.selectedObject !== state.baseMesh
      ? (state.selectedObject as THREE.Mesh)
      : state.shapeStack.at(-1)!;

  // 1. Bake the Tool Mesh's exact 4x4 World Transform directly into its vertices
  toolObj.updateMatrixWorld(true);
  const toolWorldGeom = toolObj.geometry.clone();
  toolWorldGeom.applyMatrix4(toolObj.matrixWorld);
  const toolSolid = geometryToManifold(toolWorldGeom);
  toolWorldGeom.dispose();

  // 2. Ensure Base Manifold exists, baked into World Space
  if (!(state as any).currentManifold) {
    state.baseMesh.updateMatrixWorld(true);
    const baseWorldGeom = (state.baseMesh as THREE.Mesh).geometry.clone();
    baseWorldGeom.applyMatrix4(state.baseMesh.matrixWorld);
    (state as any).currentManifold = geometryToManifold(baseWorldGeom);
    baseWorldGeom.dispose();
  }

  // 3. Save state for Undo
  (state as any).manifoldUndoStack.push((state as any).currentManifold);
  (state as any).manifoldRedoStack.length = 0;
  state.undoCount = (state as any).manifoldUndoStack.length;
  state.redoCount = 0;
  state.hasBooleans = true;

  // 4. Perform CSG Boolean in Manifold (both solids are now in exact World Space)
  const base = (state as any).currentManifold;
  (state as any).currentManifold =
    operation === "UNION" ? base.add(toolSolid) : base.subtract(toolSolid);

  // 5. Update Base Mesh Geometry
  const newGeom = manifoldToBufferGeometry((state as any).currentManifold);
  if ((state.baseMesh as THREE.Mesh).isMesh) {
    (state.baseMesh as THREE.Mesh).geometry.dispose();
    (state.baseMesh as THREE.Mesh).geometry = newGeom;
  }

  // Reset base mesh transform back to identity since world coords are baked into the vertices
  state.baseMesh.position.set(0, 0, 0);
  state.baseMesh.rotation.set(0, 0, 0);
  state.baseMesh.scale.set(1, 1, 1);
  state.baseMesh.updateMatrixWorld(true);

  // 6. Clean up scene tool
  state.transformGizmo.detach();
  state.scene.remove(toolObj);
  const idx = state.shapeStack.indexOf(toolObj);
  if (idx !== -1) state.shapeStack.splice(idx, 1);

  selectObject(state, null);
  updateTargetDimensions(state);
}

export function updateUiControlsAvailability(state: AppState): void {
  const dropdownIsMonkey = state.ui.shapeSelect.value === "monkey";
  const baseIsMonkey = state.currentBaseShape === "monkey" ||
    state.baseMesh?.userData?.shapeType === "monkey";

  const isToolSelected = state.selectedObject != null &&
    state.selectedObject !== state.baseMesh &&
    state.shapeStack.includes(state.selectedObject as THREE.Mesh);

  let selectedIsMonkey = false;
  if (state.selectedObject) {
    selectedIsMonkey = state.selectedObject.userData.shapeType === "monkey" ||
      (state.baseMesh != null &&
        (state.selectedObject === state.baseMesh ||
          state.baseMesh.getObjectById(state.selectedObject.id) != null) &&
        baseIsMonkey);
  }

  const isMonkeyActive = dropdownIsMonkey || baseIsMonkey || selectedIsMonkey;

  // Lock base modifications once boolean operations have been performed
  const isBaseOrNone = !isToolSelected;
  const lockBase = isBaseOrNone && state.hasBooleans;

  // Check scale uniformity of the currently active target
  const activeTarget = state.selectedObject ?? state.baseMesh;
  const isNonUniform = activeTarget ? !isUniformScale(activeTarget.scale) : false;

  // Scale Slider (disabled if base is locked or active target has anisotropic scaling)
  const disableScaleSlider = lockBase || isNonUniform;
  state.ui.shapeScale.disabled = disableScaleSlider;
  state.ui.shapeScale.style.opacity = disableScaleSlider ? "0.35" : "1.0";
  state.ui.shapeScale.style.cursor = disableScaleSlider ? "not-allowed" : "auto";

  if (activeTarget) {
    if (isNonUniform) {
      state.ui.shapeScaleVal.textContent = "mixed";
    } else {
      state.ui.shapeScale.value = activeTarget.scale.x.toFixed(2);
      state.ui.shapeScaleVal.textContent = activeTarget.scale.x.toFixed(2);
    }
  }

  // Scale Gizmo Button (only locked on base if booleans exist)
  state.ui.btnScale.disabled = lockBase;
  state.ui.btnScale.style.opacity = lockBase ? "0.35" : "1.0";
  state.ui.btnScale.style.cursor = lockBase ? "not-allowed" : "pointer";

  // Bevel Sliders
  const disableBevels = isMonkeyActive || lockBase;
  const bevelOpacity = disableBevels ? "0.35" : "1.0";
  const bevelCursor = disableBevels ? "not-allowed" : "auto";

  state.ui.bevelWidth.disabled = disableBevels;
  state.ui.bevelSegments.disabled = disableBevels;
  state.ui.bevelWidth.style.opacity = bevelOpacity;
  state.ui.bevelWidth.style.cursor = bevelCursor;
  state.ui.bevelSegments.style.opacity = bevelOpacity;
  state.ui.bevelSegments.style.cursor = bevelCursor;

  // Boolean Action Buttons
  const disableBooleans = isMonkeyActive || state.shapeStack.length === 0;
  const booleanOpacity = disableBooleans ? "0.35" : "1.0";
  const booleanCursor = disableBooleans ? "not-allowed" : "pointer";
  const pointerEvents = disableBooleans ? "none" : "auto";

  state.ui.btnUnion.disabled = disableBooleans;
  state.ui.btnUnion.style.opacity = booleanOpacity;
  state.ui.btnUnion.style.cursor = booleanCursor;
  state.ui.btnUnion.style.pointerEvents = pointerEvents;

  state.ui.btnDiff.disabled = disableBooleans;
  state.ui.btnDiff.style.opacity = booleanOpacity;
  state.ui.btnDiff.style.cursor = booleanCursor;
  state.ui.btnDiff.style.pointerEvents = pointerEvents;

  // Undo & Redo Buttons
  const canUndo = state.undoCount > 0 && !isMonkeyActive;
  state.ui.btnUndo.disabled = !canUndo;
  state.ui.btnUndo.style.opacity = canUndo ? "1.0" : "0.35";
  state.ui.btnUndo.style.cursor = canUndo ? "pointer" : "not-allowed";
  state.ui.btnUndo.style.pointerEvents = canUndo ? "auto" : "none";

  const canRedo = state.redoCount > 0 && !isMonkeyActive;
  state.ui.btnRedo.disabled = !canRedo;
  state.ui.btnRedo.style.opacity = canRedo ? "1.0" : "0.35";
  state.ui.btnRedo.style.cursor = canRedo ? "pointer" : "not-allowed";
  state.ui.btnRedo.style.pointerEvents = canRedo ? "auto" : "none";
}

export function triggerUndo(state: AppState): void {
  if (state.shapeStack.length > 0) {
    deleteSelectedShape(state);
    return;
  }

  const stack = (state as any).manifoldUndoStack;
  if (!stack || stack.length === 0) return;

  (state as any).manifoldRedoStack.push((state as any).currentManifold);
  (state as any).currentManifold = stack.pop();

  state.undoCount = stack.length;
  state.redoCount = (state as any).manifoldRedoStack.length;
  if (state.undoCount === 0) state.hasBooleans = false;

  const newGeom = manifoldToBufferGeometry((state as any).currentManifold);
  if (state.baseMesh && (state.baseMesh as THREE.Mesh).isMesh) {
    (state.baseMesh as THREE.Mesh).geometry.dispose();
    (state.baseMesh as THREE.Mesh).geometry = newGeom;
  }

  if (state.baseMesh) {
    state.baseMesh.position.set(0, 0, 0);
    state.baseMesh.rotation.set(0, 0, 0);
    state.baseMesh.scale.set(1, 1, 1);
    state.baseMesh.updateMatrixWorld(true);
  }

  updateUiControlsAvailability(state);
  updateTargetDimensions(state);
}

export function triggerRedo(state: AppState): void {
  const stack = (state as any).manifoldRedoStack;
  if (!stack || stack.length === 0) return;

  (state as any).manifoldUndoStack.push((state as any).currentManifold);
  (state as any).currentManifold = stack.pop();

  state.undoCount = (state as any).manifoldUndoStack.length;
  state.redoCount = stack.length;
  state.hasBooleans = true;

  const newGeom = manifoldToBufferGeometry((state as any).currentManifold);
  if (state.baseMesh && (state.baseMesh as THREE.Mesh).isMesh) {
    (state.baseMesh as THREE.Mesh).geometry.dispose();
    (state.baseMesh as THREE.Mesh).geometry = newGeom;
  }

  if (state.baseMesh) {
    state.baseMesh.position.set(0, 0, 0);
    state.baseMesh.rotation.set(0, 0, 0);
    state.baseMesh.scale.set(1, 1, 1);
    state.baseMesh.updateMatrixWorld(true);
  }

  updateUiControlsAvailability(state);
  updateTargetDimensions(state);
}

const _measureBox = new THREE.Box3();
const _measureSize = new THREE.Vector3();

export function updateTargetDimensions(state: AppState): void {
  if (!state.ui.targetDimensions) return;

  const target = state.selectedObject ?? state.baseMesh;
  if (!target) {
    state.ui.targetDimensions.textContent = "--";
    return;
  }

  target.updateMatrixWorld(true);
  _measureBox.setFromObject(target);
  _measureBox.getSize(_measureSize);

  state.ui.targetDimensions.textContent = `${_measureSize.x.toFixed(2)} x ${
    _measureSize.y.toFixed(2)
  } x ${_measureSize.z.toFixed(2)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportGLB(state: AppState) {
  if (!state.baseMesh) {
    console.warn("exportGLB: No baseMesh present in state.");
    return;
  }
  console.log("Generating GLB export...");
  const exporter = new GLTFExporter();
  exporter.parse(
    state.baseMesh,
    (gltf) => {
      const blob = new Blob([gltf as ArrayBuffer], {
        type: "model/gltf-binary",
      });
      downloadBlob(blob, "smoothie_model.glb");
      console.log("GLB download triggered.");
    },
    (err) => console.error("GLB Export Error:", err),
    { binary: true },
  );
}

export function exportSTL(state: AppState) {
  if (!state.baseMesh) {
    console.warn("exportSTL: No baseMesh present in state.");
    return;
  }
  console.log("Generating STL export...");
  const exporter = new STLExporter();
  const result = exporter.parse(state.baseMesh, { binary: true });
  const blob = new Blob([result.buffer], { type: "model/stl" });
  downloadBlob(blob, "smoothie_model.stl");
  console.log("STL download triggered.");
}

export function isUniformScale(scale: THREE.Vector3, eps = 1e-4): boolean {
  return (
    Math.abs(scale.x - scale.y) < eps &&
    Math.abs(scale.y - scale.z) < eps
  );
}

export function setExtrudeMode(state: AppState, enabled: boolean): void {
  state.isExtrudeMode = enabled;

  if (enabled) {
    state.transformGizmo.detach();
    state.ui.btnExtrude.style.background = "#3e4451";
    state.ui.btnExtrude.style.borderColor = "#61afef";
  } else {
    state.ui.btnExtrude.style.background = "#222";
    state.ui.btnExtrude.style.borderColor = "#444";
    if (state.extrudeOutline) state.extrudeOutline.visible = false;
    if (state.extrudePreviewMesh) state.extrudePreviewMesh.visible = false;
    state.hoveredRegion = null;
    state.activeExtrudeRegion = null;

    if (state.selectedObject) {
      state.transformGizmo.attach(state.selectedObject);
    }
  }
}

export function updateFaceHighlight(state: AppState, region: CoplanarRegion | null): void {
  if (!state.extrudeOutline) return;

  if (!region || !state.baseMesh) {
    state.extrudeOutline.visible = false;
    return;
  }

  const linePositions: number[] = [];
  for (const edge of region.boundaryEdges) {
    linePositions.push(
      edge.start.x, edge.start.y, edge.start.z,
      edge.end.x, edge.end.y, edge.end.z,
    );
  }

  state.extrudeOutline.geometry.dispose();
  state.extrudeOutline.geometry = new THREE.BufferGeometry();
  state.extrudeOutline.geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3),
  );
  state.extrudeOutline.position.copy(state.baseMesh.position);
  state.extrudeOutline.rotation.copy(state.baseMesh.rotation);
  state.extrudeOutline.scale.copy(state.baseMesh.scale);
  state.extrudeOutline.visible = true;
}
