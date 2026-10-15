package main

import "core:c"

when ODIN_OS == .Linux {
	foreign import libmanifold {"../lib/libmanifoldc.a", "../lib/libmanifold.a", "system:stdc++", "system:m"}
}

ManifoldHandle :: distinct rawptr
MeshGLHandle :: distinct rawptr

MeshGL_Data :: struct {
	handle:     MeshGLHandle,
	num_verts:  int,
	num_tris:   int,
	num_props:  int,
	properties: []f32,
	indices:    []u32,
}

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
	manifold_rotate :: proc(mem: ManifoldHandle, m: ManifoldHandle, x, y, z: f64) -> ManifoldHandle ---
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

sphere :: proc(radius: f32, segments: int = 32) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_sphere(mem, f64(radius), c.int(segments))
}

translate :: proc(m: ManifoldHandle, x, y, z: f64) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_translate(mem, m, x, y, z)
}

rotate :: proc(m: ManifoldHandle, x, y, z: f64) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_rotate(mem, m, x, y, z)
}

boolean_op :: proc(a, b: ManifoldHandle, op: OpType) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_boolean(mem, a, b, op)
}

get_mesh_data :: proc(m: ManifoldHandle) -> MeshGL_Data {
	mem := manifold_alloc_meshgl()
	handle := manifold_get_meshgl(mem, m)

	n_verts := int(manifold_meshgl_num_vert(handle))
	n_tris := int(manifold_meshgl_num_tri(handle))
	n_props := int(manifold_meshgl_num_prop(handle))
	prop_len := int(manifold_meshgl_vert_properties_length(handle))
	tri_len := int(manifold_meshgl_tri_length(handle))

	properties := make([]f32, prop_len)
	indices := make([]u32, tri_len)

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

// Internal cylinder aligned with Manifold's native Z axis
raw_cylinder :: proc(
	height, radius: f32,
	segments: int = 32,
	center: bool = true,
) -> ManifoldHandle {
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

// User-facing cylinder rotated -90 deg on X to be upright in Three.js (Y-up)
cylinder :: proc(height, radius: f32, segments: int = 32, center: bool = true) -> ManifoldHandle {
	raw := raw_cylinder(height, radius, segments, center)
	rotated := rotate(raw, -90, 0, 0)
	destroy(raw)
	return rotated
}

beveled_cube :: proc(
	size: [3]f32,
	bevel_width: f32,
	bevel_segments: int,
	center: bool = true,
) -> ManifoldHandle {
	if bevel_width <= 0.001 {
		return cube(size, center)
	}
	sx := f64(size.x)
	sy := f64(size.y)
	sz := f64(size.z)
	max_b := min(sx, min(sy, sz)) * 0.5 - 0.01
	r := clamp(f64(bevel_width), 0.001, max_b)
	segs := max(4, bevel_segments * 4)

	dx := sx * 0.5 - r
	dy := sy * 0.5 - r
	dz := sz * 0.5 - r

	// Core orthogonal slabs
	slab_x := cube({f32(sx), f32(dy * 2), f32(dz * 2)}, center = true)
	slab_y := cube({f32(dx * 2), f32(sy), f32(dz * 2)}, center = true)
	slab_z := cube({f32(dx * 2), f32(dy * 2), f32(sz)}, center = true)

	res := boolean_op(slab_x, slab_y, .Add)
	destroy(slab_x)
	destroy(slab_y)

	res2 := boolean_op(res, slab_z, .Add)
	destroy(res)
	destroy(slab_z)
	res = res2

	sign_pairs := [?][2]f64{{-1, -1}, {-1, 1}, {1, -1}, {1, 1}}

	// 4 Z-aligned edges (raw_cylinder is already Z-aligned)
	cyl_z_proto := raw_cylinder(f32(dz * 2), f32(r), segments = segs, center = true)
	for pair in sign_pairs {
		c_inst := translate(cyl_z_proto, pair[0] * dx, pair[1] * dy, 0)
		res2 = boolean_op(res, c_inst, .Add)
		destroy(res)
		destroy(c_inst)
		res = res2
	}
	destroy(cyl_z_proto)

	// 4 X-aligned edges (rotate Z -> X by 90 deg on Y)
	cyl_x_raw := raw_cylinder(f32(dx * 2), f32(r), segments = segs, center = true)
	cyl_x_proto := rotate(cyl_x_raw, 0, 90, 0)
	destroy(cyl_x_raw)
	for pair in sign_pairs {
		c_inst := translate(cyl_x_proto, 0, pair[0] * dy, pair[1] * dz)
		res2 = boolean_op(res, c_inst, .Add)
		destroy(res)
		destroy(c_inst)
		res = res2
	}
	destroy(cyl_x_proto)

	// 4 Y-aligned edges (rotate Z -> Y by -90 deg on X)
	cyl_y_raw := raw_cylinder(f32(dy * 2), f32(r), segments = segs, center = true)
	cyl_y_proto := rotate(cyl_y_raw, -90, 0, 0)
	destroy(cyl_y_raw)
	for pair in sign_pairs {
		c_inst := translate(cyl_y_proto, pair[0] * dx, 0, pair[1] * dz)
		res2 = boolean_op(res, c_inst, .Add)
		destroy(res)
		destroy(c_inst)
		res = res2
	}
	destroy(cyl_y_proto)

	// 8 Corner spheres
	sphere_proto := sphere(f32(r), segments = segs)
	sign_triplets := [?][3]f64 {
		{-1, -1, -1},
		{-1, -1, 1},
		{-1, 1, -1},
		{-1, 1, 1},
		{1, -1, -1},
		{1, -1, 1},
		{1, 1, -1},
		{1, 1, 1},
	}
	for trip in sign_triplets {
		s_inst := translate(sphere_proto, trip[0] * dx, trip[1] * dy, trip[2] * dz)
		res2 = boolean_op(res, s_inst, .Add)
		destroy(res)
		destroy(s_inst)
		res = res2
	}
	destroy(sphere_proto)

	if !center {
		offset_res := translate(res, sx * 0.5, sy * 0.5, sz * 0.5)
		destroy(res)
		return offset_res
	}

	return res
}

cone :: proc(height, radius: f32, segments: int = 32, center: bool = true) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	raw_cone := manifold_cylinder(
		mem,
		f64(height),
		f64(radius),
		0.0, // radius_high = 0 yields a cone
		c.int(segments),
		c.int(center ? 1 : 0),
	)

	// Rotate -90 on X so it points up along +Y in Three.js/glTF
	rotated := rotate(raw_cone, -90, 0, 0)
	destroy(raw_cone)
	return rotated
}

import "core:math"

// Raw unrotated truncated cylinder / cone helper
raw_frustum :: proc(
	height, radius_low, radius_high: f32,
	segments: int,
	center: bool = false,
) -> ManifoldHandle {
	mem := manifold_alloc_manifold()
	return manifold_cylinder(
		mem,
		f64(height),
		f64(radius_low),
		f64(radius_high),
		c.int(segments),
		c.int(center ? 1 : 0),
	)
}

beveled_cylinder :: proc(
	height, radius: f32,
	bevel_width: f32,
	bevel_segments: int,
	center: bool = true,
) -> ManifoldHandle {
	h := f64(height)
	r := f64(radius)
	segs := max(16, bevel_segments * 8)

	max_b := min(r - 0.01, h * 0.5 - 0.01)
	b := clamp(f64(bevel_width), 0.0, max_b)

	if b <= 0.001 {
		return cylinder(height, radius, segments = segs, center = center)
	}

	// Central core cylinder (from -h/2 + b to +h/2 - b)
	core_h := h - 2.0 * b
	res := raw_cylinder(f32(core_h), f32(r), segments = segs, center = true)

	// Middle inner cylinder to fill the caps under the bevel arcs (radius r - b, full height h)
	inner_cyl := raw_cylinder(f32(h), f32(r - b), segments = segs, center = true)
	res2 := boolean_op(res, inner_cyl, .Add)
	destroy(res)
	destroy(inner_cyl)
	res = res2

	// Stacks of frustums for the top and bottom bevel rings
	n_steps := max(1, bevel_segments)
	for i in 0 ..< n_steps {
		t0 := (f64(i) / f64(n_steps)) * (math.PI * 0.5)
		t1 := (f64(i + 1) / f64(n_steps)) * (math.PI * 0.5)

		// Arc moving from horizontal rim to vertical edge
		// t = 0: top flat face; t = pi/2: outer cylindrical wall
		r0 := (r - b) + b * math.sin(t0)
		r1 := (r - b) + b * math.sin(t1)

		z0 := (h * 0.5 - b) + b * math.cos(t0)
		z1 := (h * 0.5 - b) + b * math.cos(t1)

		slice_h := z0 - z1
		if slice_h <= 1e-5 do continue

		// Top frustum slice
		top_slice := raw_frustum(f32(slice_h), f32(r1), f32(r0), segments = segs, center = false)
		top_placed := translate(top_slice, 0, 0, z1)
		destroy(top_slice)

		res2 = boolean_op(res, top_placed, .Add)
		destroy(res)
		destroy(top_placed)
		res = res2

		// Bottom frustum slice (mirrored across Z)
		bot_slice := raw_frustum(f32(slice_h), f32(r0), f32(r1), segments = segs, center = false)
		bot_placed := translate(bot_slice, 0, 0, -z0)
		destroy(bot_slice)

		res2 = boolean_op(res, bot_placed, .Add)
		destroy(res)
		destroy(bot_placed)
		res = res2
	}

	if !center {
		offset := translate(res, 0, 0, h * 0.5)
		destroy(res)
		res = offset
	}

	// Orient upright in Three.js (Y-up)
	rotated := rotate(res, -90, 0, 0)
	destroy(res)
	return rotated
}

beveled_cone :: proc(height, radius: f32, bevel_width: f32, bevel_segments: int, center: bool = true) -> ManifoldHandle {
    h := f64(height)
    r := f64(radius)
    segs := max(16, bevel_segments * 8)

    max_b := min(r - 0.01, h * 0.5 - 0.01)
    b := clamp(f64(bevel_width), 0.0, max_b)

    if b <= 0.001 {
        return cone(height, radius, segments = segs, center = center)
    }

    z_bottom := -h * 0.5
    n_steps := max(1, bevel_segments)

    // Cone body starting seamlessly at radius r from z_bottom + b up to the apex (radius 0)
    body := raw_frustum(f32(h - b), f32(r), 0.0, segments = segs, center = false)
    res := translate(body, 0, 0, z_bottom + b)
    destroy(body)

    // Inner base cylinder to seal the bottom interior disk (radius r - b)
    inner_base := raw_cylinder(f32(b), f32(r - b), segments = segs, center = false)
    base_placed := translate(inner_base, 0, 0, z_bottom)
    destroy(inner_base)

    res2 := boolean_op(res, base_placed, .Add)
    destroy(res)
    destroy(base_placed)
    res = res2

    // Rounding slices for the bottom rim
    for i in 0 ..< n_steps {
        t0 := (f64(i) / f64(n_steps)) * (math.PI * 0.5)
        t1 := (f64(i + 1) / f64(n_steps)) * (math.PI * 0.5)

        r0 := (r - b) + b * math.sin(t0)
        r1 := (r - b) + b * math.sin(t1)

        z0 := (z_bottom + b) - b * math.cos(t0)
        z1 := (z_bottom + b) - b * math.cos(t1)

        slice_h := z1 - z0
        if slice_h <= 1e-5 do continue

        slice := raw_frustum(f32(slice_h), f32(r0), f32(r1), segments = segs, center = false)
        slice_placed := translate(slice, 0, 0, z0)
        destroy(slice)

        res2 = boolean_op(res, slice_placed, .Add)
        destroy(res)
        destroy(slice_placed)
        res = res2
    }

    if !center {
        offset := translate(res, 0, 0, h * 0.5)
        destroy(res)
        res = offset
    }

    // Orient upright in Three.js (Y-up)
    rotated := rotate(res, -90, 0, 0)
    destroy(res)
    return rotated
}


