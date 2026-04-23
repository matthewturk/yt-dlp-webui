import { spawn, spawnSync } from "child_process";
import type { Buffer } from "buffer";
import path from "path";
import fs from "fs";

export interface DownloadTask {
  id: string;
  url: string;
  options: any;
  status:
    | "queued"
    | "downloading"
    | "completed"
    | "failed"
    | "skipped"
    | "cancelled";
  progress: string;
  error?: string;
  logs: string[];
}

export interface HistoryEntry {
  url: string;
  format: string;
  timestamp: string;
}

interface QueueResponseOptions {
  includeAllCompleted?: boolean;
  completedLimit?: number;
}

class QueueManager {
  private queue: DownloadTask[] = [];
  private activeTask: DownloadTask | null = null;
  private activeProcess: any = null;
  private config: any = null;

  constructor() {
    this.loadConfig();
    if (!fs.existsSync(this.getHistoryPath())) {
      fs.writeFileSync(this.getHistoryPath(), JSON.stringify([]));
    }
  }

  private loadConfig() {
    const configPath = path.resolve("webui_config.json");
    const defaultConfig = {
      yt_dlp_path: "yt-dlp",
      allowed_locations: [{ name: "Default", path: "downloads" }],
      history_path: "history.json",
      extra_args: "",
    };

    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, "utf-8");
        this.config = JSON.parse(data);
      } catch (e) {
        console.error("Error reading or parsing webui_config.json:", e);
        this.config = defaultConfig;
      }
    } else {
      this.config = defaultConfig;
    }

    // Ensure allowed_locations is an array of objects
    if (this.config.allowed_locations) {
      if (
        typeof this.config.allowed_locations === "object" &&
        !Array.isArray(this.config.allowed_locations)
      ) {
        this.config.allowed_locations = Object.values(
          this.config.allowed_locations,
        );
      }

      if (Array.isArray(this.config.allowed_locations)) {
        this.config.allowed_locations = this.config.allowed_locations
          .filter((loc: any) => loc && typeof loc === "object")
          .map((loc: any) => ({
            name: loc.name || loc.path || "Unknown",
            path: loc.path || "/share/downloads",
          }));
      }
    }

    if (
      !Array.isArray(this.config.allowed_locations) ||
      this.config.allowed_locations.length === 0
    ) {
      this.config.allowed_locations = defaultConfig.allowed_locations;
    }
  }

  private getHistoryPath() {
    return path.resolve(this.config?.history_path || "history.json");
  }

  private formatDate(dateStr: string): string {
    if (typeof dateStr === "string" && /^\d{8}$/.test(dateStr)) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr || "";
  }

  private cleanMetadataString(value: string): string {
    if (!value) return "";
    return value.replace(/\s*\[Audio Only\]\s*/gi, "").trim();
  }

  private sanitizeFileNamePart(value: string): string {
    // Keep names portable across filesystems and avoid problematic punctuation.
    return value
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/[\x00-\x1f\x80-\x9f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, "")
      .trim()
      .slice(0, 180);
  }

  private listFilesRecursive(rootDir: string): string[] {
    if (!fs.existsSync(rootDir)) return [];

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.listFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private findLikelyInfoJson(mediaPath: string): string | null {
    const dir = path.dirname(mediaPath);
    const baseNoExt = path.basename(mediaPath, path.extname(mediaPath));
    const directMatch = path.join(dir, `${baseNoExt}.info.json`);
    if (fs.existsSync(directMatch)) {
      return directMatch;
    }

    const idMatch = path.basename(mediaPath).match(/\[([^\]]+)\]/);
    if (!idMatch) return null;

    const idToken = `[${idMatch[1]}]`;
    const siblings = fs.readdirSync(dir);
    const candidate = siblings.find(
      (name: string) => name.endsWith(".info.json") && name.includes(idToken),
    );

    return candidate ? path.join(dir, candidate) : null;
  }

  private buildEnhancedMetadataTags(infoJson: any): Array<[string, string]> {
    const rawTitle = this.cleanMetadataString(infoJson?.title || "");
    const uploader = this.cleanMetadataString(
      infoJson?.uploader || infoJson?.channel || infoJson?.artist || "",
    );
    const series = this.cleanMetadataString(
      infoJson?.series || infoJson?.album || uploader || "Unknown Podcast",
    );
    const description = infoJson?.description || "";

    const seasonNumber = Number.isFinite(Number(infoJson?.season_number))
      ? Number(infoJson.season_number)
      : 1;

    let episodeNumber = Number.isFinite(Number(infoJson?.episode_number))
      ? Number(infoJson.episode_number)
      : 0;

    if (!episodeNumber && Number.isFinite(Number(infoJson?.playlist_index))) {
      episodeNumber = Number(infoJson.playlist_index);
    }

    const language = infoJson?.language || "en";
    const releaseDate =
      this.formatDate(infoJson?.release_date || "") ||
      this.formatDate(infoJson?.upload_date || "");

    const tags: Array<[string, string]> = [
      ["title", rawTitle],
      ["album", series],
      ["album_sort", series],
      ["series", series],
      ["movement_name", series],
      ["artist", uploader],
      ["artist_sort", uploader],
      ["album_artist", uploader],
      ["album_artist_sort", uploader],
      ["disc", String(seasonNumber)],
      ["track", String(episodeNumber)],
      ["movement", String(episodeNumber)],
      ["comment", description],
      ["description", description],
      ["lyrics", description],
      ["date", releaseDate],
      ["publisher", uploader],
      ["genre", "Podcast"],
      ["language", language],
      ["podcast", "1"],
    ];

    return tags.filter(([, value]) => value !== "");
  }

  /**
   * When absMode is active, yt-dlp writes thumbnail images alongside audio
   * (e.g. "Show/Episode [id].jpg"). ABS reads a cover.jpg in the podcast
   * folder as the show artwork. This promotes the first new image in each
   * podcast subfolder to cover.jpg if one doesn't already exist.
   */
  private promoteCoverArt(
    task: DownloadTask,
    outputDir: string,
    beforeFiles: string[],
  ): void {
    const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
    const afterFiles = this.listFilesRecursive(outputDir);
    const beforeSet = new Set(beforeFiles);

    // Collect new image files grouped by their parent directory.
    const newImagesByDir = new Map<string, string[]>();
    for (const file of afterFiles) {
      if (
        !beforeSet.has(file) &&
        imageExtensions.has(path.extname(file).toLowerCase())
      ) {
        const dir = path.dirname(file);
        if (!newImagesByDir.has(dir)) newImagesByDir.set(dir, []);
        newImagesByDir.get(dir)!.push(file);
      }
    }

    for (const [dir, images] of newImagesByDir) {
      // Skip the root output dir itself — only act on podcast subfolders.
      if (path.resolve(dir) === path.resolve(outputDir)) continue;

      const coverPath = path.join(dir, "cover.jpg");
      if (fs.existsSync(coverPath)) continue;

      // Use the first new image as cover.jpg (copy so the source file is preserved
      // in case ABS or other tools also reference it).
      const source = images[0];
      try {
        fs.copyFileSync(source, coverPath);
        task.logs.push(`abs: wrote cover.jpg from ${source}`);
      } catch (err: any) {
        task.logs.push(`abs: failed to write cover.jpg (${err?.message})`);
      }
    }
  }

  private applyEnhancedAudioMetadata(
    task: DownloadTask,
    outputDir: string,
    beforeFiles: string[],
  ): void {
    if (!task.options.audioOnly || !task.options.embedMetadata) return;
    if (task.options.enhancedAudioMetadata === false) return;

    if (task.options.absMode) {
      this.promoteCoverArt(task, outputDir, beforeFiles);
    }

    const afterFiles = this.listFilesRecursive(outputDir);
    const beforeSet = new Set(beforeFiles);
    const newFiles = afterFiles.filter((file) => !beforeSet.has(file));

    const audioExtensions = new Set([
      ".mp3",
      ".m4a",
      ".opus",
      ".wav",
      ".ogg",
      ".flac",
      ".aac",
    ]);

    const newAudioFiles = newFiles.filter((file) =>
      audioExtensions.has(path.extname(file).toLowerCase()),
    );

    for (const mediaPath of newAudioFiles) {
      const infoPath = this.findLikelyInfoJson(mediaPath);
      if (!infoPath || !fs.existsSync(infoPath)) {
        task.logs.push(`metadata: skipped ${mediaPath} (no .info.json found)`);
        continue;
      }

      try {
        const infoJson = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
        const tags = this.buildEnhancedMetadataTags(infoJson);
        const tempPath = `${mediaPath}.tagtmp${path.extname(mediaPath)}`;

        const ffmpegArgs = [
          "-y",
          "-v",
          "error",
          "-i",
          mediaPath,
          "-map",
          "0",
          "-c",
          "copy",
        ];

        for (const [key, value] of tags) {
          ffmpegArgs.push("-metadata", `${key}=${value}`);
        }

        ffmpegArgs.push(tempPath);

        const ffmpeg = spawnSync("ffmpeg", ffmpegArgs, { encoding: "utf-8" });
        const exitCode = ffmpeg.status ?? 1;
        const ffmpegError = ffmpeg.stderr || "";

        if (exitCode === 0 && fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, mediaPath);
          task.logs.push(`metadata: enhanced ID3 tags applied to ${mediaPath}`);
        } else {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          task.logs.push(
            `metadata: ffmpeg tagging failed for ${mediaPath}${
              ffmpegError ? ` (${ffmpegError.trim()})` : ""
            }`,
          );
        }
      } catch (error: any) {
        task.logs.push(
          `metadata: failed to process ${mediaPath} (${error?.message || "unknown error"})`,
        );
      }
    }
  }

  private getHistory(): HistoryEntry[] {
    const historyPath = this.getHistoryPath();
    if (!fs.existsSync(historyPath)) return [];
    try {
      const data = fs.readFileSync(historyPath, "utf-8");
      if (!data.trim()) return [];
      const history = JSON.parse(data);
      return Array.isArray(history) ? history : [];
    } catch (e) {
      console.error(
        `Error reading history.json at ${historyPath}. Moving to backup.`,
        e,
      );
      const backupPath = `${historyPath}.bak.${Date.now()}`;
      try {
        fs.renameSync(historyPath, backupPath);
      } catch (err) {
        console.error("Failed to move corrupted history file:", err);
      }
      return [];
    }
  }

  private addToHistory(url: string, format: string) {
    const history = this.getHistory();
    history.push({
      url,
      format,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(this.getHistoryPath(), JSON.stringify(history, null, 2));
  }

  private isAlreadyDownloaded(url: string, format: string): boolean {
    const history = this.getHistory();
    return history.some(
      (entry) => entry.url === url && entry.format === format,
    );
  }

  addTask(url: string, options: any) {
    const task: DownloadTask = {
      id: Math.random().toString(36).substring(7),
      url,
      options,
      status: "queued",
      progress: "0%",
      logs: [],
    };
    this.queue.push(task);
    this.processQueue();
    return task;
  }

  cancelTask(id: string) {
    if (this.activeTask?.id === id && this.activeProcess) {
      this.activeProcess.kill("SIGINT");
      this.activeTask.status = "cancelled";
      this.activeTask.progress = "Cancelled";
      return true;
    }
    const task = this.queue.find((t) => t.id === id);
    if (task && task.status === "queued") {
      task.status = "cancelled";
      task.progress = "Cancelled";
      return true;
    }
    return false;
  }

  removeTask(id: string) {
    if (this.activeTask?.id === id) {
      this.cancelTask(id);
    }
    const index = this.queue.findIndex((t) => t.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  getQueue(options: QueueResponseOptions = {}) {
    const includeAllCompleted = options.includeAllCompleted === true;
    const completedLimit =
      typeof options.completedLimit === "number" && options.completedLimit > 0
        ? Math.floor(options.completedLimit)
        : 20;

    const pending = this.queue.filter((t) => t.status === "queued");
    const completedAll = this.queue.filter(
      (t) =>
        t.status === "completed" ||
        t.status === "failed" ||
        t.status === "skipped" ||
        t.status === "cancelled",
    );

    return {
      active: this.activeTask,
      pending,
      completed: includeAllCompleted
        ? completedAll
        : completedAll.slice(-completedLimit),
      stats: {
        total: this.queue.length,
        queued: pending.length,
        completed: completedAll.length,
      },
    };
  }

  clearCompleted() {
    this.queue = this.queue.filter(
      (t) => t.status === "queued" || t.status === "downloading",
    );
  }

  private async processQueue() {
    if (this.activeTask || this.queue.length === 0) return;

    this.loadConfig(); // Refresh config

    const task = this.queue.find((t) => t.status === "queued");
    if (!task) return;

    const format = this.getFormatString(task.options);

    if (!task.options.force && this.isAlreadyDownloaded(task.url, format)) {
      task.status = "skipped";
      task.progress = "Already downloaded";
      this.processQueue();
      return;
    }

    this.activeTask = task;
    task.status = "downloading";
    task.logs = [];

    try {
      await this.runDownload(task);
      if (this.activeTask?.status !== "cancelled") {
        task.status = "completed";
        task.progress = "100%";
        this.addToHistory(task.url, format);
      }
    } catch (e: any) {
      if (this.activeTask?.status !== "cancelled") {
        task.status = "failed";
        task.error = e.message;
      }
    } finally {
      this.activeTask = null;
      this.activeProcess = null;
      this.processQueue();
    }
  }

  private getFormatString(options: any): string {
    if (options.audioOnly) {
      return `audio-${options.audioFormat || "best"}`;
    }
    if (options.maxResolution) {
      return `video-${options.maxResolution}`;
    }
    return options.format || "best";
  }

  private runDownload(task: DownloadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loadConfig(); // Refresh config in case it changed
      const config = this.config;

      let selectedLocation = null;
      if (task.options.locationName) {
        selectedLocation = config.allowed_locations.find(
          (loc: any) => loc.name === task.options.locationName,
        );
      }

      if (!selectedLocation && config.allowed_locations.length > 0) {
        selectedLocation = config.allowed_locations[0];
      }

      if (!selectedLocation) {
        return reject(
          new Error("No valid download location found in configuration"),
        );
      }

      const outputDir = selectedLocation.path;
      const beforeFiles = this.listFilesRecursive(outputDir);
      const args = [
        task.url,
        "--write-info-json",
        "--newline",
        "--remote-components",
        "ejs:github",
        "--js-runtimes",
        "deno",
      ];

      if (config.extra_args) {
        if (Array.isArray(config.extra_args)) {
          args.push(...config.extra_args);
        } else if (
          typeof config.extra_args === "string" &&
          config.extra_args.trim() !== ""
        ) {
          // Robustly split by space, ignoring multiple spaces
          args.push(...config.extra_args.trim().split(/\s+/));
        }
      }

      if (task.options.audioOnly) {
        args.push("--extract-audio");
        if (task.options.audioFormat) {
          args.push("--audio-format", task.options.audioFormat);
        }
      }

      if (task.options.sanitizeFilename) {
        args.push("--restrict-filenames");
      }

      // Format selection logic
      if (!task.options.audioOnly) {
        if (task.options.maxResolution) {
          args.push(
            "-f",
            `bestvideo[height<=?${task.options.maxResolution}]+bestaudio/best`,
          );
        } else if (task.options.format) {
          args.push("-f", task.options.format);
        } else {
          // Default to best video if neither resolution nor specific format is set
          // This overrides any global -f flags in extra_args that might be audio-only
          args.push("-f", "bestvideo+bestaudio/best");
        }
      } else if (task.options.format) {
        // If audioOnly but they specified a format (like bestaudio/best)
        args.push("-f", task.options.format);
      }

      if (task.options.embedMetadata) args.push("--embed-metadata");
      if (task.options.embedThumbnail) args.push("--embed-thumbnail");

      // Audiobookshelf podcast mode: write a separate thumbnail file so we can
      // promote it to cover.jpg in the show folder during post-processing.
      if (task.options.absMode) {
        args.push("--write-thumbnail", "--convert-thumbnails", "jpg");
      }

      let customName = "";
      if (task.options.outputNameMode === "custom_title") {
        customName = this.sanitizeFileNamePart(task.options.outputName || "");
      }

      if (task.options.absMode && task.options.audioOnly) {
        // ABS podcast library: flat folder per show — no season subfolders.
        // yt-dlp expands %(series,uploader,channel)s: tries series first, then
        // uploader, then channel so the folder name is always the show name.
        const showFolder = customName || "%(series,uploader,channel)s";
        args.push("--no-playlist");
        args.push(
          "-o",
          path.join(outputDir, `${showFolder}/%(title)s [%(id)s].%(ext)s`),
        );
      } else if (task.options.isPlaylist) {
        args.push("--yes-playlist");
        args.push(
          "-o",
          path.join(
            outputDir,
            customName
              ? `${customName}/%(playlist_index)s - %(title)s [%(id)s].%(ext)s`
              : task.options.filename ||
                  "%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s",
          ),
        );
      } else {
        args.push("--no-playlist");
        args.push(
          "-o",
          path.join(
            outputDir,
            customName
              ? `${customName} [%(id)s].%(ext)s`
              : task.options.filename || "%(title)s.%(ext)s",
          ),
        );
      }

      const process = spawn(config.yt_dlp_path || "yt-dlp", args);
      this.activeProcess = process;

      process.stdout.on("data", (data: Buffer) => {
        const line = data.toString();
        task.logs.push(line);
        if (task.logs.length > 500) task.logs.shift(); // Keep logs manageable

        // Simple progress extraction: [download]  10.5% of 100.00MiB at 1.50MiB/s ETA 01:00
        const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
        if (match) {
          task.progress = match[1] + "%";
        }
      });

      process.stderr.on("data", (data: Buffer) => {
        const line = data.toString();
        task.logs.push(`stderr: ${line}`);
        if (task.logs.length > 500) task.logs.shift();
        console.error(`yt-dlp stderr: ${line}`);
      });

      process.on("close", (code: number | null) => {
        this.activeProcess = null;
        if (task.status === "cancelled") {
          resolve();
          return;
        }

        if (code === 0) {
          this.applyEnhancedAudioMetadata(task, outputDir, beforeFiles);
          resolve();
          return;
        }

        reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
  }
}

export const queueManager = new QueueManager();
