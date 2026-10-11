import os
import json
import uvicorn
import bpy
import bmesh

from fastapi import FastAPI, WebSocket 
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

app = FastAPI()
app.mount("/static", StaticFiles(directory="src"), name="static")

OUTPUT_DIR = "/tmp/smoothie"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_geometry(shape: str = "cube", bevel_width: float = 0.2, bevel_segments: int = 4) -> bytes:
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mesh_data = bpy.data.meshes.new("TargetMesh")
    bm = bmesh.new()

    if shape == "cube":
        bmesh.ops.create_cube(bm, size=2.0)
    elif shape == "cylinder":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=32,
            radius1=1.0,
            radius2=1.0,
            depth=2.0,
        )
    elif shape == "cone":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=32,
            radius1=1.0,
            radius2=0.0,
            depth=2.0,
        )
    elif shape == "monkey":
        bmesh.ops.create_monkey(bm)
    else:
        bmesh.ops.create_cube(bm, size=2.0)

    bm.normal_update()
    bm.to_mesh(mesh_data)
    bm.free()

    obj = bpy.data.objects.new("TargetObject", mesh_data)
    bpy.context.collection.objects.link(obj)

    if bevel_width > 0:
        bevel_mod = obj.modifiers.new(name="Bevel", type='BEVEL')
        bevel_mod.width = bevel_width
        bevel_mod.segments = int(bevel_segments)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier="Bevel")

    glb_path = os.path.join(OUTPUT_DIR, "model.glb")
    blend_path = os.path.join(OUTPUT_DIR, "scene.blend")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )

    with open(glb_path, "rb") as f:
        return f.read()


def apply_boolean_operation(payload: dict) -> bytes:
    base_obj = bpy.data.objects.get("TargetObject")
    if not base_obj:
        raise ValueError("Base object not found in scene.")

    operation = payload.get("operation", "UNION")
    tool_type = payload.get("tool_type", "cube")
    pos = payload.get("position", [0.0, 0.0, 0.0])
    quat = payload.get("quaternion", [1.0, 0.0, 0.0, 0.0])
    scale = payload.get("scale", [1.0, 1.0, 1.0])

    bpy.context.view_layer.objects.active = base_obj
    for mod in list(base_obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)

    tool_mesh = bpy.data.meshes.new("ToolMesh")
    bm = bmesh.new()

    if tool_type == "cylinder":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=32,
            radius1=0.75,
            radius2=0.75,
            depth=1.5,
        )
    elif tool_type == "cone":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=32,
            radius1=0.75,
            radius2=0.0,
            depth=1.5,
        )
    elif tool_type == "monkey":
        bmesh.ops.create_monkey(bm)
        bmesh.ops.holes_fill(bm, edges=bm.edges)
    else:
        bmesh.ops.create_cube(bm, size=1.5)

    bm.normal_update()
    bm.to_mesh(tool_mesh)
    bm.free()

    tool_obj = bpy.data.objects.new("ToolObject", tool_mesh)
    bpy.context.collection.objects.link(tool_obj)

    tool_obj.location = (pos[0], pos[1], pos[2])
    tool_obj.rotation_mode = "QUATERNION"
    tool_obj.rotation_quaternion = (quat[0], quat[1], quat[2], quat[3])
    tool_obj.scale = (scale[0], scale[1], scale[2])

    bpy.context.view_layer.update()

    bool_mod = base_obj.modifiers.new(name="BoolOp", type="BOOLEAN")
    bool_mod.operation = operation
    bool_mod.object = tool_obj
    bool_mod.solver = "MANIFOLD"

    bpy.ops.object.select_all(action="DESELECT")
    base_obj.select_set(True)
    bpy.context.view_layer.objects.active = base_obj
    bpy.ops.object.modifier_apply(modifier="BoolOp")

    bpy.data.objects.remove(tool_obj, do_unlink=True)
    bpy.data.meshes.remove(tool_mesh, do_unlink=True)
    bpy.context.view_layer.update()

    glb_path = os.path.join(OUTPUT_DIR, "model.glb")
    blend_path = os.path.join(OUTPUT_DIR, "scene.blend")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=False,
        export_apply=True
    )

    with open(glb_path, "rb") as f:
        return f.read()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    init_bytes = generate_geometry("cube", 0.2, 4)
    await websocket.send_bytes(init_bytes)

    while True:
        data = await websocket.receive_text()
        payload = json.loads(data)

        if payload.get("action") == "boolean":
            glb_bytes = apply_boolean_operation(payload)
            await websocket.send_bytes(glb_bytes)
        elif payload.get("action") == "lock_transform":
            target = payload.get("target")
            if target == "base":
                base_obj = bpy.data.objects.get("TargetObject")
                if base_obj:
                    pos = payload.get("position", [0.0, 0.0, 0.0])
                    quat = payload.get("quaternion", [1.0, 0.0, 0.0, 0.0])
                    scale = payload.get("scale", [1.0, 1.0, 1.0])
                    base_obj.location = (pos[0], pos[1], pos[2])
                    base_obj.rotation_mode = "QUATERNION"
                    base_obj.rotation_quaternion = (quat[0], quat[1], quat[2], quat[3])
                    base_obj.scale = (scale[0], scale[1], scale[2])
                    bpy.context.view_layer.update()
        else:
            glb_bytes = generate_geometry(
                shape=payload.get("shape", "cube"),
                bevel_width=payload.get("bevel_width", 0.2),
                bevel_segments=payload.get("bevel_segments", 4),
            )
            await websocket.send_bytes(glb_bytes)

# --- REST Download Endpoints ---

@app.get("/export/blend")
async def download_blend():
    blend_path = os.path.join(OUTPUT_DIR, "scene.blend")
    if os.path.exists(blend_path):
        return FileResponse(
            blend_path,
            media_type="application/x-blender",
            filename="smoothie_scene.blend",
        )
    return Response(status_code=404, content="No scene generated yet.")


@app.get("/export/glb")
async def download_glb():
    glb_path = os.path.join(OUTPUT_DIR, "model.glb")
    if os.path.exists(glb_path):
        return FileResponse(
            glb_path, media_type="model/gltf-binary", filename="smoothie_model.glb"
        )
    return Response(status_code=404, content="No model generated yet.")


# --- Static Frontend Mount ---
# Must remain at the bottom so it doesn't swallow API/WebSocket routes
app.mount("/", StaticFiles(directory="src", html=True), name="static")


if __name__ == "__main__":
    # Host must be 0.0.0.0 so the Docker container accepts connections from the host machine
    uvicorn.run(app, host="0.0.0.0", port=8000)
