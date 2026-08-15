import { spawn, spawnSync } from "child_process";
import { randomUUID } from "crypto";
import type { Buffer } from "buffer";
import path from "path";
import fs from "fs";

export interface DownloadTask {
  id: string;
  url: string;
  options: any;
  feedId?: string;
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
  /** Absolute path of the media file produced by the download. */
  outputPath?: string;
  /** Absolute paths of every media file produced by the download. */
  outputFiles?: string[];
}

export interface HistoryEntry {
  url: string;
  format: string;
  timestamp: string;
}

interface AudioProbeResult {
  bitrateKbps: number;
  codec?: string;
  ext?: string;
}

interface QueueResponseOptions {
  includeAllCompleted?: boolean;
  completedLimit?: number;
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".opus",
  ".ogg",
  ".oga",
  ".wav",
  ".flac",
  ".mka",
  ".webm",
  ".mp4",
]);

class QueueManager {
  private queue: DownloadTask[] = [];
  private activeTasks: Map<string, { task: DownloadTask; process: any }> =
    new Map();
  private maxConcurrent: number = 1;
  private config: any = null;

  constructor() {
    this.loadConfig();
    if (!fs.existsSync(this.getHistoryPath())) {
      fs.writeFileSync(this.getHistoryPath(), JSON.stringify([]));
    }
  }

  setMaxConcurrent(n: number) {
    this.maxConcurrent = Math.max(1, n);
    this.processQueue();
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
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

  private parseBitrateKbps(value: unknown): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    return Math.round(numericValue);
  }

  private getSelectedAudioProbe(infoJson: any): AudioProbeResult | null {
    const candidates = [
      ...(Array.isArray(infoJson?.requested_downloads)
        ? infoJson.requested_downloads
        : []),
      ...(Array.isArray(infoJson?.requested_formats)
        ? infoJson.requested_formats
        : []),
      infoJson,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;

      const isAudioOnly =
        candidate.vcodec === "none" ||
        (!candidate.vcodec &&
          typeof candidate.acodec === "string" &&
          candidate.acodec !== "none");

      if (!isAudioOnly) continue;

      const bitrateKbps =
        this.parseBitrateKbps(candidate.abr) ??
        this.parseBitrateKbps(candidate.tbr);

      if (!bitrateKbps) continue;

      return {
        bitrateKbps,
        codec:
          typeof candidate.acodec === "string" ? candidate.acodec : undefined,
        ext: typeof candidate.ext === "string" ? candidate.ext : undefined,
      };
    }

    return null;
  }

  private resolveLossyAudioQuality(
    task: DownloadTask,
    ytDlpPath: string,
    baseArgs: string[],
  ): string | null {
    const targetFormat = String(task.options.audioFormat || "").toLowerCase();
    const lossyFormats = new Set(["aac", "m4a", "mp3", "opus", "vorbis"]);

    if (!lossyFormats.has(targetFormat)) {
      return null;
    }

    const probeArgs = [
      ...baseArgs,
      "--simulate",
      "--skip-download",
      "--dump-single-json",
      "--no-warnings",
    ];

    const probe = spawnSync(ytDlpPath, probeArgs, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });

    if (probe.status !== 0) {
      const message =
        probe.stderr?.trim() || probe.stdout?.trim() || "unknown error";
      task.logs.push(`audio: bitrate probe failed (${message})`);
      return null;
    }

    const probeOutput = probe.stdout?.trim();
    if (!probeOutput) {
      task.logs.push("audio: bitrate probe returned no JSON output");
      return null;
    }

    try {
      const infoJson = JSON.parse(probeOutput);
      const selectedAudio = this.getSelectedAudioProbe(infoJson);
      if (!selectedAudio) {
        task.logs.push(
          "audio: source bitrate unavailable; using yt-dlp default quality",
        );
        return null;
      }

      task.logs.push(
        `audio: capping ${targetFormat} transcode to source bitrate ${selectedAudio.bitrateKbps}K${
          selectedAudio.codec || selectedAudio.ext
            ? ` (${selectedAudio.codec || selectedAudio.ext})`
            : ""
        }`,
      );

      return `${selectedAudio.bitrateKbps}K`;
    } catch (error: any) {
      task.logs.push(
        `audio: failed to parse bitrate probe (${error?.message || "invalid JSON"})`,
      );
      return null;
    }
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

