package main

import "core:fmt"

main :: proc() {
	fmt.println("Initializing Manifold Boolean test...")

	base := cube({2.0, 2.0, 2.0}, center = true)
	defer destroy(base)

	tool := cylinder(3.0, 0.75, segments = 32, center = true)
	defer destroy(tool)

	result := boolean_op(base, tool, .Subtract)
	defer destroy(result)

	mesh_data := get_mesh_data(result)
	defer destroy_mesh_data(&mesh_data)

	fmt.printfln("Boolean successful:")
	fmt.printfln("  Vertices:  %d", mesh_data.num_verts)
	fmt.printfln("  Triangles: %d", mesh_data.num_tris)
	fmt.printfln("  Props len: %d (stride: %d)", len(mesh_data.properties), mesh_data.num_props)
	fmt.printfln("  Index len: %d", len(mesh_data.indices))
}
