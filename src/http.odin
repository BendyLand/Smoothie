package main

import "core:fmt"
import "core:net"
import "core:os"
import "core:strings"

Method :: enum {
	GET,
	POST,
	HEAD,
	UNKNOWN,
}

Request :: struct {
	method:       Method,
	path:         string,
	headers:      map[string]string,
	is_websocket: bool,
}

// Parses raw HTTP/1.1 text into a structured request
parse_request :: proc(raw: string) -> (req: Request, ok: bool) {
	req.headers = make(map[string]string)

	lines := strings.split(raw, "\r\n")
	if len(lines) == 0 do return req, false

	// 1. Request Line: "METHOD /path HTTP/1.1"
	parts := strings.fields(lines[0])
	if len(parts) < 2 do return req, false

	switch parts[0] {
	case "GET":
		req.method = .GET
	case "POST":
		req.method = .POST
	case "HEAD":
		req.method = .HEAD
	case:
		req.method = .UNKNOWN
	}

	req.path = parts[1]

	// 2. Parse Headers
	for i in 1 ..< len(lines) {
		line := lines[i]
		if len(line) == 0 do break // Reached empty line before body

		colon := strings.index(line, ":")
		if colon == -1 do continue

		key := strings.to_lower(strings.trim_space(line[:colon]))
		val := strings.trim_space(line[colon + 1:])
		req.headers[key] = val
	}

	// Detect WebSocket upgrade intent
	if upgrade, has_up := req.headers["upgrade"]; has_up {
		if strings.to_lower(upgrade) == "websocket" {
			req.is_websocket = true
		}
	}

	return req, true
}

destroy_request :: proc(req: ^Request) {
	delete(req.headers)
}

// Determines MIME types from file extensions
get_mime_type :: proc(path: string) -> string {
	if strings.has_suffix(path, ".html") {return "text/html; charset=utf-8"}
	if strings.has_suffix(path, ".js") {return "application/javascript"}
	if strings.has_suffix(path, ".css") {return "text/css"}
	if strings.has_suffix(path, ".json") {return "application/json"}
	if strings.has_suffix(path, ".glb") {return "model/gltf-binary"}
	return "application/octet-stream"
}

// Sends standard HTTP responses
send_response :: proc(
	sock: net.TCP_Socket,
	status: int,
	status_text: string,
	mime: string,
	body: []u8,
) {
	header := fmt.tprintf(
		"HTTP/1.1 %d %s\r\n" +
		"Content-Type: %s\r\n" +
		"Content-Length: %d\r\n" +
		"Connection: close\r\n\r\n",
		status,
		status_text,
		mime,
		len(body),
	)

	net.send_tcp(sock, transmute([]u8)header)
	if len(body) > 0 {
		net.send_tcp(sock, body)
	}
}

// Serves files from disk (e.g. from a ./public folder)
serve_file :: proc(sock: net.TCP_Socket, filepath: string) {
	// Pass context.allocator explicitly; unpack (data, err)
	data, err := os.read_entire_file(filepath, context.allocator)
	if err != nil {
		send_response(sock, 404, "Not Found", "text/plain", transmute([]u8)string("404 Not Found"))
		return
	}
	defer delete(data)

	send_response(sock, 200, "OK", get_mime_type(filepath), data)
}


