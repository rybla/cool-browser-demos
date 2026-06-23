import path from "path";

const server = Bun.serve({
  async fetch(req) {
    let fp = path.join("dist", new URL(req.url).pathname);
    if ((await Bun.file(fp).stat()).isDirectory()) {
      fp = path.join(fp, "index.html");
    }
    return new Response(Bun.file(fp));
  },
  error() {
    return new Response(null, { status: 404 });
  },
});

console.log(`Server listening at http://${server.hostname}:${server.port}`);
