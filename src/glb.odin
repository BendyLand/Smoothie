package main

import "core:encoding/endian"
import "core:fmt"
import "core:mem"

pack_mesh_to_glb :: proc(mesh: MeshGL_Data) -> []u8 {
	pos_bytes := mem.slice_to_bytes(mesh.properties) // [x, y, z] floats
	idx_bytes := mem.slice_to_bytes(mesh.indices)    // [i0, i1, i2] u32s

	pos_len := len(pos_bytes)
	idx_len := len(idx_bytes)

	// Binary chunk padding to 4-byte boundaries
	idx_pad := (4 - (idx_len % 4)) % 4
	pos_pad := (4 - (pos_len % 4)) % 4

	bin_len := idx_len + idx_pad + pos_len + pos_pad
	idx_offset := 0
	pos_offset := idx_len + idx_pad

	// Calculate bounding box for glTF accessor
	min_bound := [3]f32{1e30, 1e30, 1e30}
	max_bound := [3]f32{-1e30, -1e30, -1e30}

	for i := 0; i < len(mesh.properties); i += mesh.num_props {
		v := mesh.properties[i:i + 3]
		min_bound.x = min(min_bound.x, v[0])
		min_bound.y = min(min_bound.y, v[1])
		min_bound.z = min(min_bound.z, v[2])
		max_bound.x = max(max_bound.x, v[0])
		max_bound.y = max(max_bound.y, v[1])
		max_bound.z = max(max_bound.z, v[2])
	}

	// glTF JSON chunk
	json_text := fmt.tprintf(
		`{{"asset":{{"version":"2.0"}},"scenes":[{{"nodes":[0]}}],"nodes":[{{"mesh":0}}],"meshes":[{{"primitives":[{{"attributes":{{"POSITION":1}},"indices":0}}]}}],"buffers":[{{"byteLength":%d}}],"bufferViews":[{{"buffer":0,"byteOffset":%d,"byteLength":%d,"target":34963}},{{"buffer":0,"byteOffset":%d,"byteLength":%d,"target":34962}}],"accessors":[{{"bufferView":0,"byteOffset":0,"componentType":5125,"count":%d,"type":"SCALAR"}},{{"bufferView":1,"byteOffset":0,"componentType":5126,"count":%d,"type":"VEC3","max":[%f,%f,%f],"min":[%f,%f,%f]}}]}}`,
		bin_len,
		idx_offset,
		idx_len,
		pos_offset,
		pos_len,
		len(mesh.indices),
		mesh.num_verts,
		max_bound.x,
		max_bound.y,
		max_bound.z,
		min_bound.x,
		min_bound.y,
		min_bound.z,
	)

	json_bytes := transmute([]u8)json_text
	json_pad := (4 - (len(json_bytes) % 4)) % 4
	json_chunk_len := len(json_bytes) + json_pad

	total_glb_len := 12 + 8 + json_chunk_len + 8 + bin_len
	out := make([]u8, total_glb_len)

	// 1. GLB 12-byte Header
	endian.unchecked_put_u32le(out[0:4], 0x46546C67) // 'glTF'
	endian.unchecked_put_u32le(out[4:8], 2)          // version 2
	endian.unchecked_put_u32le(out[8:12], u32(total_glb_len))

	cursor := 12

	// 2. Chunk 0: JSON
	endian.unchecked_put_u32le(out[cursor : cursor + 4], u32(json_chunk_len))
	endian.unchecked_put_u32le(out[cursor + 4 : cursor + 8], 0x4E4F534A) // 'JSON'
	cursor += 8
	copy(out[cursor:], json_bytes)
	cursor += len(json_bytes)
	for i in 0 ..< json_pad {
		out[cursor] = 0x20 // Space padded
		cursor += 1
	}

	// 3. Chunk 1: BIN
	endian.unchecked_put_u32le(out[cursor : cursor + 4], u32(bin_len))
	endian.unchecked_put_u32le(out[cursor + 4 : cursor + 8], 0x004E4942) // 'BIN\0'
	cursor += 8

	// Indices
	copy(out[cursor:], idx_bytes)
	cursor += idx_len
	cursor += idx_pad

	// Vertices
	copy(out[cursor:], pos_bytes)
	cursor += pos_len
	cursor += pos_pad

	return out
}
