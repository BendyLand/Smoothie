import os
import sys
import bpy
import bmesh

def run_test():
    print(f"Blender version: {bpy.app.version_string}")

    # 1. Clear out default startup scene objects
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2. Procedurally generate a base cube using BMesh
    mesh_data = bpy.data.meshes.new("TargetMesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bm.to_mesh(mesh_data)
    bm.free()

    obj = bpy.data.objects.new("TargetObject", mesh_data)
    bpy.context.collection.objects.link(obj)

    # Make the object active and selected
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # 3. Apply a modifier (Bevel)
    bevel_mod = obj.modifiers.new(name="TestBevel", type='BEVEL')
    bevel_mod.width = 0.2
    bevel_mod.segments = 4

    # Force a dependency graph update so modifiers evaluate
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_obj = obj.evaluated_get(depsgraph)
    poly_count = len(evaluated_obj.data.polygons)
    vert_count = len(evaluated_obj.data.vertices)
    print(f"Evaluated mesh: {vert_count} vertices, {poly_count} polygons")

    # 4. Output directory setup
    output_dir = os.path.abspath("./output_test")
    os.makedirs(output_dir, exist_ok=True)

    blend_path = os.path.join(output_dir, "scene.blend")
    glb_path = os.path.join(output_dir, "model.glb")

    # 5. Export native .blend file
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    blend_size = os.path.getsize(blend_path)
    print(f"Saved .blend: {blend_path} ({blend_size} bytes)")

    # 6. Export web-ready .glb file
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    glb_size = os.path.getsize(glb_path)
    print(f"Exported .glb: {glb_path} ({glb_size} bytes)")

    # 7. Verification check
    if blend_size > 0 and glb_size > 0:
        print("\nSUCCESS: Environment and headless export pipeline verified.")
        return 0
    else:
        print("\nERROR: Output files were generated with 0 bytes.")
        return 1

if __name__ == "__main__":
    sys.exit(run_test())
