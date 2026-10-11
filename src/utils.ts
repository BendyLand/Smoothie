import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { TransformControls } from 'three/addons/TransformControls.js';

export interface AppUI {
  canvas: HTMLCanvasElement;
  shapeSelect: HTMLSelectElement;
  labelActiveTarget: HTMLElement;
  addShapeBtn: HTMLButtonElement;
  btnTranslate: HTMLButtonElement;
  btnRotate: HTMLButtonElement;
  btnDelete: HTMLButtonElement;
  btnUnion: HTMLButtonElement;
  btnDiff: HTMLButtonElement;
  bevelWidth: HTMLInputElement;
  bevelWidthVal: HTMLSpanElement;
  bevelSegments: HTMLInputElement;
  bevelSegmentsVal: HTMLSpanElement;
  gizmoHud: HTMLElement;
  hudConfirm: HTMLButtonElement;
  hudCancel: HTMLButtonElement;
}

export interface TransformSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface AppState {
  ui: AppUI;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  transformGizmo: TransformControls;
  loader: GLTFLoader;
  socket: WebSocket;
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
}

export function createAppState(): AppState {
  const canvas = document.getElementById('viewport') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181818);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
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

  const wsUrl = `ws://${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);
  socket.binaryType = 'arraybuffer';

  const ui: AppUI = {
    canvas,
    shapeSelect: document.getElementById('shape-select') as HTMLSelectElement,
    labelActiveTarget: document.getElementById('active-target-label') as HTMLElement,
    addShapeBtn: document.getElementById('add-shape-btn') as HTMLButtonElement,
    btnTranslate: document.getElementById('mode-translate') as HTMLButtonElement,
    btnRotate: document.getElementById('mode-rotate') as HTMLButtonElement,
    btnDelete: document.getElementById('btn-delete') as HTMLButtonElement,
    btnUnion: document.getElementById('btn-union') as HTMLButtonElement,
    btnDiff: document.getElementById('btn-diff') as HTMLButtonElement,
    bevelWidth: document.getElementById('bevel-width') as HTMLInputElement,
    bevelWidthVal: document.getElementById('bevel-width-val') as HTMLSpanElement,
    bevelSegments: document.getElementById('bevel-segments') as HTMLInputElement,
    bevelSegmentsVal: document.getElementById('bevel-segments-val') as HTMLSpanElement,
    gizmoHud: document.getElementById('gizmo-hud') as HTMLElement,
    hudConfirm: document.getElementById('hud-confirm') as HTMLButtonElement,
    hudCancel: document.getElementById('hud-cancel') as HTMLButtonElement,
  };

  return {
    ui,
    renderer,
    scene,
    camera,
    orbit,
    transformGizmo,
    loader: new GLTFLoader(),
    socket,
    baseMesh: null,
    shapeStack: [],
    selectedObject: null,
    currentBaseShape: 'cube',
    monkeyGeometry: null,
    isGizmoInteracting: false,
    pointerStartX: 0,
    pointerStartY: 0,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    transformSnapshot: null,
    hudScreenVector: new THREE.Vector3(),
  };
}

export function initMonkeyCache(state: AppState): void {
  state.loader.load(
    '/monkey.glb',
    (gltf) => {
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !state.monkeyGeometry) {
          state.monkeyGeometry = (child as THREE.Mesh).geometry.clone();
        }
      });
    },
    undefined,
    (err) => {
      console.error('Failed to preload /monkey.glb:', err);
    }
  );
}

export function createPrimitiveGeometry(type: string, monkeyGeometry: THREE.BufferGeometry | null): THREE.BufferGeometry {
  if (type === 'cylinder') {
    return new THREE.CylinderGeometry(0.75, 0.75, 1.5, 32);
  } else if (type === 'cone') {
    return new THREE.ConeGeometry(0.75, 1.5, 32);
  } else if (type === 'monkey') {
    if (monkeyGeometry) {
      return monkeyGeometry.clone();
    }
    return new THREE.BoxGeometry(1.5, 1.5, 1.5);
  }
  return new THREE.BoxGeometry(1.5, 1.5, 1.5);
}

export function applyHighlight(obj: THREE.Object3D | null, isHighlighted: boolean): void {
  if (!obj) return;
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.emissive = isHighlighted ? new THREE.Color(0x334466) : new THREE.Color(0x000000);
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

export function selectObject(state: AppState, obj: THREE.Object3D | null): void {
  if (state.selectedObject === obj) return;

  applyHighlight(state.selectedObject, false);
  state.selectedObject = obj;

  if (state.selectedObject) {
    state.transformGizmo.attach(state.selectedObject);
    applyHighlight(state.selectedObject, true);
    captureTransformSnapshot(state);

    if (state.selectedObject === state.baseMesh) {
      state.ui.labelActiveTarget.textContent = 'Base Object';
      state.ui.labelActiveTarget.style.color = '#61afef';
      if (state.baseMesh && state.baseMesh.userData.shapeType) {
        state.ui.shapeSelect.value = state.baseMesh.userData.shapeType;
      }
    } else {
      const type = state.selectedObject.userData.shapeType || 'cube';
      state.ui.labelActiveTarget.textContent = `Tool (${type.charAt(0).toUpperCase() + type.slice(1)})`;
      state.ui.labelActiveTarget.style.color = '#e06c75';
      state.ui.shapeSelect.value = type;
    }
  } else {
    state.transformGizmo.detach();
    state.transformSnapshot = null;
    state.ui.gizmoHud.style.display = 'none';
    state.ui.labelActiveTarget.textContent = 'None';
    state.ui.labelActiveTarget.style.color = '#888888';
  }
}

export function getSelectableRoot(obj: THREE.Object3D, sceneRoot: THREE.Scene): THREE.Object3D | null {
  let curr: THREE.Object3D | null = obj;
  while (curr && curr.parent && curr.parent !== sceneRoot) {
    curr = curr.parent;
  }
  return curr;
}

export function sendParameters(state: AppState): void {
  if (state.socket.readyState !== WebSocket.OPEN) return;

  const payload = {
    shape: state.ui.shapeSelect.value,
    bevel_width: parseFloat(state.ui.bevelWidth.value),
    bevel_segments: parseInt(state.ui.bevelSegments.value, 10),
  };
  state.socket.send(JSON.stringify(payload));
}

export function addSecondaryShape(state: AppState): void {
  const shapeType = state.ui.shapeSelect.value;
  const geom = createPrimitiveGeometry(shapeType, state.monkeyGeometry);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xe06c75,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.shapeType = shapeType;
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
  } else {
    selectObject(state, state.baseMesh);
  }
}

export function cancelTransform(state: AppState): void {
  if (!state.selectedObject || !state.transformSnapshot) return;

  state.selectedObject.position.copy(state.transformSnapshot.position);
  state.selectedObject.quaternion.copy(state.transformSnapshot.quaternion);
  state.selectedObject.scale.copy(state.transformSnapshot.scale);

  state.selectedObject.updateMatrixWorld(true);
  state.transformGizmo.attach(state.selectedObject);
}

export function toBlenderTransform(
  obj: THREE.Object3D,
  baseMesh: THREE.Object3D | null
): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } {
  obj.updateMatrixWorld(true);

  const C = new THREE.Matrix4().set(
    1,  0,  0,  0,
    0,  0, -1,  0,
    0,  1,  0,  0,
    0,  0,  0,  1
  );
  const CInv = new THREE.Matrix4().set(
    1,  0,  0,  0,
    0,  0,  1,  0,
    0, -1,  0,  0,
    0,  0,  0,  1
  );

  let mRel: THREE.Matrix4;
  if (baseMesh && obj !== baseMesh) {
    baseMesh.updateMatrixWorld(true);
    const mBaseInv = baseMesh.matrixWorld.clone().invert();
    mRel = mBaseInv.multiply(obj.matrixWorld);
  } else {
    mRel = obj.matrixWorld.clone();
  }

  const mBlender = C.clone().multiply(mRel).multiply(CInv);

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mBlender.decompose(pos, quat, scale);

  return { pos, quat, scale };
}

export function confirmTransform(state: AppState): void {
  if (!state.selectedObject) return;

  captureTransformSnapshot(state);

  const isBase = state.selectedObject === state.baseMesh;
  const { pos, quat, scale } = toBlenderTransform(state.selectedObject, state.baseMesh);

  const payload = {
    action: 'lock_transform',
    target: isBase ? 'base' : 'tool',
    position: [pos.x, pos.y, pos.z],
    quaternion: [quat.w, quat.x, quat.y, quat.z],
    scale: [scale.x, scale.y, scale.z],
  };

  state.socket.send(JSON.stringify(payload));
}

export function commitBoolean(state: AppState, operation: 'UNION' | 'DIFFERENCE'): void {
  if (state.shapeStack.length === 0) {
    console.warn('No tool shape in stack to commit.');
    return;
  }

  const toolObj = (state.selectedObject && state.selectedObject !== state.baseMesh)
    ? (state.selectedObject as THREE.Mesh)
    : state.shapeStack.at(-1)!;

  const { pos, quat, scale } = toBlenderTransform(toolObj, state.baseMesh);

  const payload = {
    action: 'boolean',
    operation,
    tool_type: toolObj.userData.shapeType || 'cube',
    position: [pos.x, pos.y, pos.z],
    quaternion: [quat.w, quat.x, quat.y, quat.z],
    scale: [scale.x, scale.y, scale.z],
  };

  state.socket.send(JSON.stringify(payload));

  state.transformGizmo.detach();
  state.scene.remove(toolObj);

  const idx = state.shapeStack.indexOf(toolObj);
  if (idx !== -1) {
    state.shapeStack.splice(idx, 1);
  }

  state.selectedObject = null;
  state.ui.gizmoHud.style.display = 'none';
}

export function updateGizmoHud(state: AppState): void {
  const target = state.transformGizmo.object ?? state.selectedObject;
  console.log("1")
  if (!target) {
    state.ui.gizmoHud.style.display = 'none';
    return;
  }

  console.log("2")
  state.camera.updateMatrixWorld(true);

  const worldPos = new THREE.Vector3();
  target.getWorldPosition(worldPos);

  const cameraLocalPos = worldPos.clone().applyMatrix4(state.camera.matrixWorldInverse);
  if (cameraLocalPos.z >= 0) {
    state.ui.gizmoHud.style.display = 'none';
    return;
  }

  console.log("3")
  const screenPos = worldPos.clone().project(state.camera);
  const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

  state.ui.gizmoHud.style.display = 'flex';
  state.ui.gizmoHud.style.left = `${Math.round(screenX + 45)}px`;
  state.ui.gizmoHud.style.top = `${Math.round(screenY - 45)}px`;
  console.log("4")
}

export function setupWebSocket(state: AppState): void {
  state.socket.onopen = () => {
    console.log('Connected to Smoothie engine WebSocket.');
  };

  state.socket.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      state.loader.parse(
        event.data,
        '',
        (gltf: { scene: THREE.Group }) => {
          const wasBaseSelected = state.selectedObject === state.baseMesh || state.selectedObject === null;
          let prevPos = new THREE.Vector3();
          let prevRot = new THREE.Euler();
          let prevScale = new THREE.Vector3(1, 1, 1);

          if (state.baseMesh) {
            prevPos.copy(state.baseMesh.position);
            prevRot.copy(state.baseMesh.rotation);
            prevScale.copy(state.baseMesh.scale);
            state.scene.remove(state.baseMesh);
          }

          state.baseMesh = gltf.scene;
          state.baseMesh.userData.shapeType = state.currentBaseShape;
          state.baseMesh.position.copy(prevPos);
          state.baseMesh.rotation.copy(prevRot);
          state.baseMesh.scale.copy(prevScale);

          state.baseMesh.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                roughness: 0.35,
                metalness: 0.1,
              });
            }
          });

          state.scene.add(state.baseMesh);

          if (wasBaseSelected || state.shapeStack.length === 0) {
            selectObject(state, state.baseMesh);
          } else {
            selectObject(state, state.shapeStack.at(-1)!);
          }
        },
        (err: unknown) => {
          console.error('GLTF parsing error:', err);
        }
      );
    }
  };
}

export function setupEventListeners(state: AppState): void {
  state.transformGizmo.addEventListener('dragging-changed', (event: { value: boolean }) => {
    state.orbit.enabled = !event.value;
    state.isGizmoInteracting = event.value;
  });

  state.ui.hudConfirm.addEventListener('click', () => {
    confirmTransform(state);
  });

  state.ui.hudCancel.addEventListener('click', () => {
    cancelTransform(state);
  });

  state.ui.addShapeBtn.addEventListener('click', () => {
    addSecondaryShape(state);
  });

  state.ui.btnTranslate.addEventListener('click', () => {
    state.transformGizmo.setMode('translate');
  });

  state.ui.btnRotate.addEventListener('click', () => {
    state.transformGizmo.setMode('rotate');
  });

  state.ui.btnDelete.addEventListener('click', () => {
    deleteSelectedShape(state);
  });

  state.ui.btnUnion.addEventListener('click', () => {
    commitBoolean(state, 'UNION');
  });

  state.ui.btnDiff.addEventListener('click', () => {
    commitBoolean(state, 'DIFFERENCE');
  });

  state.ui.shapeSelect.addEventListener('change', () => {
    const newType = state.ui.shapeSelect.value;
    if (state.selectedObject && state.selectedObject !== state.baseMesh) {
      const target = state.selectedObject as THREE.Mesh;
      target.geometry.dispose();
      target.geometry = createPrimitiveGeometry(newType, state.monkeyGeometry);
      target.userData.shapeType = newType;
      state.ui.labelActiveTarget.textContent = `Tool (${newType.charAt(0).toUpperCase() + newType.slice(1)})`;
    } else {
      state.currentBaseShape = newType;
      sendParameters(state);
    }
  });

  state.ui.bevelWidth.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    state.ui.bevelWidthVal.textContent = target.value;
    if (!state.selectedObject || state.selectedObject === state.baseMesh) {
      sendParameters(state);
    }
  });

  state.ui.bevelSegments.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    state.ui.bevelSegmentsVal.textContent = target.value;
    if (!state.selectedObject || state.selectedObject === state.baseMesh) {
      sendParameters(state);
    }
  });

  window.addEventListener('pointerdown', (e: PointerEvent) => {
    state.pointerStartX = e.clientX;
    state.pointerStartY = e.clientY;
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
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

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'w' || e.key === 'W') state.transformGizmo.setMode('translate');
    if (e.key === 'e' || e.key === 'E') state.transformGizmo.setMode('rotate');
    if (e.key === 'Escape') cancelTransform(state);
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmTransform(state);
    }
  });

  window.addEventListener('resize', () => {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  });
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
