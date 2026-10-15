package main

import "core:crypto/legacy/sha1"
import "core:encoding/base64"
import "core:fmt"
import "core:net"
import "core:thread"

Client_Context :: struct {
	sock: net.TCP_Socket,
	key:  string,
}

WS_MAGIC_GUID :: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

Opcode :: enum u8 {
	Continuation = 0x0,
	Text         = 0x1,
	Binary       = 0x2,
	Close        = 0x8,
	Ping         = 0x9,
	Pong         = 0xA,
}

Frame :: struct {
	fin:     bool,
	opcode:  Opcode,
	payload: []u8,
}

ws_worker :: proc(raw_data: rawptr) {
	ctx := cast(^Client_Context)raw_data
	defer {
		net.close(ctx.sock)
		delete(ctx.key)
		free(ctx)
	}

	if upgrade_connection(ctx.sock, ctx.key) {
		scratch_buf := make([dynamic]u8, 0, 1024 * 1024)
		defer delete(scratch_buf)

		for {
			frame, ok := read_frame(ctx.sock, &scratch_buf)
			if !ok || frame.opcode == .Close do break

			if frame.opcode == .Text || frame.opcode == .Binary {
				cube_solid := cube({2.0, 2.0, 2.0}, center = true)
				defer destroy(cube_solid)

				cyl_solid := cylinder(3.0, 0.75, segments = 32, center = true)
				defer destroy(cyl_solid)

				cut_solid := boolean_op(cube_solid, cyl_solid, .Subtract)
				defer destroy(cut_solid)

				mesh_data := get_mesh_data(cut_solid)
				defer destroy_mesh_data(&mesh_data)

				glb_payload := pack_mesh_to_glb(mesh_data)
				defer delete(glb_payload)

				send_binary_frame(ctx.sock, glb_payload)
			}
		}
	}
}

// Performs HTTP Upgrade Handshake
upgrade_connection :: proc(sock: net.TCP_Socket, client_key: string) -> bool {
	// Compute accept hash: Base64(SHA1(client_key + GUID))
	accept_seed := fmt.tprintf("%s%s", client_key, WS_MAGIC_GUID)
	ctx: sha1.Context
	sha1.init(&ctx)
	sha1.update(&ctx, transmute([]byte)accept_seed)
	sha1_digest: [sha1.DIGEST_SIZE]byte
	sha1.final(&ctx, sha1_digest[:])
	accept_key := base64.encode(sha1_digest[:])
	defer delete(accept_key)

	response := fmt.tprintf(
		"HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: %s\r\n\r\n",
		accept_key,
	)

	_, send_err := net.send_tcp(sock, transmute([]u8)response)
	return send_err == nil
}

// Reads and unmasks incoming client frames
read_frame :: proc(sock: net.TCP_Socket, arena: ^[dynamic]u8) -> (Frame, bool) {
	header: [2]u8
	_, err := net.recv_tcp(sock, header[:])
	if err != nil do return {}, false

	fin := (header[0] & 0x80) != 0
	opcode := Opcode(header[0] & 0x0F)
	masked := (header[1] & 0x80) != 0
	basic_len := int(header[1] & 0x7F)

	payload_len := basic_len
	if basic_len == 126 {
		ext: [2]u8
		net.recv_tcp(sock, ext[:])
		payload_len = int(ext[0]) << 8 | int(ext[1])
	}
	else if basic_len == 127 {
		ext: [8]u8
		net.recv_tcp(sock, ext[:])
		payload_len = 0
		for b in ext {
			payload_len = (payload_len << 8) | int(b)
		}
	}

	mask_key: [4]u8
	if masked {
		net.recv_tcp(sock, mask_key[:])
	}

	// Read payload
	clear(arena)
	resize(arena, payload_len)

	received := 0
	for received < payload_len {
		n, rerr := net.recv_tcp(sock, arena[received:])
		if rerr != nil || n <= 0 do return {}, false
		received += n
	}

	// Unmask client payload
	if masked {
		for i in 0 ..< payload_len {
			arena[i] ~= mask_key[i % 4]
		}
	}

	return Frame{fin = fin, opcode = opcode, payload = arena[:]}, true
}

// Emits unmasked server binary frames
send_binary_frame :: proc(sock: net.TCP_Socket, payload: []u8) -> bool {
	header: [10]u8
	header[0] = 0x80 | u8(Opcode.Binary) // FIN + Binary Opcode
	header_len := 2

	plen := len(payload)
	if plen < 126 {
		header[1] = u8(plen)
	}
	else if plen <= 65535 {
		header[1] = 126
		header[2] = u8((plen >> 8) & 0xFF)
		header[3] = u8(plen & 0xFF)
		header_len = 4
	}
	else {
		header[1] = 127
		header[2] = u8((plen >> 56) & 0xFF)
		header[3] = u8((plen >> 48) & 0xFF)
		header[4] = u8((plen >> 40) & 0xFF)
		header[5] = u8((plen >> 32) & 0xFF)
		header[6] = u8((plen >> 24) & 0xFF)
		header[7] = u8((plen >> 16) & 0xFF)
		header[8] = u8((plen >> 8) & 0xFF)
		header[9] = u8(plen & 0xFF)
		header_len = 10
	}

	if _, err := net.send_tcp(sock, header[:header_len]); err != nil do return false
	if _, err := net.send_tcp(sock, payload); err != nil do return false
	return true
}


