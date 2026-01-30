import { spawn } from "child_process";
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
          this.config.allowed_locations
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
        e
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
    task.logs = [];

    try {
      await this.runDownload(task);
      if (task.status !== "cancelled") {
        task.status = "completed";
        task.progress = "100%";
        this.addToHistory(task.url, format);
      }
    } catch (e: any) {
      if (task.status !== "cancelled") {
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
          (loc: any) => loc.name === task.options.locationName
        );
      }

      if (!selectedLocation && config.allowed_locations.length > 0) {
        selectedLocation = config.allowed_locations[0];
      }

      if (!selectedLocation) {
        return reject(
          new Error("No valid download location found in configuration")
        );
      }

      const outputDir = selectedLocation.path;
      const args = [
        task.url,
        "--write-info-json",
        "--newline",
        "--js-runtimes",
        "--remote-components ejs:github",
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

      // Format selection logic
      if (!task.options.audioOnly) {
        if (task.options.maxResolution) {
          args.push(
            "-f",
            `bestvideo[height<=?${task.options.maxResolution}]+bestaudio/best`
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
      this.activeProcess = process;

      process.stdout.on("data", (data) => {
        const line = data.toString();
        task.logs.push(line);
        if (task.logs.length > 500) task.logs.shift(); // Keep logs manageable

        // Simple progress extraction: [download]  10.5% of 100.00MiB at 1.50MiB/s ETA 01:00
        const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
        if (match) {
          task.progress = match[1] + "%";
        }
      });

      process.stderr.on("data", (data) => {
        const line = data.toString();
        task.logs.push(`stderr: ${line}`);
        if (task.logs.length > 500) task.logs.shift();
        console.error(`yt-dlp stderr: ${line}`);
      });

      process.on("close", (code) => {
        this.activeProcess = null;
        if (task.status === "cancelled") resolve();
        else if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });
  }
}

export const queueManager = new QueueManager();
