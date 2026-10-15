package main

import "core:c"
import "core:encoding/json"
import "core:fmt"
import "core:net"

MONKEY_GLB :: #load("monkey.glb")

Base_Params :: struct {
	shape:          string,
	scale:          f32,
	bevel_width:    f32,
	bevel_segments: int,
}

Boolean_Payload :: struct {
	action:         string,
	operation:      string,
	tool_type:      string,
	position:       [3]f64,
	quaternion:     [4]f64,
	scale:          [3]f64,
	bevel_width:    f32,
	bevel_segments: int,
}

create_solid :: proc(
	shape: string,
	scale: f32,
	bevel_width: f32,
	bevel_segments: int,
) -> ManifoldHandle {
	s := scale * 1.5
	switch shape {
	case "cylinder":
		return cylinder(s, s * 0.5, segments = max(16, bevel_segments * 8), center = true)
	case "cone":
		return cone(s, s * 0.5, segments = max(16, bevel_segments * 8), center = true)
	case:
		return beveled_cube({s, s, s}, bevel_width, bevel_segments, center = true)
	}
}

main :: proc() {
	endpoint, _ := net.parse_endpoint("0.0.0.0:8000")
	listener, err := net.listen_tcp(endpoint)
	if err != nil {
		fmt.eprintfln("Failed to listen: %v", err)
		return
	}
	defer net.close(listener)

	fmt.println("Server running at http://localhost:8000")

	scratch_buf := make([dynamic]u8, 0, 1024 * 1024)
	defer delete(scratch_buf)

	raw_req: [4096]u8

	for {
		client_sock, _, accept_err := net.accept_tcp(listener)
		if accept_err != nil do continue

		bytes_read, r_err := net.recv_tcp(client_sock, raw_req[:])
		if r_err != nil || bytes_read <= 0 {
			net.close(client_sock)
			continue
		}

		req_str := string(raw_req[:bytes_read])
		req, ok := parse_request(req_str)
		if !ok {
			send_response(client_sock, 400, "Bad Request", "text/plain", nil)
			net.close(client_sock)
			continue
		}
		defer destroy_request(&req)

		if req.is_websocket {
			sec_key, has_key := req.headers["sec-websocket-key"]
			if has_key && upgrade_connection(client_sock, sec_key) {
				current_base: ManifoldHandle = nil
				defer if current_base != nil do destroy(current_base)

				for {
					frame, ok_frame := read_frame(client_sock, &scratch_buf)
					if !ok_frame || frame.opcode == .Close do break

					if frame.opcode != .Text && frame.opcode != .Binary do continue

					// Try unmarshaling as a boolean command
					bool_cmd: Boolean_Payload
					if err := json.unmarshal(frame.payload, &bool_cmd);
					   err == nil && bool_cmd.action == "boolean" {
						if current_base != nil {
							tool := create_solid(
								bool_cmd.tool_type,
								f32(bool_cmd.scale.x),
								bool_cmd.bevel_width,
								bool_cmd.bevel_segments,
							)

							translated_tool := translate(
								tool,
								bool_cmd.position.x,
								bool_cmd.position.y,
								bool_cmd.position.z,
							)
							destroy(tool)

							op: OpType = .Add
							if bool_cmd.operation == "DIFFERENCE" {
								op = .Subtract
							}
							else if bool_cmd.operation == "INTERSECT" {
								op = .Intersect
							}

							new_base := boolean_op(current_base, translated_tool, op)
							destroy(current_base)
							destroy(translated_tool)
							current_base = new_base
						}
					}
					else {
						// Otherwise parse as base parameter updates
						params: Base_Params
						if p_err := json.unmarshal(frame.payload, &params); p_err == nil {
							if params.shape == "monkey" {
								if current_base != nil {
									destroy(current_base)
									current_base = nil
								}
								send_binary_frame(client_sock, MONKEY_GLB)
								continue
							}

							if current_base != nil {
								destroy(current_base)
							}
							current_base = create_solid(
								params.shape,
								params.scale,
								params.bevel_width,
								params.bevel_segments,
							)
						}
					}

					// Send back updated mesh data if an active procedural solid exists
					if current_base != nil {
						mesh_data := get_mesh_data(current_base)
						defer destroy_mesh_data(&mesh_data)

						glb_payload := pack_mesh_to_glb(mesh_data)
						defer delete(glb_payload)

						send_binary_frame(client_sock, glb_payload)
					}
				}
			}
			net.close(client_sock)
			continue
		}
		switch req.path {
		case "/":
			serve_file(client_sock, "src/index.html")
		case:
			rel_path := fmt.tprintf("src/%s", req.path[1:])
			serve_file(client_sock, rel_path)
		}
		net.close(client_sock)
	}
}


