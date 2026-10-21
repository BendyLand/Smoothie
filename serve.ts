const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".stl": "model/stl",
  ".json": "application/json; charset=utf-8",
};

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filepath = `./public${pathname}`;

  try {
    const file = await Deno.readFile(filepath);
    const dotIndex = filepath.lastIndexOf(".");
    const ext = dotIndex !== -1 ? filepath.substring(dotIndex) : "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new Response(file, {
      headers: {
        "content-type": contentType,
      },
    });
  } catch {
    return new Response("404 Not Found", { status: 404 });
  }
});