  private recordOutputFiles(
    task: DownloadTask,
    outputDir: string,
    beforeFiles: string[],
  ): void {
    const afterFiles = this.listFilesRecursive(outputDir);
    const beforeSet = new Set(beforeFiles);
    const newFiles = afterFiles.filter((file) => !beforeSet.has(file));

    // yt-dlp logs the destination path for every file it writes. This is
    // reliable even when a file already existed (overwrite case), which the
    // "new files only" comparison above cannot detect.
    const logDestinations: string[] = [];
    for (const line of task.logs) {
      const destMatch = line.match(/Destination:\s+(.+)/);
      const skipMatch = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/);
      const mergeMatch = line.match(/Merging formats into "(.+)"/);
      const pathMatch = destMatch || skipMatch || mergeMatch;
      if (pathMatch && pathMatch[1].trim()) logDestinations.push(pathMatch[1].trim());
    }

    const candidates = new Set<string>([...newFiles, ...logDestinations]);
    const mediaFiles: string[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const resolved = path.isAbsolute(candidate)
        ? candidate
        : path.join(outputDir, candidate);
      const resolvedReal = fs.existsSync(resolved)
        ? fs.realpathSync(resolved)
        : resolved;

      // Direct match: the written file is itself a media file.
      if (fs.existsSync(resolvedReal) && AUDIO_EXTENSIONS.has(path.extname(resolvedReal).toLowerCase()) && !seen.has(resolvedReal)) {
        seen.add(resolvedReal);
        mediaFiles.push(resolvedReal);
        continue;
      }

      // Transcode case: yt-dlp logged the intermediate container but then
      // converted to a different extension (e.g. .webm -> .mp3). Look for a
      // sibling audio file with the same base name.
      const dir = path.dirname(resolved);
      const base = path.basename(resolved, path.extname(resolved));
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          const candidatePath = path.join(dir, name);
          const ext = path.extname(name).toLowerCase();
          if (
            path.basename(name, ext) === base &&
            AUDIO_EXTENSIONS.has(ext) &&
            !seen.has(candidatePath)
          ) {
            seen.add(candidatePath);
            mediaFiles.push(candidatePath);
          }
        }
      }
    }

    if (mediaFiles.length > 0) {
      task.outputFiles = mediaFiles;
      task.outputPath = mediaFiles[0];
      task.logs.push(`output: ${mediaFiles.join(", ")}`);
    }
  }

  private applyEnhancedAudioMetadata(
    task: DownloadTask,
    outputDir: string,
    beforeFiles: string[],
  ): void {    if (!task.options.audioOnly || !task.options.embedMetadata) return;
    if (task.options.enhancedAudioMetadata === false) return;

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
        const isMp4Container = [".m4a", ".mp4", ".m4v", ".mov"].includes(
          path.extname(mediaPath).toLowerCase(),
        );

        const buildArgs = (mapStream: string): string[] => {
          const ffmpegArgs = [
            "-y",
            "-v",
            "error",
            "-i",
            mediaPath,
            "-map",
            mapStream,
            "-c",
            "copy",
          ];
          for (const [key, value] of tags) {
            ffmpegArgs.push("-metadata", `${key}=${value}`);
          }
          ffmpegArgs.push(tempPath);
          return ffmpegArgs;
        };

        let ffmpeg = spawnSync("ffmpeg", buildArgs("0"), {
          encoding: "utf-8",
        });
        let exitCode = ffmpeg.status ?? 1;
        let ffmpegError = ffmpeg.stderr || "";

        if ((exitCode !== 0 || !fs.existsSync(tempPath)) && isMp4Container) {
          // Some ffmpeg builds can't remux the embedded chapter text track
          // with -c copy into an MP4; retry tagging just the audio stream so
          // the enhanced tags still get applied.
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          task.logs.push(
            `metadata: MP4 remux failed, retrying with audio stream only`,
          );
          ffmpeg = spawnSync("ffmpeg", buildArgs("0:a"), {
            encoding: "utf-8",
          });
          exitCode = ffmpeg.status ?? 1;
          ffmpegError = ffmpeg.stderr || "";
        }

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
    // Prune history to last 10000 entries to prevent unbounded growth
    const maxHistory = 10000;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
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
      id: randomUUID(),
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

  addPodcastTasks(
    urls: string[],
    options: any,
    feedId: string,
  ): DownloadTask[] {
    const tasks: DownloadTask[] = [];
    for (const url of urls) {
      const task: DownloadTask = {
        id: randomUUID(),
        url,
        options: { ...options },
        feedId,
        status: "queued",
        progress: "0%",
        logs: [],
      };
      this.queue.push(task);
      tasks.push(task);
    }
    this.processQueue();
    return tasks;
  }

  getTasksByFeedId(feedId: string): DownloadTask[] {
    const active = Array.from(this.activeTasks.values())
      .filter((a) => a.task.feedId === feedId)
      .map((a) => a.task);
    const queued = this.queue.filter(
      (t) => t.feedId === feedId && t.status === "queued",
    );
    return [...active, ...queued];
  }

  cancelTask(id: string) {
    const active = this.activeTasks.get(id);
    if (active) {
      active.process.kill("SIGINT");
      active.task.status = "cancelled";
      active.task.progress = "Cancelled";
      this.activeTasks.delete(id);
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
    if (this.activeTasks.has(id)) {
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

    const sanitizeTask = (task: DownloadTask) => ({
      ...task,
      options: this.sanitizeOptionsForDisplay(task.options),
    });

    const activeTasks = Array.from(this.activeTasks.values()).map(
      (a) => sanitizeTask(a.task),
    );

    return {
      active: activeTasks.length > 0 ? activeTasks[0] : null,
      activeTasks: activeTasks,
      pending: pending.map(sanitizeTask),
      completed: includeAllCompleted
        ? completedAll.map(sanitizeTask)
        : completedAll.slice(-completedLimit).map(sanitizeTask),
      stats: {
        total: this.queue.length,
        queued: pending.length,
        completed: completedAll.length,
        active: activeTasks.length,
        maxConcurrent: this.maxConcurrent,
      },
    };
  }

  private sanitizeOptionsForDisplay(options: any) {
    if (!options) return options;
    const sanitized = { ...options };
    // Remove credentials from display — never expose in API responses
    delete sanitized.password;
    delete sanitized.username;
    return sanitized;
  }

  clearCompleted() {
    this.queue = this.queue.filter(
      (t) => t.status === "queued" || t.status === "downloading",
    );
  }

  private async processQueue() {
    while (this.activeTasks.size < this.maxConcurrent) {
      this.loadConfig();

      const task = this.queue.find((t) => t.status === "queued");
      if (!task) break;

      const format = this.getFormatString(task.options);

      if (!task.options.force && this.isAlreadyDownloaded(task.url, format)) {
        task.status = "skipped";
        task.progress = "Already downloaded";
        continue;
      }

      task.status = "downloading";
      task.logs = [];
      this.activeTasks.set(task.id, { task, process: null });

      this.runDownload(task)
        .then(() => {
          const active = this.activeTasks.get(task.id);
          if (active && task.status !== "cancelled") {
            task.status = "completed";
            task.progress = "100%";
            this.addToHistory(task.url, format);

            // Auto-process for podcast feeds
            if (task.feedId) {
              this.autoProcessFeed(task.feedId);
            }
          }
        })
        .catch((e: any) => {
          const active = this.activeTasks.get(task.id);
          if (active && task.status !== "cancelled") {
            task.status = "failed";
            task.error = e.message;
          }
        })
        .finally(() => {
          this.activeTasks.delete(task.id);
          this.processQueue();
        });
    }
  }

  private async autoProcessFeed(feedId: string) {
    try {
      // Dynamic import to avoid circular dependency
      const { podcastFeedManager } = await import("./podcast_feeds");
      const { processFeedFiles, findCompletedUrls } = await import("./podcast_processor");

      const feed = podcastFeedManager.getFeed(feedId);
      if (!feed || !feed.autoProcess) return;

      // Extract URLs from .info.json before processing (processor deletes them)
      const searchDir = feed.processingDir || feed.destinationDir;
      let preProcessUrls: string[] = [];
      if (feed.urlListPath) {
        const completedUrls = findCompletedUrls(searchDir);
        preProcessUrls = Array.from(completedUrls);
      }

      processFeedFiles(feed);

      // Mark completed URLs
      if (feed.urlListPath && preProcessUrls.length > 0) {
        podcastFeedManager.markUrlsDownloaded(feed.urlListPath, preProcessUrls);
      }
    } catch (e) {
      console.error(`Auto-process failed for feed ${feedId}:`, e);
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

  /**
   * Build a yt-dlp format string from a preset key and optional max resolution.
   * Resolution is always respected regardless of preset. Fallback chains ensure
   * the download doesn't fail when the preferred container/codec isn't available.
   */
  private buildFormatString(
    preset: string,
    maxResolution: string,
  ): string {
    const h = maxResolution ? `[height<=?${maxResolution}]` : "";

    switch (preset) {
      case "mp4_compatible":
        // Prefer H.264 in MP4 container with AAC audio, fallback to any MP4, then best
        return `bestvideo${h}[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo${h}[ext=mp4]+bestaudio/best`;
      case "webm_efficient":
        // Prefer VP9 in WebM container, fallback to any WebM, then best
        return `bestvideo${h}[ext=webm][vcodec^=vp9]+bestaudio[ext=webm]/bestvideo${h}+bestaudio/best`;
      case "mkv_best":
        // Any codec muxed into MKV — just pick best streams and let yt-dlp mux
        return `bestvideo${h}+bestaudio/best`;
      case "premuxed":
        // No muxing — pick the best single pre-muxed stream from the site
        return `best${h}/best`;
      case "auto":
      default:
        // Best streams, yt-dlp picks the container
        return `bestvideo${h}+bestaudio/best`;
    }
  }

  private runDownload(task: DownloadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loadConfig(); // Refresh config in case it changed
      const config = this.config;

      let selectedLocation = null;

      // Allow direct outputDir override (used by podcast feed downloads)
      let outputDir = "";
      if (task.options.outputDir) {
        outputDir = task.options.outputDir;
      } else {
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

        outputDir = selectedLocation.path;
      }
      const beforeFiles = this.listFilesRecursive(outputDir);
      const ytDlpPath = config.yt_dlp_path || "yt-dlp";
      const baseArgs = [
        task.url,
        "--newline",
        "--remote-components",
        "ejs:github",
        "--js-runtimes",
        "deno",
      ];

      if (config.extra_args) {
        if (Array.isArray(config.extra_args)) {
          baseArgs.push(...config.extra_args);
        } else if (
          typeof config.extra_args === "string" &&
          config.extra_args.trim() !== ""
        ) {
          // Robustly split by space, ignoring multiple spaces
          baseArgs.push(...config.extra_args.trim().split(/\s+/));
        }
      }

      const args = [...baseArgs, "--write-info-json"];

      // Cookie jar support
      const cookiesPath =
        task.options.cookiesPath || config.cookies_path || "";
      if (cookiesPath && fs.existsSync(cookiesPath)) {
        args.push("--cookies", cookiesPath);
      }

      // Username/password support (passed directly to yt-dlp, never logged)
      if (task.options.username) {
        args.push("--username", task.options.username);
      }
      if (task.options.password) {
        args.push("--password", task.options.password);
      }

      if (task.options.sanitizeFilename) {
        args.push("--restrict-filenames");
      }

      // Format selection logic
      if (!task.options.audioOnly) {
        args.push(
          "-f",
          this.buildFormatString(
            task.options.format || "auto",
            task.options.maxResolution || "",
          ),
        );
      } else if (task.options.format) {
        // If audioOnly but they specified a format (like bestaudio/best)
        args.push("-f", task.options.format);
      }

      if (task.options.audioOnly) {
        if (task.options.audioFormat) {
          // When targeting m4a without an explicit format, prefer a native
          // m4a stream (e.g. YouTube format 140) so yt-dlp doesn't needlessly
          // re-encode; the extract-audio postprocessor only converts when the
          // source isn't already m4a, which still guarantees .m4a output.
          if (task.options.audioFormat === "m4a" && !task.options.format) {
            args.push("-f", "bestaudio[ext=m4a]/bestaudio/best");
          }
          // Convert to the requested audio format
          args.push("--extract-audio");
          args.push("--audio-format", task.options.audioFormat);

          const audioQuality = this.resolveLossyAudioQuality(
            task,
            ytDlpPath,
            baseArgs,
          );
          if (audioQuality) {
            args.push("--audio-quality", audioQuality);
          }
        } else if (!task.options.format) {
          // No transcode requested: grab the best native audio-only stream
          // directly without ffmpeg conversion. Prefer m4a (AAC) when
          // available so the result is playable on streaming speakers
          // (Google Home/Cast) without any conversion.
          args.push("-f", "bestaudio[ext=m4a]/bestaudio/best");
        }
      }

      if (task.options.embedMetadata) args.push("--embed-metadata");

      // Thumbnail embedding only works in containers that support cover art
      // (mp3/mkv/ogg/flac/m4a). Audio-only streams frequently land in WebM,
      // where yt-dlp aborts the whole download with a postprocessor error, so
      // skip it and keep the download from being marked failed.
      if (task.options.embedThumbnail) {
        if (task.options.audioOnly) {
          task.logs.push(
            "thumbnail: skipped --embed-thumbnail for audio-only download",
          );
        } else {
          args.push("--embed-thumbnail");
        }
      }

      // Prevent overwriting existing files
      if (task.options.noOverwrites) args.push("--no-overwrites");

      // Subtitle embedding
      if (task.options.embedSubtitles) {
        args.push("--write-subs", "--embed-subs");
        if (task.options.subLanguage) {
          args.push("--sub-langs", task.options.subLanguage);
        }
      }

      // Chapter embedding
      if (task.options.embedChapters) args.push("--embed-chapters");

      let customName = "";
      if (task.options.outputNameMode === "custom_title") {
        customName = this.sanitizeFileNamePart(task.options.outputName || "");
      }

      if (task.options.absMode && task.options.audioOnly) {
        // ABS podcast library: files go directly into the destination directory.
        args.push("--no-playlist");
        args.push(
          "-o",
          path.join(outputDir, `%(title)s [%(id)s].%(ext)s`),
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

      const process = spawn(ytDlpPath, args);
      const activeEntry = this.activeTasks.get(task.id);
      if (activeEntry) activeEntry.process = process;

      process.stdout.on("data", (data: Buffer) => {
        const line = data.toString();
        task.logs.push(line);
        if (task.logs.length > 500) task.logs.shift(); // Keep logs manageable

        // Simple progress extraction: [download]  10.5% of 100.00MiB at 1.50MiB/s ETA 01:00
        // Also handle integer percentages like [download] 100%
        const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
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
        if (task.status === "cancelled") {
          resolve();
          return;
        }

        if (code === 0) {
          this.applyEnhancedAudioMetadata(task, outputDir, beforeFiles);
          this.recordOutputFiles(task, outputDir, beforeFiles);
          resolve();
          return;
        }

        reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
  }
}

export const queueManager = new QueueManager();
