import { json } from "@sveltejs/kit";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { z } from "zod";

const DownloadSchema = z.object({
  url: z.string().url(),
  options: z.object({
    format: z.string().optional(),
    filename: z.string().optional(),
    locationName: z.string().optional(),
    isPlaylist: z.boolean().optional(),
    audioOnly: z.boolean().optional(),
    audioFormat: z.string().optional(),
    maxResolution: z.string().optional(),
    embedMetadata: z.boolean().optional(),
    embedThumbnail: z.boolean().optional(),
    advanced: z.boolean().optional(),
  }),
});

export async function POST({ request }) {
  const body = await request.json();
  const result = DownloadSchema.safeParse(body);

  if (!result.success) {
    return json(
      { error: "Invalid request", details: result.error },
      { status: 400 }
    );
  }

  const { url, options } = result.data;

  // Load config
  const configPath = path.resolve("config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Find the selected location or use the first one as default
  const selectedLocation = options.locationName
    ? config.allowed_locations.find(
        (loc: any) => loc.name === options.locationName
      )
    : config.allowed_locations[0];

  if (!selectedLocation) {
    return json({ error: "Invalid location selected" }, { status: 400 });
  }

  const outputDir = selectedLocation.path;

  // Security check: ensure outputDir is in allowed_locations
  const isAllowed = config.allowed_locations.some((loc: any) => {
    const resolvedLoc = path.resolve(loc.path);
    const resolvedOutputDir = path.resolve(outputDir);
    return resolvedOutputDir.startsWith(resolvedLoc);
  });

  if (!isAllowed) {
    return json({ error: "Output location not allowed" }, { status: 403 });
  }

  // Build yt-dlp arguments
  const args = [url];

  // Default: write sidecar metadata
  args.push("--write-info-json");

  if (options.audioOnly) {
    args.push("--extract-audio");
    if (options.audioFormat) {
      args.push("--audio-format", options.audioFormat);
    }
  }

  if (options.maxResolution && !options.audioOnly) {
    // Example: bestvideo[height<=?1080]+bestaudio/best
    args.push(
      "-f",
      `bestvideo[height<=?${options.maxResolution}]+bestaudio/best`
    );
  } else if (options.format) {
    args.push("-f", options.format);
  }

  if (options.embedMetadata) {
    args.push("--embed-metadata");
  }

  if (options.embedThumbnail) {
    args.push("--embed-thumbnail");
  }

  if (options.isPlaylist) {
    args.push("--yes-playlist");
    if (options.filename) {
      args.push("-o", path.join(outputDir, options.filename));
    } else {
      // Better template for playlists: PlaylistTitle/Index - VideoTitle.ext
      args.push(
        "-o",
        path.join(
          outputDir,
          "%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s"
        )
      );
    }
  } else {
    args.push("--no-playlist");
    if (options.filename) {
      args.push("-o", path.join(outputDir, options.filename));
    } else {
      args.push("-o", path.join(outputDir, "%(title)s.%(ext)s"));
    }
  }

  if (options.advanced) {
    // Add more advanced options here if needed
    // For now, just a placeholder for where they would go
  }

  return new Promise((resolve) => {
    const process = spawn(config.yt_dlp_path || "yt-dlp", args);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(json({ message: "Download started/finished", stdout }));
      } else {
        resolve(
          json({ error: "yt-dlp failed", stderr, code }, { status: 500 })
        );
      }
    });
  });
}
