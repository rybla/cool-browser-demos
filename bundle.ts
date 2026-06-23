import fs from "fs/promises";

const entrypoints = Array.from(new Bun.Glob("site/**/index.html").scanSync());

console.log({ entrypoints });

await fs.rm("dist", { recursive: true, force: true });

await Bun.build({
  compile: true,
  entrypoints,
  outdir: "dist",
});
