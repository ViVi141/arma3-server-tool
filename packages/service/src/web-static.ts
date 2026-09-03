import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function resolveWebRoot(serviceCwd?: string): string | null {
  const fromEnv = process.env.WEB_ROOT;
  if (fromEnv && fromEnv.trim().length > 0) {
    const envRoot = fromEnv.trim();
    if (fs.existsSync(path.join(envRoot, "index.html"))) {
      return envRoot;
    }
    return null;
  }

  let cwd = process.cwd();
  if (serviceCwd && serviceCwd.length > 0) {
    cwd = serviceCwd;
  }
  const sibling = path.join(cwd, "..", "web");
  if (fs.existsSync(path.join(sibling, "index.html"))) {
    return sibling;
  }
  return null;
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mapped = MIME[ext];
  if (mapped) {
    return mapped;
  }
  return "application/octet-stream";
}

function isSafeUnderRoot(webRoot: string, candidate: string): boolean {
  const root = path.normalize(webRoot);
  const abs = path.normalize(candidate);
  if (abs === root) {
    return true;
  }
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return abs.startsWith(prefix);
}

export async function registerWebStatic(app: FastifyInstance, webRoot: string): Promise<void> {
  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") {
      return reply.code(404).send({ success: false, error: "Not found" });
    }

    const urlPath = (request.url.split("?")[0] ?? "/");
    if (urlPath.startsWith("/api/")) {
      return reply.code(404).send({ success: false, error: "Not found" });
    }

    let relative = urlPath.replace(/^\/+/, "");
    if (relative.length === 0) {
      relative = "index.html";
    }

    let file = path.join(webRoot, relative);
    if (!isSafeUnderRoot(webRoot, file)) {
      return reply.code(403).send("Forbidden");
    }

    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(webRoot, "index.html");
    }

    reply.type(mimeFor(file));
    return reply.send(fs.createReadStream(file));
  });

  app.log.info(`Serving web UI from ${webRoot}`);
}
