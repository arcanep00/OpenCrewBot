import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

const port = parseInt(process.env.PORT ?? "3000", 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
}).listen(port, "0.0.0.0", () => {
  console.log(`> Ready on http://0.0.0.0:${port}`);
});
