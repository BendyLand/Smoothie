import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { TransformControls } from "three/addons/TransformControls.js";
export function createAppState() {
  const canvas = document.getElementById("viewport");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(1579032);
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5, 4, 6);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  const transformGizmo = new TransformControls(camera, renderer.domElement);
  scene.add(transformGizmo);
  const ambientLight = new THREE.AmbientLight(16777215, 0.7);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(16777215, 1.2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);
  const grid = new THREE.GridHelper(10, 10, 4473924, 2236962);
  scene.add(grid);
  const wsUrl = `ws://${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";
  const ui = {
    canvas,
    shapeSelect: document.getElementById("shape-select"),
    labelActiveTarget: document.getElementById("active-target-label"),
    addShapeBtn: document.getElementById("add-shape-btn"),
    btnTranslate: document.getElementById("mode-translate"),
    btnRotate: document.getElementById("mode-rotate"),
    btnDelete: document.getElementById("btn-delete"),
    btnUnion: document.getElementById("btn-union"),
    btnDiff: document.getElementById("btn-diff"),
    bevelWidth: document.getElementById("bevel-width"),
    bevelWidthVal: document.getElementById("bevel-width-val"),
    bevelSegments: document.getElementById("bevel-segments"),
    bevelSegmentsVal: document.getElementById("bevel-segments-val"),
    shapeScale: document.getElementById("shape-scale"),
    shapeScaleVal: document.getElementById("shape-scale-val"),
    gizmoHud: document.getElementById("gizmo-hud"),
    hudConfirm: document.getElementById("hud-confirm"),
    hudCancel: document.getElementById("hud-cancel")
  };
  const state = {
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
    currentBaseShape: "cube",
    monkeyGeometry: null,
    isGizmoInteracting: false,
    pointerStartX: 0,
    pointerStartY: 0,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    transformSnapshot: null,
    hudScreenVector: new THREE.Vector3()
  };
  updateUiControlsAvailability(state);
  return state;
}
export function initMonkeyCache(state) {
  state.loader.load("./monkey.glb", (gltf) => {
    gltf.scene.traverse((child) => {
      if (child.isMesh && !state.monkeyGeometry) {
        state.monkeyGeometry = child.geometry.clone();
      }
    });
  }, void 0, (err) => {
    console.error("Failed to preload /monkey.glb:", err);
  });
}
export function createBeveledBoxGeometry(width, height, depth, bevelWidth, bevelSegments) {
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
      pos.setXYZ(i, cx + dx / len * b, cy + dy / len * b, cz + dz / len * b);
    }
  }
  geom.computeVertexNormals();
  return geom;
}
export function createBeveledCylinderGeometry(radius, height, bevelWidth, bevelSegments) {
  const maxBevel = Math.min(radius - 0.05, height / 2 - 0.05);
  const b = Math.max(0, Math.min(bevelWidth, maxBevel));
  const radialSegments = Math.max(16, bevelSegments * 8);
  if (b <= 0) {
    return new THREE.CylinderGeometry(radius, radius, height, radialSegments);
  }
  const points = [];
  const h2 = height / 2;
  points.push(new THREE.Vector2(0, -h2));
  points.push(new THREE.Vector2(radius - b, -h2));
  const arcSteps = Math.max(2, bevelSegments);
  for (let i = 1; i <= arcSteps; i++) {
    const angle = -Math.PI / 2 + Math.PI / 2 * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = -h2 + b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }
  for (let i = 1; i <= arcSteps; i++) {
    const angle = Math.PI / 2 * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = h2 - b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }
  points.push(new THREE.Vector2(0, h2));
  const geom = new THREE.LatheGeometry(points, radialSegments);
  geom.computeVertexNormals();
  return geom;
}
export function createBeveledConeGeometry(radius, height, bevelWidth, bevelSegments) {
  const maxBevel = Math.min(radius - 0.05, height / 2 - 0.05);
  const b = Math.max(0, Math.min(bevelWidth, maxBevel));
  const radialSegments = Math.max(16, bevelSegments * 8);
  if (b <= 0) {
    return new THREE.ConeGeometry(radius, height, radialSegments);
  }
  const points = [];
  const h2 = height / 2;
  points.push(new THREE.Vector2(0, -h2));
  points.push(new THREE.Vector2(radius - b, -h2));
  const arcSteps = Math.max(2, bevelSegments);
  for (let i = 1; i <= arcSteps; i++) {
    const angle = -Math.PI / 2 + Math.PI / 2 * (i / arcSteps);
    const x = radius - b + Math.cos(angle) * b;
    const y = -h2 + b + Math.sin(angle) * b;
    points.push(new THREE.Vector2(x, y));
  }
  points.push(new THREE.Vector2(0, h2));
  const geom = new THREE.LatheGeometry(points, radialSegments);
  geom.computeVertexNormals();
  return geom;
}
export function createPrimitiveGeometry(type, monkeyGeometry, bevelWidth = 0, bevelSegments = 4) {
  if (type === "cylinder") {
    return createBeveledCylinderGeometry(0.75, 1.5, bevelWidth, bevelSegments);
  } else if (type === "cone") {
    return createBeveledConeGeometry(0.75, 1.5, bevelWidth, bevelSegments);
  } else if (type === "monkey") {
    if (monkeyGeometry) {
      return monkeyGeometry.clone();
    }
    return createBeveledBoxGeometry(1.5, 1.5, 1.5, bevelWidth, bevelSegments);
  }
  return createBeveledBoxGeometry(1.5, 1.5, 1.5, bevelWidth, bevelSegments);
}
export function applyHighlight(obj, isHighlighted) {
  if (!obj)
    return;
  obj.traverse((child) => {
    if (child.isMesh) {
      const mesh = child;
      const mat = mesh.material;
      if (mat) {
        mat.emissive = isHighlighted ? new THREE.Color(3359846) : new THREE.Color(0);
      }
    }
  });
}
export function captureTransformSnapshot(state) {
  if (!state.selectedObject) {
    state.transformSnapshot = null;
    return;
  }
  state.transformSnapshot = {
    position: state.selectedObject.position.clone(),
    quaternion: state.selectedObject.quaternion.clone(),
    scale: state.selectedObject.scale.clone()
  };
}
export function updateSelectedGeometry(state) {
  if (!state.selectedObject)
    return;
  const bevelWidth = parseFloat(state.ui.bevelWidth.value);
  const bevelSegments = parseInt(state.ui.bevelSegments.value, 10);
  if (state.selectedObject !== state.baseMesh && state.selectedObject.isMesh) {
    const mesh = state.selectedObject;
    const shapeType = mesh.userData.shapeType || "cube";
    mesh.userData.bevelWidth = bevelWidth;
    mesh.userData.bevelSegments = bevelSegments;
    const oldGeom = mesh.geometry;
    mesh.geometry = createPrimitiveGeometry(shapeType, state.monkeyGeometry, bevelWidth, bevelSegments);
    oldGeom.dispose();
  } else if (state.selectedObject === state.baseMesh && state.baseMesh) {
    const shapeType = state.baseMesh.userData.shapeType || state.currentBaseShape || "cube";
    state.baseMesh.userData.bevelWidth = bevelWidth;
    state.baseMesh.userData.bevelSegments = bevelSegments;
    state.baseMesh.traverse((child) => {
      if (child.isMesh) {
        const mesh = child;
        const oldGeom = mesh.geometry;
        mesh.geometry = createPrimitiveGeometry(shapeType, state.monkeyGeometry, bevelWidth, bevelSegments);
        oldGeom.dispose();
      }
    });
  }
}
export function selectObject(state, obj) {
  if (state.selectedObject === obj)
    return;
  applyHighlight(state.selectedObject, false);
  state.selectedObject = obj;
  if (state.selectedObject) {
    state.transformGizmo.attach(state.selectedObject);
    applyHighlight(state.selectedObject, true);
    captureTransformSnapshot(state);
    const currentScale = state.selectedObject.scale.x;
    state.ui.shapeScale.value = currentScale.toFixed(2);
    state.ui.shapeScaleVal.textContent = currentScale.toFixed(2);
    const bevelWidth = state.selectedObject.userData.bevelWidth ?? parseFloat(state.ui.bevelWidth.value);
    state.ui.bevelWidth.value = bevelWidth.toFixed(2);
    state.ui.bevelWidthVal.textContent = bevelWidth.toFixed(2);
    const bevelSegments = state.selectedObject.userData.bevelSegments ?? parseInt(state.ui.bevelSegments.value, 10);
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
      state.ui.labelActiveTarget.textContent = `Tool (${type.charAt(0).toUpperCase() + type.slice(1)})`;
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
}
export function getSelectableRoot(obj, sceneRoot) {
  let curr = obj;
  while (curr && curr.parent && curr.parent !== sceneRoot) {
    curr = curr.parent;
  }
  return curr;
}
export function sendParameters(state) {
  if (state.socket.readyState !== WebSocket.OPEN)
    return;
  const payload = {
    shape: state.ui.shapeSelect.value,
    scale: parseFloat(state.ui.shapeScale.value),
    bevel_width: parseFloat(state.ui.bevelWidth.value),
    bevel_segments: parseInt(state.ui.bevelSegments.value, 10)
  };
  state.socket.send(JSON.stringify(payload));
}
export function addSecondaryShape(state) {
  const shapeType = state.ui.shapeSelect.value;
  const bevelWidth = parseFloat(state.ui.bevelWidth.value);
  const bevelSegments = parseInt(state.ui.bevelSegments.value, 10);
  const geom = createPrimitiveGeometry(shapeType, state.monkeyGeometry, bevelWidth, bevelSegments);
  const mat = new THREE.MeshStandardMaterial({
    color: 14707829,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
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
export function deleteSelectedShape(state) {
  if (!state.selectedObject || state.selectedObject === state.baseMesh)
    return;
  const target = state.selectedObject;
  const idx = state.shapeStack.indexOf(target);
  if (idx !== -1) {
    state.shapeStack.splice(idx, 1);
  }
  state.scene.remove(target);
  if (state.shapeStack.length > 0) {
    selectObject(state, state.shapeStack.at(-1));
  } else {
    selectObject(state, state.baseMesh);
  }
}
export function cancelTransform(state) {
  if (!state.selectedObject || !state.transformSnapshot)
    return;
  state.selectedObject.position.copy(state.transformSnapshot.position);
  state.selectedObject.quaternion.copy(state.transformSnapshot.quaternion);
  state.selectedObject.scale.copy(state.transformSnapshot.scale);
  state.ui.shapeScale.value = state.selectedObject.scale.x.toFixed(2);
  state.ui.shapeScaleVal.textContent = state.selectedObject.scale.x.toFixed(2);
  state.selectedObject.updateMatrixWorld(true);
  state.transformGizmo.attach(state.selectedObject);
  state.ui.gizmoHud.style.display = "none";
}
export function toRelativeTransform(toolObj, baseMesh) {
  toolObj.updateMatrixWorld(true);
  if (baseMesh)
    baseMesh.updateMatrixWorld(true);
  const invBase = baseMesh ? baseMesh.matrixWorld.clone().invert() : new THREE.Matrix4();
  const relMatrix = new THREE.Matrix4().multiplyMatrices(invBase, toolObj.matrixWorld);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  relMatrix.decompose(pos, quat, scale);
  const euler = new THREE.Euler().setFromQuaternion(quat, "XYZ");
  const rot = [
    THREE.MathUtils.radToDeg(euler.x),
    THREE.MathUtils.radToDeg(euler.y),
    THREE.MathUtils.radToDeg(euler.z)
  ];
  return { pos, quat, rot, scale };
}
export function confirmTransform(state) {
  if (!state.selectedObject)
    return;
  captureTransformSnapshot(state);
  state.ui.gizmoHud.style.display = "none";
}
export function updateGizmoHud(state) {
  const target = state.transformGizmo.object ?? state.selectedObject;
  if (!target) {
    state.ui.gizmoHud.style.display = "none";
    return;
  }
  state.camera.updateMatrixWorld(true);
  const worldPos = new THREE.Vector3();
  target.getWorldPosition(worldPos);
  const cameraLocalPos = worldPos.clone().applyMatrix4(state.camera.matrixWorldInverse);
  if (cameraLocalPos.z >= 0) {
    state.ui.gizmoHud.style.display = "none";
    return;
  }
  const screenPos = worldPos.clone().project(state.camera);
  const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
  state.ui.gizmoHud.style.display = "flex";
  state.ui.gizmoHud.style.left = `${Math.round(screenX + 45)}px`;
  state.ui.gizmoHud.style.top = `${Math.round(screenY - 45)}px`;
}
export function setupWebSocket(state) {
  state.socket.onopen = () => {
    console.log("Connected to Smoothie engine WebSocket.");
    sendParameters(state);
  };
  state.socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      state.loader.parse(event.data, "", (gltf) => {
        const prevPos = state.baseMesh ? state.baseMesh.position.clone() : new THREE.Vector3();
        const prevQuat = state.baseMesh ? state.baseMesh.quaternion.clone() : new THREE.Quaternion();
        const prevScale = state.baseMesh ? state.baseMesh.scale.clone() : new THREE.Vector3(1, 1, 1);
        const wasBaseSelected = state.selectedObject === state.baseMesh;
        if (state.baseMesh) {
          state.scene.remove(state.baseMesh);
        }
        state.baseMesh = gltf.scene;
        state.baseMesh.position.copy(prevPos);
        state.baseMesh.quaternion.copy(prevQuat);
        state.baseMesh.scale.copy(prevScale);
        state.baseMesh.updateMatrixWorld(true);
        state.baseMesh.userData.shapeType = state.currentBaseShape;
        state.baseMesh.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.shapeType = state.currentBaseShape;
          }
        });
        state.scene.add(state.baseMesh);
        if (wasBaseSelected) {
          state.selectedObject = state.baseMesh;
          state.transformGizmo.attach(state.baseMesh);
          captureTransformSnapshot(state);
        }
        updateUiControlsAvailability(state);
      }, (err) => console.error("Failed to parse GLB:", err));
    }
  };
}
export function setupEventListeners(state) {
  state.transformGizmo.addEventListener("dragging-changed", (event) => {
    state.orbit.enabled = !event.value;
    state.isGizmoInteracting = event.value;
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
  state.ui.btnTranslate.addEventListener("click", () => {
    state.transformGizmo.setMode("translate");
  });
  state.ui.btnRotate.addEventListener("click", () => {
    state.transformGizmo.setMode("rotate");
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
  state.ui.shapeScale.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.ui.shapeScaleVal.textContent = val.toFixed(2);
    if (state.selectedObject) {
      state.selectedObject.scale.set(val, val, val);
      state.selectedObject.updateMatrixWorld(true);
      if (state.selectedObject === state.baseMesh) {
        sendParameters(state);
      }
    }
  });
  state.ui.shapeSelect.addEventListener("change", () => {
    const newType = state.ui.shapeSelect.value;
    if (state.selectedObject && state.selectedObject !== state.baseMesh) {
      const target = state.selectedObject;
      const bevelWidth = target.userData.bevelWidth ?? parseFloat(state.ui.bevelWidth.value);
      const bevelSegments = target.userData.bevelSegments ?? parseInt(state.ui.bevelSegments.value, 10);
      target.geometry.dispose();
      target.geometry = createPrimitiveGeometry(newType, state.monkeyGeometry, bevelWidth, bevelSegments);
      target.userData.shapeType = newType;
      state.ui.labelActiveTarget.textContent = `Tool (${newType.charAt(0).toUpperCase() + newType.slice(1)})`;
    } else {
      state.currentBaseShape = newType;
      sendParameters(state);
    }
    updateUiControlsAvailability(state);
  });
  state.ui.bevelWidth.addEventListener("input", (e) => {
    const target = e.target;
    state.ui.bevelWidthVal.textContent = target.value;
    updateSelectedGeometry(state);
  });
  state.ui.bevelWidth.addEventListener("change", () => {
    if (!state.selectedObject || state.selectedObject === state.baseMesh) {
      sendParameters(state);
    }
  });
  state.ui.bevelSegments.addEventListener("input", (e) => {
    const target = e.target;
    state.ui.bevelSegmentsVal.textContent = target.value;
    updateSelectedGeometry(state);
  });
  state.ui.bevelSegments.addEventListener("change", () => {
    if (!state.selectedObject || state.selectedObject === state.baseMesh) {
      sendParameters(state);
    }
  });
  self.addEventListener("pointerdown", (e) => {
    state.pointerStartX = e.clientX;
    state.pointerStartY = e.clientY;
  });
  self.addEventListener("pointerup", (e) => {
    if (e.target !== state.ui.canvas)
      return;
    if (state.isGizmoInteracting || state.transformGizmo.axis !== null)
      return;
    const deltaX = Math.abs(e.clientX - state.pointerStartX);
    const deltaY = Math.abs(e.clientY - state.pointerStartY);
    if (deltaX > 5 || deltaY > 5)
      return;
    const rect = state.ui.canvas.getBoundingClientRect();
    state.mouse.x = (e.clientX - rect.left) / rect.width * 2 - 1;
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
  self.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "W") {
      state.transformGizmo.setMode("translate");
    }
    if (e.key === "e" || e.key === "E")
      state.transformGizmo.setMode("rotate");
    if (e.key === "Escape")
      cancelTransform(state);
    if (e.key === "Enter") {
      e.preventDefault();
      confirmTransform(state);
    }
  });
  self.addEventListener("resize", () => {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
export function startRenderLoop(state) {
  function renderFrame() {
    requestAnimationFrame(renderFrame);
    state.orbit.update();
    updateGizmoHud(state);
    state.renderer.render(state.scene, state.camera);
  }
  renderFrame();
}
export function commitBoolean(state, operation) {
  if (state.shapeStack.length === 0) {
    console.warn("No tool shape in stack to commit.");
    return;
  }
  const toolObj = state.selectedObject && state.selectedObject !== state.baseMesh ? state.selectedObject : state.shapeStack.at(-1);
  const { pos, rot, scale } = toRelativeTransform(toolObj, state.baseMesh);
  const bevelWidth = toolObj.userData.bevelWidth ?? parseFloat(state.ui.bevelWidth.value);
  const bevelSegments = toolObj.userData.bevelSegments ?? parseInt(state.ui.bevelSegments.value, 10);
  const payload = {
    action: "boolean",
    operation,
    tool_type: toolObj.userData.shapeType || "cube",
    position: [pos.x, pos.y, pos.z],
    rotation: rot,
    scale: [scale.x, scale.y, scale.z],
    bevel_width: bevelWidth,
    bevel_segments: bevelSegments
  };
  state.socket.send(JSON.stringify(payload));
  state.transformGizmo.detach();
  state.scene.remove(toolObj);
  const idx = state.shapeStack.indexOf(toolObj);
  if (idx !== -1) {
    state.shapeStack.splice(idx, 1);
  }
  state.selectedObject = null;
  state.ui.gizmoHud.style.display = "none";
}
export function updateUiControlsAvailability(state) {
  const dropdownIsMonkey = state.ui.shapeSelect.value === "monkey";
  const baseIsMonkey = state.currentBaseShape === "monkey";
  let selectedIsMonkey = false;
  if (state.selectedObject) {
    selectedIsMonkey = state.selectedObject.userData.shapeType === "monkey" || state.baseMesh != null && (state.selectedObject === state.baseMesh || state.baseMesh.getObjectById(state.selectedObject.id) != null) && baseIsMonkey;
  }
  const isMonkeyActive = dropdownIsMonkey || baseIsMonkey || selectedIsMonkey;
  const disableBooleans = isMonkeyActive || state.shapeStack.length === 0;
  state.ui.bevelWidth.disabled = isMonkeyActive;
  state.ui.bevelSegments.disabled = isMonkeyActive;
  const bevelOpacity = isMonkeyActive ? "0.35" : "1.0";
  const bevelCursor = isMonkeyActive ? "not-allowed" : "auto";
  state.ui.bevelWidth.style.opacity = bevelOpacity;
  state.ui.bevelWidth.style.cursor = bevelCursor;
  state.ui.bevelSegments.style.opacity = bevelOpacity;
  state.ui.bevelSegments.style.cursor = bevelCursor;
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
}
