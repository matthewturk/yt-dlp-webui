import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export interface DownloadTask {
  id: string;
  url: string;
  options: any;
  status: "queued" | "downloading" | "completed" | "failed" | "skipped";
  progress: string;
  error?: string;
}

export interface HistoryEntry {
  url: string;
  format: string;
  timestamp: string;
}

class QueueManager {
  private queue: DownloadTask[] = [];
  private activeTask: DownloadTask | null = null;
  private config: any = null;

  constructor() {
    this.loadConfig();
    if (!fs.existsSync(this.getHistoryPath())) {
      fs.writeFileSync(this.getHistoryPath(), JSON.stringify([]));
    }
  }

  private loadConfig() {
    const configPath = path.resolve("config.json");
    if (fs.existsSync(configPath)) {
      this.config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
      this.config = {
        yt_dlp_path: "yt-dlp",
        allowed_locations: [{ name: "Default", path: "downloads" }],
        history_path: "history.json",
        extra_args: [],
      };
    }
  }

  private getHistoryPath() {
    return path.resolve(this.config.history_path || "history.json");
  }

  private getHistory(): HistoryEntry[] {
    try {
      return JSON.parse(fs.readFileSync(this.getHistoryPath(), "utf-8"));
    } catch (e) {
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
      (entry) => entry.url === url && entry.format === format
    );
  }

  addTask(url: string, options: any) {
    const task: DownloadTask = {
      id: Math.random().toString(36).substring(7),
      url,
      options,
      status: "queued",
      progress: "0%",
    };
    this.queue.push(task);
    this.processQueue();
    return task;
  }

  getQueue() {
    return {
      active: this.activeTask,
      pending: this.queue.filter((t) => t.status === "queued"),
      completed: this.queue
        .filter(
          (t) =>
            t.status === "completed" ||
            t.status === "failed" ||
            t.status === "skipped"
        )
        .slice(-20),
    };
  }

  clearCompleted() {
    this.queue = this.queue.filter(
      (t) => t.status === "queued" || t.status === "downloading"
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

    try {
      await this.runDownload(task);
      task.status = "completed";
      task.progress = "100%";
      this.addToHistory(task.url, format);
    } catch (e: any) {
      task.status = "failed";
      task.error = e.message;
    } finally {
      this.activeTask = null;
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

      const selectedLocation = task.options.locationName
        ? config.allowed_locations.find(
            (loc: any) => loc.name === task.options.locationName
          )
        : config.allowed_locations[0];

      const outputDir = selectedLocation.path;
      const args = [task.url, "--write-info-json", "--newline"];

      if (config.extra_args && Array.isArray(config.extra_args)) {
        args.push(...config.extra_args);
      }

      if (task.options.audioOnly) {
        args.push("--extract-audio");
        if (task.options.audioFormat) {
          args.push("--audio-format", task.options.audioFormat);
        }
      }

      if (task.options.maxResolution && !task.options.audioOnly) {
        args.push(
          "-f",
          `bestvideo[height<=?${task.options.maxResolution}]+bestaudio/best`
        );
      } else if (task.options.format) {
        args.push("-f", task.options.format);
      }

      if (task.options.embedMetadata) args.push("--embed-metadata");
      if (task.options.embedThumbnail) args.push("--embed-thumbnail");

      if (task.options.isPlaylist) {
        args.push("--yes-playlist");
        args.push(
          "-o",
          path.join(
            outputDir,
            task.options.filename ||
              "%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s"
          )
        );
      } else {
        args.push("--no-playlist");
        args.push(
          "-o",
          path.join(outputDir, task.options.filename || "%(title)s.%(ext)s")
        );
      }

      const process = spawn(config.yt_dlp_path || "yt-dlp", args);

      process.stdout.on("data", (data) => {
        const line = data.toString();
        // Simple progress extraction: [download]  10.5% of 100.00MiB at 1.50MiB/s ETA 01:00
        const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
        if (match) {
          task.progress = match[1] + "%";
        }
      });

      process.stderr.on("data", (data) => {
        console.error(`yt-dlp stderr: ${data}`);
      });

      process.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
  }
}

export const queueManager = new QueueManager();
