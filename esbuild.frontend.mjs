import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/frontend/index.tsx"],
  outfile: "public/js/viewer.bundle.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  sourcemap: true,
  minify: false,
  jsx: "automatic",
});

if (watch) {
  await ctx.watch();
  console.log("Watching frontend sources...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Frontend built.");
}
