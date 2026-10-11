// src/utils.ts
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { TransformControls } from "three/addons/TransformControls.js";
function createAppState() {
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
    gizmoHud: document.getElementById("gizmo-hud"),
    hudConfirm: document.getElementById("hud-confirm"),
    hudCancel: document.getElementById("hud-cancel")
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
}
function initMonkeyCache(state2) {
  state2.loader.load("/monkey.glb", (gltf) => {
    gltf.scene.traverse((child) => {
      if (child.isMesh && !state2.monkeyGeometry) {
        state2.monkeyGeometry = child.geometry.clone();
      }
    });
  }, void 0, (err) => {
    console.error("Failed to preload /monkey.glb:", err);
  });
}
function createPrimitiveGeometry(type, monkeyGeometry) {
  if (type === "cylinder") {
    return new THREE.CylinderGeometry(0.75, 0.75, 1.5, 32);
  } else if (type === "cone") {
    return new THREE.ConeGeometry(0.75, 1.5, 32);
  } else if (type === "monkey") {
    if (monkeyGeometry) {
      return monkeyGeometry.clone();
    }
    return new THREE.BoxGeometry(1.5, 1.5, 1.5);
  }
  return new THREE.BoxGeometry(1.5, 1.5, 1.5);
}
function applyHighlight(obj, isHighlighted) {
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
function captureTransformSnapshot(state2) {
  if (!state2.selectedObject) {
    state2.transformSnapshot = null;
    return;
  }
  state2.transformSnapshot = {
    position: state2.selectedObject.position.clone(),
    quaternion: state2.selectedObject.quaternion.clone(),
    scale: state2.selectedObject.scale.clone()
  };
}
function selectObject(state2, obj) {
  if (state2.selectedObject === obj)
    return;
  applyHighlight(state2.selectedObject, false);
  state2.selectedObject = obj;
  if (state2.selectedObject) {
    state2.transformGizmo.attach(state2.selectedObject);
    applyHighlight(state2.selectedObject, true);
    captureTransformSnapshot(state2);
    if (state2.selectedObject === state2.baseMesh) {
      state2.ui.labelActiveTarget.textContent = "Base Object";
      state2.ui.labelActiveTarget.style.color = "#61afef";
      if (state2.baseMesh && state2.baseMesh.userData.shapeType) {
        state2.ui.shapeSelect.value = state2.baseMesh.userData.shapeType;
      }
    } else {
      const type = state2.selectedObject.userData.shapeType || "cube";
      state2.ui.labelActiveTarget.textContent = `Tool (${type.charAt(0).toUpperCase() + type.slice(1)})`;
      state2.ui.labelActiveTarget.style.color = "#e06c75";
      state2.ui.shapeSelect.value = type;
    }
  } else {
    state2.transformGizmo.detach();
    state2.transformSnapshot = null;
    state2.ui.gizmoHud.style.display = "none";
    state2.ui.labelActiveTarget.textContent = "None";
    state2.ui.labelActiveTarget.style.color = "#888888";
  }
}
function getSelectableRoot(obj, sceneRoot) {
  let curr = obj;
  while (curr && curr.parent && curr.parent !== sceneRoot) {
    curr = curr.parent;
  }
  return curr;
}
function sendParameters(state2) {
  if (state2.socket.readyState !== WebSocket.OPEN)
    return;
  const payload = {
    shape: state2.ui.shapeSelect.value,
    bevel_width: parseFloat(state2.ui.bevelWidth.value),
    bevel_segments: parseInt(state2.ui.bevelSegments.value, 10)
  };
  state2.socket.send(JSON.stringify(payload));
}
function addSecondaryShape(state2) {
  const shapeType = state2.ui.shapeSelect.value;
  const geom = createPrimitiveGeometry(shapeType, state2.monkeyGeometry);
  const mat = new THREE.MeshStandardMaterial({
    color: 14707829,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.shapeType = shapeType;
  mesh.position.set(0, 0.5, 0);
  state2.scene.add(mesh);
  state2.shapeStack.push(mesh);
  selectObject(state2, mesh);
}
function deleteSelectedShape(state2) {
  if (!state2.selectedObject || state2.selectedObject === state2.baseMesh)
    return;
  const target = state2.selectedObject;
  const idx = state2.shapeStack.indexOf(target);
  if (idx !== -1) {
    state2.shapeStack.splice(idx, 1);
  }
  state2.scene.remove(target);
  if (state2.shapeStack.length > 0) {
    selectObject(state2, state2.shapeStack.at(-1));
  } else {
    selectObject(state2, state2.baseMesh);
  }
}
function cancelTransform(state2) {
  if (!state2.selectedObject || !state2.transformSnapshot)
    return;
  state2.selectedObject.position.copy(state2.transformSnapshot.position);
  state2.selectedObject.quaternion.copy(state2.transformSnapshot.quaternion);
  state2.selectedObject.scale.copy(state2.transformSnapshot.scale);
  state2.selectedObject.updateMatrixWorld(true);
  state2.transformGizmo.attach(state2.selectedObject);
}
function toBlenderTransform(obj, baseMesh) {
  obj.updateMatrixWorld(true);
  const C = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const CInv = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  let mRel;
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
function confirmTransform(state2) {
  if (!state2.selectedObject)
    return;
  captureTransformSnapshot(state2);
  const isBase = state2.selectedObject === state2.baseMesh;
  const { pos, quat, scale } = toBlenderTransform(state2.selectedObject, state2.baseMesh);
  const payload = {
    action: "lock_transform",
    target: isBase ? "base" : "tool",
    position: [pos.x, pos.y, pos.z],
    quaternion: [quat.w, quat.x, quat.y, quat.z],
    scale: [scale.x, scale.y, scale.z]
  };
  state2.socket.send(JSON.stringify(payload));
}
function commitBoolean(state2, operation) {
  if (state2.shapeStack.length === 0) {
    console.warn("No tool shape in stack to commit.");
    return;
  }
  const toolObj = state2.selectedObject && state2.selectedObject !== state2.baseMesh ? state2.selectedObject : state2.shapeStack.at(-1);
  const { pos, quat, scale } = toBlenderTransform(toolObj, state2.baseMesh);
  const payload = {
    action: "boolean",
    operation,
    tool_type: toolObj.userData.shapeType || "cube",
    position: [pos.x, pos.y, pos.z],
    quaternion: [quat.w, quat.x, quat.y, quat.z],
    scale: [scale.x, scale.y, scale.z]
  };
  state2.socket.send(JSON.stringify(payload));
  state2.transformGizmo.detach();
  state2.scene.remove(toolObj);
  const idx = state2.shapeStack.indexOf(toolObj);
  if (idx !== -1) {
    state2.shapeStack.splice(idx, 1);
  }
  state2.selectedObject = null;
  state2.ui.gizmoHud.style.display = "none";
}
function updateGizmoHud(state2) {
  const target = state2.transformGizmo.object ?? state2.selectedObject;
  console.log("1");
  if (!target) {
    state2.ui.gizmoHud.style.display = "none";
    return;
  }
  console.log("2");
  state2.camera.updateMatrixWorld(true);
  const worldPos = new THREE.Vector3();
  target.getWorldPosition(worldPos);
  const cameraLocalPos = worldPos.clone().applyMatrix4(state2.camera.matrixWorldInverse);
  if (cameraLocalPos.z >= 0) {
    state2.ui.gizmoHud.style.display = "none";
    return;
  }
  console.log("3");
  const screenPos = worldPos.clone().project(state2.camera);
  const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
  state2.ui.gizmoHud.style.display = "flex";
  state2.ui.gizmoHud.style.left = `${Math.round(screenX + 45)}px`;
  state2.ui.gizmoHud.style.top = `${Math.round(screenY - 45)}px`;
  console.log("4");
}
function setupWebSocket(state2) {
  state2.socket.onopen = () => {
    console.log("Connected to Smoothie engine WebSocket.");
  };
  state2.socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      state2.loader.parse(event.data, "", (gltf) => {
        const wasBaseSelected = state2.selectedObject === state2.baseMesh || state2.selectedObject === null;
        let prevPos = new THREE.Vector3();
        let prevRot = new THREE.Euler();
        let prevScale = new THREE.Vector3(1, 1, 1);
        if (state2.baseMesh) {
          prevPos.copy(state2.baseMesh.position);
          prevRot.copy(state2.baseMesh.rotation);
          prevScale.copy(state2.baseMesh.scale);
          state2.scene.remove(state2.baseMesh);
        }
        state2.baseMesh = gltf.scene;
        state2.baseMesh.userData.shapeType = state2.currentBaseShape;
        state2.baseMesh.position.copy(prevPos);
        state2.baseMesh.rotation.copy(prevRot);
        state2.baseMesh.scale.copy(prevScale);
        state2.baseMesh.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 13421772,
              roughness: 0.35,
              metalness: 0.1
            });
          }
        });
        state2.scene.add(state2.baseMesh);
        if (wasBaseSelected || state2.shapeStack.length === 0) {
          selectObject(state2, state2.baseMesh);
        } else {
          selectObject(state2, state2.shapeStack.at(-1));
        }
      }, (err) => {
        console.error("GLTF parsing error:", err);
      });
    }
  };
}
function setupEventListeners(state2) {
  state2.transformGizmo.addEventListener("dragging-changed", (event) => {
    state2.orbit.enabled = !event.value;
    state2.isGizmoInteracting = event.value;
  });
  state2.ui.hudConfirm.addEventListener("click", () => {
    confirmTransform(state2);
  });
  state2.ui.hudCancel.addEventListener("click", () => {
    cancelTransform(state2);
  });
  state2.ui.addShapeBtn.addEventListener("click", () => {
    addSecondaryShape(state2);
  });
  state2.ui.btnTranslate.addEventListener("click", () => {
    state2.transformGizmo.setMode("translate");
  });
  state2.ui.btnRotate.addEventListener("click", () => {
    state2.transformGizmo.setMode("rotate");
  });
  state2.ui.btnDelete.addEventListener("click", () => {
    deleteSelectedShape(state2);
  });
  state2.ui.btnUnion.addEventListener("click", () => {
    commitBoolean(state2, "UNION");
  });
  state2.ui.btnDiff.addEventListener("click", () => {
    commitBoolean(state2, "DIFFERENCE");
  });
  state2.ui.shapeSelect.addEventListener("change", () => {
    const newType = state2.ui.shapeSelect.value;
    if (state2.selectedObject && state2.selectedObject !== state2.baseMesh) {
      const target = state2.selectedObject;
      target.geometry.dispose();
      target.geometry = createPrimitiveGeometry(newType, state2.monkeyGeometry);
      target.userData.shapeType = newType;
      state2.ui.labelActiveTarget.textContent = `Tool (${newType.charAt(0).toUpperCase() + newType.slice(1)})`;
    } else {
      state2.currentBaseShape = newType;
      sendParameters(state2);
    }
  });
  state2.ui.bevelWidth.addEventListener("input", (e) => {
    const target = e.target;
    state2.ui.bevelWidthVal.textContent = target.value;
    if (!state2.selectedObject || state2.selectedObject === state2.baseMesh) {
      sendParameters(state2);
    }
  });
  state2.ui.bevelSegments.addEventListener("input", (e) => {
    const target = e.target;
    state2.ui.bevelSegmentsVal.textContent = target.value;
    if (!state2.selectedObject || state2.selectedObject === state2.baseMesh) {
      sendParameters(state2);
    }
  });
  window.addEventListener("pointerdown", (e) => {
    state2.pointerStartX = e.clientX;
    state2.pointerStartY = e.clientY;
  });
  window.addEventListener("pointerup", (e) => {
    if (e.target !== state2.ui.canvas)
      return;
    if (state2.isGizmoInteracting || state2.transformGizmo.axis !== null)
      return;
    const deltaX = Math.abs(e.clientX - state2.pointerStartX);
    const deltaY = Math.abs(e.clientY - state2.pointerStartY);
    if (deltaX > 5 || deltaY > 5)
      return;
    const rect = state2.ui.canvas.getBoundingClientRect();
    state2.mouse.x = (e.clientX - rect.left) / rect.width * 2 - 1;
    state2.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    state2.raycaster.setFromCamera(state2.mouse, state2.camera);
    const toolHits = state2.raycaster.intersectObjects(state2.shapeStack, false);
    if (toolHits.length > 0) {
      selectObject(state2, toolHits[0].object);
      return;
    }
    if (state2.baseMesh) {
      const baseHits = state2.raycaster.intersectObjects([state2.baseMesh], true);
      if (baseHits.length > 0) {
        const root = getSelectableRoot(baseHits[0].object, state2.scene);
        selectObject(state2, root ?? state2.baseMesh);
        return;
      }
    }
    selectObject(state2, null);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "W")
      state2.transformGizmo.setMode("translate");
    if (e.key === "e" || e.key === "E")
      state2.transformGizmo.setMode("rotate");
    if (e.key === "Escape")
      cancelTransform(state2);
    if (e.key === "Enter") {
      e.preventDefault();
      confirmTransform(state2);
    }
  });
  window.addEventListener("resize", () => {
    state2.camera.aspect = window.innerWidth / window.innerHeight;
    state2.camera.updateProjectionMatrix();
    state2.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
function startRenderLoop(state2) {
  function renderFrame() {
    requestAnimationFrame(renderFrame);
    state2.orbit.update();
    updateGizmoHud(state2);
    state2.renderer.render(state2.scene, state2.camera);
  }
  renderFrame();
}

// src/app.ts
var state = createAppState();
initMonkeyCache(state);
setupWebSocket(state);
setupEventListeners(state);
startRenderLoop(state);
