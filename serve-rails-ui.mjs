import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const FILES = {
  "/": "test-rails-render.html",
  "/render": "test-rails-render.html",
  "/api": "test-rails-ui.html",
};

http
  .createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    const file = FILES[urlPath] || urlPath.slice(1);
    const full = path.join(__dirname, file);

    if (!full.startsWith(__dirname)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found: " + file);
        return;
      }
      const ext = path.extname(full).toLowerCase();
      const ct =
        ext === ".html" ? "text/html" :
        ext === ".js"   ? "application/javascript" :
        ext === ".css"  ? "text/css" :
        ext === ".json" ? "application/json" :
        "text/plain";
      res.writeHead(200, { "Content-Type": ct });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`Rails UI hosted at http://localhost:${PORT}/`);
    console.log(`  /        -> test-rails-render.html (visual renderer)`);
    console.log(`  /api     -> test-rails-ui.html (API tester)`);
  });
