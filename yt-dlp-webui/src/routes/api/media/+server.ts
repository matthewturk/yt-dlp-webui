import fs from "fs";
import path from "path";
import { Readable } from "stream";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".mka": "audio/x-matroska",
  ".webm": "audio/webm",
};

function loadConfig(): any {
  const defaultConfig = {
    allowed_locations: [{ name: "Default", path: "downloads" }],
  };

  let configPath = path.resolve("webui_config.json");
  if (!fs.existsSync(configPath) && fs.existsSync("/app/webui_config.json")) {
    configPath = "/app/webui_config.json";
  }

  if (!fs.existsSync(configPath)) return defaultConfig;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.allowed_locations ? config : defaultConfig;
  } catch (e) {
    console.error("Error reading webui_config.json:", e);
    return defaultConfig;
  }
}

function allowedRoots(): string[] {
  const config = loadConfig();
  const raw = config.allowed_locations || [];
  const locations = Array.isArray(raw) ? raw : Object.values(raw);

  const roots = new Set<string>();
  for (const loc of locations) {
    if (loc && typeof loc === "object" && loc.path) {
      roots.add(path.resolve(String(loc.path)));
    }
  }
  return Array.from(roots);
}

function isWithinAllowedRoots(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return allowedRoots().some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
}

function buildResponse(
  filePath: string,
  rangeHeader: string | null,
): Response {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream) as any, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${size}`,
          },
        });
      }
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
  }

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as any, {
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}

export async function GET({ request, url }) {
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return new Response("Missing path parameter", { status: 400 });
  }

  const resolved = path.resolve(rawPath);

  if (!isWithinAllowedRoots(resolved)) {
    return new Response("Forbidden: path outside allowed locations", {
      status: 403,
    });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return new Response("File not found", { status: 404 });
  }

  try {
    return buildResponse(resolved, request.headers.get("range"));
  } catch (e: any) {
    console.error("Media streaming error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function HEAD({ request, url }) {
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return new Response("Missing path parameter", { status: 400 });
  }

  const resolved = path.resolve(rawPath);

  if (!isWithinAllowedRoots(resolved)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return new Response("File not found", { status: 404 });
  }

  const stat = fs.statSync(resolved);
  const mime = MIME_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream";
  return new Response(null, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
