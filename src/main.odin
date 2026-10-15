package main

import "core:encoding/json"
import "core:fmt"
import "core:net"
import "core:strings"
import "core:sync"
import "core:thread"

Boolean_Payload :: struct {
	action:         string,
	operation:      string,
	tool_type:      string,
	position:       [3]f64,
	rotation:       [3]f64, // [rx, ry, rz] in degrees
	scale:          [3]f64,
	bevel_width:    f32,
	bevel_segments: int,
}

Base_Params :: struct {
	shape:          string,
	scale:          f32,
	bevel_width:    f32,
	bevel_segments: int,
}

MONKEY_GLB :: #load("monkey.glb")
MONKEY_STL :: #load("monkey.stl")

// Shared export caches and mutex
cache_mutex: sync.Mutex
latest_glb: [dynamic]u8
latest_stl: [dynamic]u8

create_solid :: proc(
	shape: string,
	scale: f32,
	bevel_width: f32,
	bevel_segments: int,
) -> ManifoldHandle {
	s := scale * 1.5
	switch shape {
	case "cylinder":
		return beveled_cylinder(s, s * 0.5, bevel_width, bevel_segments, center = true)
	case "cone":
		return beveled_cone(s, s * 0.5, bevel_width, bevel_segments, center = true)
	case:
		return beveled_cube({s, s, s}, bevel_width, bevel_segments, center = true)
	}
}

send_download_response :: proc(sock: net.TCP_Socket, filename: string, mime: string, body: []u8) {
	header := fmt.tprintf(
		"HTTP/1.1 200 OK\r\n" +
		"Content-Type: %s\r\n" +
		"Content-Disposition: attachment; filename=\"%s\"\r\n" +
		"Content-Length: %d\r\n" +
		"Connection: close\r\n\r\n",
		mime,
		filename,
		len(body),
	)

	net.send_tcp(sock, transmute([]u8)header)
	if len(body) > 0 {
		net.send_tcp(sock, body)
	}
}

Ws_Client :: struct {
	sock: net.TCP_Socket,
	key:  string,
}

