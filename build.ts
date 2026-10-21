import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";

const isMinify = Deno.args.includes("--minify");

await Deno.mkdir("public", { recursive: true });

// Copy the Manifold WASM binary to public/ so the browser can fetch it
try {
  const wasmUrl = new URL("./manifold.wasm", import.meta.resolve("manifold-3d"));
  await Deno.copyFile(wasmUrl, "public/manifold.wasm");
} catch (_err) {
  // Ignored if manifold-3d inlines or bundles its wasm
}

// Intercept Node.js built-ins before deno-loader tries to resolve them on disk
const externalNodePlugin: esbuild.Plugin = {
  name: "external-node",
  setup(build) {
    build.onResolve({ filter: /^(node:.*|fs|path)$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

await esbuild.build({
  plugins: [externalNodePlugin, ...denoPlugins()],
  entryPoints: ["src/app.ts"],
  outfile: "public/bundle.js",
  bundle: true,
  format: "esm",
  target: "esnext",
  sourcemap: !isMinify,
  minify: isMinify,
});

await esbuild.stop();
console.log(`Bundle built successfully to public/bundle.js ${isMinify ? "(minified)" : ""}`);
