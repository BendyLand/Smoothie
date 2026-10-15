package main

import "core:encoding/endian"
import "core:math/linalg"

pack_mesh_to_stl :: proc(mesh: MeshGL_Data) -> []u8 {
	num_tris := len(mesh.indices) / 3
	total_size := 84 + num_tris * 50
	out := make([]u8, total_size)

	// 80-byte header: fill with ASCII comment
	header_str := "Exported by Smoothie 3D (Odin + Manifold)"
	copy(out[0:min(len(header_str), 80)], header_str)

	// 4-byte triangle count at offset 80
	endian.unchecked_put_u32le(out[80:84], u32(num_tris))

	cursor := 84

	// Write each triangle
	for t := 0; t < num_tris; t += 1 {
		i0 := int(mesh.indices[t * 3 + 0])
		i1 := int(mesh.indices[t * 3 + 1])
		i2 := int(mesh.indices[t * 3 + 2])

		stride := mesh.num_props

		v0 := [3]f32 {
			mesh.properties[i0 * stride + 0],
			mesh.properties[i0 * stride + 1],
			mesh.properties[i0 * stride + 2],
		}
		v1 := [3]f32 {
			mesh.properties[i1 * stride + 0],
			mesh.properties[i1 * stride + 1],
			mesh.properties[i1 * stride + 2],
		}
		v2 := [3]f32 {
			mesh.properties[i2 * stride + 0],
			mesh.properties[i2 * stride + 1],
			mesh.properties[i2 * stride + 2],
		}

		e1 := v1 - v0
		e2 := v2 - v0
		cross_prod := linalg.cross(e1, e2)
		normal := linalg.normalize(cross_prod)

		// Write normal (12 bytes)
		endian.unchecked_put_u32le(out[cursor:cursor + 4], transmute(u32)normal.x)
		endian.unchecked_put_u32le(out[cursor + 4:cursor + 8], transmute(u32)normal.y)
		endian.unchecked_put_u32le(out[cursor + 8:cursor + 12], transmute(u32)normal.z)
		cursor += 12

		// Write vertex 0 (12 bytes)
		endian.unchecked_put_u32le(out[cursor:cursor + 4], transmute(u32)v0.x)
		endian.unchecked_put_u32le(out[cursor + 4:cursor + 8], transmute(u32)v0.y)
		endian.unchecked_put_u32le(out[cursor + 8:cursor + 12], transmute(u32)v0.z)
		cursor += 12

		// Write vertex 1 (12 bytes)
		endian.unchecked_put_u32le(out[cursor:cursor + 4], transmute(u32)v1.x)
		endian.unchecked_put_u32le(out[cursor + 4:cursor + 8], transmute(u32)v1.y)
		endian.unchecked_put_u32le(out[cursor + 8:cursor + 12], transmute(u32)v1.z)
		cursor += 12

		// Write vertex 2 (12 bytes)
		endian.unchecked_put_u32le(out[cursor:cursor + 4], transmute(u32)v2.x)
		endian.unchecked_put_u32le(out[cursor + 4:cursor + 8], transmute(u32)v2.y)
		endian.unchecked_put_u32le(out[cursor + 8:cursor + 12], transmute(u32)v2.z)
		cursor += 12

		// 2-byte attribute byte count (set to 0)
		endian.unchecked_put_u16le(out[cursor:cursor + 2], 0)
		cursor += 2
	}

	return out
}


