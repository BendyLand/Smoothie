package main

import "core:c"

when ODIN_OS == .Linux {
	foreign import libmanifold {"../lib/libmanifoldc.a", "../lib/libmanifold.a", "system:stdc++", "system:m"}
}

ManifoldHandle :: distinct rawptr
MeshGLHandle :: distinct rawptr

OpType :: enum c.int {
	Add       = 0,
	Subtract  = 1,
	Intersect = 2,
}

foreign libmanifold {
	manifold_alloc_manifold :: proc() -> ManifoldHandle ---
	manifold_delete_manifold :: proc(m: ManifoldHandle) ---
	manifold_alloc_meshgl :: proc() -> MeshGLHandle ---
	manifold_delete_meshgl :: proc(m: MeshGLHandle) ---

	// Primitives
	manifold_cube :: proc(mem: ManifoldHandle, x, y, z: f64, center: c.int) -> ManifoldHandle ---
	manifold_cylinder :: proc(mem: ManifoldHandle, height, radius_low, radius_high: f64, circular_segments: c.int, center: c.int) -> ManifoldHandle ---
	manifold_sphere :: proc(mem: ManifoldHandle, radius: f64, circular_segments: c.int) -> ManifoldHandle ---

	// Transforms
	manifold_translate :: proc(mem: ManifoldHandle, m: ManifoldHandle, x, y, z: f64) -> ManifoldHandle ---
	manifold_scale :: proc(mem: ManifoldHandle, m: ManifoldHandle, x, y, z: f64) -> ManifoldHandle ---

	// CSG
	manifold_boolean :: proc(mem: ManifoldHandle, a, b: ManifoldHandle, op: OpType) -> ManifoldHandle ---

	// Mesh Extraction
	manifold_get_meshgl :: proc(mem: MeshGLHandle, m: ManifoldHandle) -> MeshGLHandle ---
	manifold_meshgl_num_vert :: proc(m: MeshGLHandle) -> c.size_t ---
	manifold_meshgl_num_tri :: proc(m: MeshGLHandle) -> c.size_t ---
	manifold_meshgl_num_prop :: proc(m: MeshGLHandle) -> c.size_t ---
	manifold_meshgl_vert_properties_length :: proc(m: MeshGLHandle) -> c.size_t ---
	manifold_meshgl_tri_length :: proc(m: MeshGLHandle) -> c.size_t ---
	manifold_meshgl_vert_properties :: proc(mem: rawptr, m: MeshGLHandle) -> [^]f32 ---
	manifold_meshgl_tri_verts :: proc(mem: rawptr, m: MeshGLHandle) -> [^]u32 ---
}

cube :: proc(size: [3]f32, center: bool = true) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_cube(mem, f64(size.x), f64(size.y), f64(size.z), c.int(center ? 1 : 0))
}

cylinder :: proc(height, radius: f32, segments: int = 32, center: bool = true) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_cylinder(
		mem,
		f64(height),
		f64(radius),
		f64(radius),
		c.int(segments),
		c.int(center ? 1 : 0),
	)
}

boolean_op :: proc(a, b: ManifoldHandle, op: OpType) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_boolean(mem, a, b, op)
}

MeshGL_Data :: struct {
	handle:     MeshGLHandle,
	num_verts:  int,
	num_tris:   int,
	num_props:  int,
	properties: []f32,
	indices:    []u32,
}

get_mesh_data :: proc(m: ManifoldHandle) -> MeshGL_Data {
	mem := manifold_alloc_meshgl()
	handle := manifold_get_meshgl(mem, m)

	n_verts := int(manifold_meshgl_num_vert(handle))
	n_tris := int(manifold_meshgl_num_tri(handle))
	n_props := int(manifold_meshgl_num_prop(handle))
	prop_len := int(manifold_meshgl_vert_properties_length(handle))
	tri_len := int(manifold_meshgl_tri_length(handle))

	// Allocate slices managed by Odin
	properties := make([]f32, prop_len)
	indices := make([]u32, tri_len)

	// Pass the destination memory pointers into the C functions
	manifold_meshgl_vert_properties(raw_data(properties), handle)
	manifold_meshgl_tri_verts(raw_data(indices), handle)

	return MeshGL_Data {
		handle = handle,
		num_verts = n_verts,
		num_tris = n_tris,
		num_props = n_props,
		properties = properties,
		indices = indices,
	}
}

destroy :: proc(m: ManifoldHandle) {
	if m != nil {
		manifold_delete_manifold(m)
	}
}

destroy_mesh_data :: proc(data: ^MeshGL_Data) {
	if data.handle != nil {
		manifold_delete_meshgl(data.handle)
		data.handle = nil
	}
	delete(data.properties)
	delete(data.indices)
}
