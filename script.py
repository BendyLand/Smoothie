import os
import io
import json
import uvicorn
import bpy
import bmesh

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI()

OUTPUT_DIR = os.path.abspath("./output_test")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def generate_geometry(shape: str = "cube", bevel_width: float = 0.2, bevel_segments: int = 4) -> bytes:
    """
    Clears the Blender state, builds geometry with bmesh,
    evaluates modifiers, and exports raw GLB bytes directly to memory.
    """
    # 1. Reset factory scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2. Build geometry via bmesh
    mesh_data = bpy.data.meshes.new("TargetMesh")
    bm = bmesh.new()

    if shape == "cube":
        bmesh.ops.create_cube(bm, size=2.0)
    elif shape == "cylinder":
        bmesh.ops.create_cylinder(bm, cap_ends=True, radius=1.0, depth=2.0)
    elif shape == "cone":
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32, radius1=1.0, radius2=0.0, depth=2.0)
    elif shape == "monkey":
        bmesh.ops.create_monkey(bm)
    else:
        bmesh.ops.create_cube(bm, size=2.0)

    bm.to_mesh(mesh_data)
    bm.free()

    obj = bpy.data.objects.new("TargetObject", mesh_data)
    bpy.context.collection.objects.link(obj)

    # 3. Apply Bevel Modifier if width > 0
    if bevel_width > 0:
        bevel_mod = obj.modifiers.new(name="Bevel", type='BEVEL')
        bevel_mod.width = bevel_width
        bevel_mod.segments = int(bevel_segments)

    # 4. Save persistent project files to disk for download endpoints
    blend_path = os.path.join(OUTPUT_DIR, "scene.blend")
    glb_path = os.path.join(OUTPUT_DIR, "model.glb")
    
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )

    # 5. Read binary GLB bytes to send over the network
    with open(glb_path, "rb") as f:
        glb_bytes = f.read()

    return glb_bytes


# --- REST Download Endpoints ---

@app.get("/export/blend")
async def download_blend():
    blend_path = os.path.join(OUTPUT_DIR, "scene.blend")
    if os.path.exists(blend_path):
        return FileResponse(blend_path, media_type="application/x-blender", filename="smoothie_scene.blend")
    return Response(status_code=404, content="No scene generated yet.")


@app.get("/export/glb")
async def download_glb():
    glb_path = os.path.join(OUTPUT_DIR, "model.glb")
    if os.path.exists(glb_path):
        return FileResponse(glb_path, media_type="model/gltf-binary", filename="smoothie_model.glb")
    return Response(status_code=404, content="No model generated yet.")


# --- WebSocket Stream ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Send initial geometry state on first connection
    initial_bytes = generate_geometry(shape="cube", bevel_width=0.2, bevel_segments=4)
    await websocket.send_bytes(initial_bytes)

    try:
        while True:
            # Client sends JSON commands: {"shape": "cube", "bevel_width": 0.3, "bevel_segments": 6}
            data_text = await websocket.receive_text()
            payload = json.loads(data_text)

            shape = payload.get("shape", "cube")
            bevel_width = float(payload.get("bevel_width", 0.0))
            bevel_segments = int(payload.get("bevel_segments", 1))

            glb_bytes = generate_geometry(
                shape=shape,
                bevel_width=bevel_width,
                bevel_segments=bevel_segments
            )
            
            # Send raw GLB binary stream directly to Three.js in browser
            await websocket.send_bytes(glb_bytes)

    except WebSocketDisconnect:
        pass


# --- Static Frontend Mount ---
# Must remain at the bottom so it doesn't swallow API/WebSocket routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    # Host must be 0.0.0.0 so the Docker container accepts connections from the host machine
    uvicorn.run(app, host="0.0.0.0", port=8000)