ws_session_proc :: proc(data: rawptr) {
	client := cast(^Ws_Client)data
	defer {
		net.close(client.sock)
		delete(client.key)
		free(client)
	}

	if !upgrade_connection(client.sock, client.key) {
		return
	}

	scratch_buf := make([dynamic]u8, 0, 1024 * 1024)
	defer delete(scratch_buf)

	current_base: ManifoldHandle = nil
	defer if current_base != nil do destroy(current_base)

	// Stack to store previous base handles for undo
	undo_stack: [dynamic]ManifoldHandle
	redo_stack: [dynamic]ManifoldHandle
	defer {
		for h in undo_stack do if h != nil do destroy(h)
		delete(undo_stack)
		for h in redo_stack do if h != nil do destroy(h)
		delete(redo_stack)
	}

	for {
		frame, ok_frame := read_frame(client.sock, &scratch_buf)
		if !ok_frame || frame.opcode == .Close do break
		if frame.opcode != .Text && frame.opcode != .Binary do continue

		Cmd_Header :: struct {
			action: string,
		}
		hdr: Cmd_Header
		json.unmarshal(frame.payload, &hdr)

		switch hdr.action {
		case "undo":
			if len(undo_stack) > 0 {
				append(&redo_stack, current_base)
				current_base = pop(&undo_stack)
			}
			else {
				continue
			}

		case "redo":
			if len(redo_stack) > 0 {
				append(&undo_stack, current_base)
				current_base = pop(&redo_stack)
			}
			else {
				continue
			}

		case "boolean":
			bool_cmd: Boolean_Payload
			if b_err := json.unmarshal(frame.payload, &bool_cmd);
			   b_err == nil && current_base != nil {
				tool := create_solid(
					bool_cmd.tool_type,
					f32(bool_cmd.scale.x),
					bool_cmd.bevel_width,
					bool_cmd.bevel_segments,
				)

				rotated_tool := rotate(
					tool,
					bool_cmd.rotation.x,
					bool_cmd.rotation.y,
					bool_cmd.rotation.z,
				)
				destroy(tool)

				placed_tool := translate(
					rotated_tool,
					bool_cmd.position.x,
					bool_cmd.position.y,
					bool_cmd.position.z,
				)
				destroy(rotated_tool)

				op: OpType = .Add
				if bool_cmd.operation == "DIFFERENCE" {
					op = .Subtract
				}
				else if bool_cmd.operation == "INTERSECT" {
					op = .Intersect
				}

				new_base := boolean_op(current_base, placed_tool, op)
				destroy(placed_tool)

				if new_base != nil {
					append(&undo_stack, current_base)

					// Invalidate redo stack on new branch of edits
					for h in redo_stack do if h != nil do destroy(h)
					clear(&redo_stack)

					if len(undo_stack) > 20 {
						destroy(undo_stack[0])
						ordered_remove(&undo_stack, 0)
					}

					current_base = new_base
				}
			}

		case:
			// Standard base parameter updates (slider drags, dropdown changes)
			params: Base_Params
			if p_err := json.unmarshal(frame.payload, &params);
			   p_err == nil && len(params.shape) > 0 {
				for h in undo_stack do if h != nil do destroy(h)
				clear(&undo_stack)
				for h in redo_stack do if h != nil do destroy(h)
				clear(&redo_stack)

				if params.shape == "monkey" {
					if current_base != nil {
						destroy(current_base)
						current_base = nil
					}

					sync.mutex_lock(&cache_mutex)
					clear(&latest_glb)
					append(&latest_glb, ..MONKEY_GLB)
					clear(&latest_stl)
					append(&latest_stl, ..MONKEY_STL)
					sync.mutex_unlock(&cache_mutex)

					send_binary_frame(client.sock, MONKEY_GLB)
					continue
				}

				if current_base != nil do destroy(current_base)
				current_base = create_solid(
					params.shape,
					params.scale,
					params.bevel_width,
					params.bevel_segments,
				)
			}
			else {
				continue
			}
		}

		// Repack and broadcast the active base mesh after undo/redo/boolean
		if current_base != nil {
			mesh_data := get_mesh_data(current_base)
			defer destroy_mesh_data(&mesh_data)

			glb_payload := pack_mesh_to_glb(mesh_data)
			defer delete(glb_payload)

			stl_payload := pack_mesh_to_stl(mesh_data)
			defer delete(stl_payload)

			sync.mutex_lock(&cache_mutex)
			clear(&latest_glb)
			append(&latest_glb, ..glb_payload)
			clear(&latest_stl)
			append(&latest_stl, ..stl_payload)
			sync.mutex_unlock(&cache_mutex)

			send_binary_frame(client.sock, glb_payload)
		}
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

		// WebSocket Route -> Hand off to thread immediately
		if req.is_websocket {
			sec_key, has_key := req.headers["sec-websocket-key"]
			if has_key {
				client := new(Ws_Client)
				client.sock = client_sock
				client.key = strings.clone(sec_key)
				thread.create_and_start_with_data(client, ws_session_proc)
				continue
			}
			net.close(client_sock)
			continue
		}

		// HTTP Routes -> Handled synchronously without stalling the main loop
		switch req.path {
		case "/":
			serve_file(client_sock, "src/index.html")
		case "/export/glb":
			sync.mutex_lock(&cache_mutex)
			has_data := len(latest_glb) > 0
			payload := make([]u8, len(latest_glb))
			if has_data {
				copy(payload, latest_glb[:])
			}
			sync.mutex_unlock(&cache_mutex)
			if has_data {
				send_download_response(
					client_sock,
					"smoothie_model.glb",
					"model/gltf-binary",
					payload,
				)
			}
			else {
				send_response(
					client_sock,
					404,
					"Not Found",
					"text/plain",
					transmute([]u8)string("No model generated yet."),
				)
			}
			delete(payload)
		case "/export/stl":
			sync.mutex_lock(&cache_mutex)
			has_data := len(latest_stl) > 0
			payload := make([]u8, len(latest_stl))
			if has_data {
				copy(payload, latest_stl[:])
			}
			sync.mutex_unlock(&cache_mutex)
			if has_data {
				send_download_response(client_sock, "smoothie_model.stl", "model/stl", payload)
			}
			else {
				send_response(
					client_sock,
					404,
					"Not Found",
					"text/plain",
					transmute([]u8)string("No model generated yet."),
				)
			}
			delete(payload)
		case:
			rel_path := fmt.tprintf("src/%s", req.path[1:])
			serve_file(client_sock, rel_path)
		}
		net.close(client_sock)
	}
}


