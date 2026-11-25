import { createServer } from "node:http";
import { parse } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT ?? "3000", 10);

process.env.NODE_ENV = "production";

const { default: next } = await import("next");

const app = next({
  dev: false,
  dir: __dirname,
});

const handle = app.getRequestHandler();
await app.prepare();

createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
}).listen(port, "0.0.0.0", () => {
  console.log(`> Ready on port ${port}`);
});
