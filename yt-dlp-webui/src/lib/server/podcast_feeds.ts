import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface PodcastFeedDownloadOptions {
  audioOnly: boolean;
  audioFormat: string;
  embedMetadata: boolean;
  enhancedAudioMetadata: boolean;
  embedThumbnail: boolean;
  absMode: boolean;
  sanitizeFilename: boolean;
  noOverwrites: boolean;
  cookiesPath: string;
  extraArgs: string;
}

export interface PodcastFeed {
  id: string;
  name: string;
  csvPath: string;
  urlListPath: string;
  destinationDir: string;
  concurrency: number;
  downloadOptions: PodcastFeedDownloadOptions;
  autoProcess: boolean;
  autoFile: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PodcastFeedsConfig {
  podcast_scan_dirs: string[];
  podcast_feeds_path: string;
}

export interface DiscoveredFile {
  name: string;
  path: string;
  type: "csv" | "urls" | "unknown";
  size: number;
  lastModified: string;
}

const DEFAULT_DOWNLOAD_OPTIONS: PodcastFeedDownloadOptions = {
  audioOnly: true,
  audioFormat: "m4a",
  embedMetadata: true,
  enhancedAudioMetadata: true,
  embedThumbnail: true,
  absMode: true,
  sanitizeFilename: true,
  noOverwrites: true,
  cookiesPath: "",
  extraArgs: "",
};

class PodcastFeedManager {
  private feeds: PodcastFeed[] = [];
  private feedsPath: string = "podcast_feeds.json";
  private scanDirs: string[] = [];

  constructor() {
    this.loadConfig();
    this.loadFeeds();
  }

  private loadConfig() {
    const configPath = path.resolve("webui_config.json");
    const defaultConfig: PodcastFeedsConfig = {
      podcast_scan_dirs: [],
      podcast_feeds_path: "podcast_feeds.json",
    };

    if (fs.existsSync(configPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        this.scanDirs = data.podcast_scan_dirs || defaultConfig.podcast_scan_dirs;
        this.feedsPath = data.podcast_feeds_path || defaultConfig.podcast_feeds_path;
      } catch (e) {
        console.error("Error reading config for podcast feeds:", e);
        this.scanDirs = defaultConfig.podcast_scan_dirs;
      }
    }
  }

  private loadFeeds() {
    const fullPath = path.resolve(this.feedsPath);
    if (fs.existsSync(fullPath)) {
      try {
        this.feeds = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      } catch (e) {
        console.error("Error loading podcast feeds:", e);
        this.feeds = [];
      }
    }
  }

  private saveFeeds() {
    const fullPath = path.resolve(this.feedsPath);
    fs.writeFileSync(fullPath, JSON.stringify(this.feeds, null, 2), "utf-8");
  }

  listFeeds(): PodcastFeed[] {
    return this.feeds;
  }

  getFeed(id: string): PodcastFeed | undefined {
    return this.feeds.find((f) => f.id === id);
  }

  createFeed(
    data: Omit<PodcastFeed, "id" | "createdAt" | "updatedAt">,
  ): PodcastFeed {
    const feed: PodcastFeed = {
      ...data,
      id: randomUUID(),
      downloadOptions: { ...DEFAULT_DOWNLOAD_OPTIONS, ...data.downloadOptions },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.feeds.push(feed);
    this.saveFeeds();
    return feed;
  }

  updateFeed(id: string, data: Partial<PodcastFeed>): PodcastFeed | null {
    const index = this.feeds.findIndex((f) => f.id === id);
    if (index === -1) return null;

    this.feeds[index] = {
      ...this.feeds[index],
      ...data,
      id: this.feeds[index].id,
      createdAt: this.feeds[index].createdAt,
      updatedAt: new Date().toISOString(),
    };
    if (data.downloadOptions) {
      this.feeds[index].downloadOptions = {
        ...DEFAULT_DOWNLOAD_OPTIONS,
        ...data.downloadOptions,
      };
    }
    this.saveFeeds();
    return this.feeds[index];
  }

  deleteFeed(id: string): boolean {
    const index = this.feeds.findIndex((f) => f.id === id);
    if (index === -1) return false;
    this.feeds.splice(index, 1);
    this.saveFeeds();
    return true;
  }

  getCsvContent(csvPath: string): string | null {
    const resolved = path.resolve(csvPath);
    if (!fs.existsSync(resolved)) return null;
    return fs.readFileSync(resolved, "utf-8");
  }

  saveCsvContent(csvPath: string, content: string): void {
    const resolved = path.resolve(csvPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
  }

  getUrlListContent(urlPath: string): string | null {
    const resolved = path.resolve(urlPath);
    if (!fs.existsSync(resolved)) return null;
    return fs.readFileSync(resolved, "utf-8");
  }

  saveUrlListContent(urlPath: string, content: string): void {
    const resolved = path.resolve(urlPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
  }

  parseUrlList(content: string): string[] {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  }

  /**
   * Parse URL list into lines preserving structure (for display/editing).
   * Returns lines with a `downloaded` flag based on `# ` prefix.
   */
  parseUrlListDetailed(
    content: string,
  ): Array<{ line: string; url: string; downloaded: boolean }> {
    return content
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("# ")) {
          const url = trimmed.slice(2).trim();
          return { line, url, downloaded: url.length > 0 && !url.startsWith("[") };
        }
        if (trimmed.startsWith("#")) {
          return { line, url: "", downloaded: false };
        }
        return { line, url: trimmed, downloaded: false };
      });
  }

  /**
   * Mark a single URL as downloaded in the URL list file.
   * Prepends `# ` to the line containing the URL. Non-destructive.
   */
  markUrlDownloaded(urlListPath: string, url: string): boolean {
    const resolved = path.resolve(urlListPath);
    if (!fs.existsSync(resolved)) return false;

    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === url && !trimmed.startsWith("#")) {
        lines[i] = `# ${lines[i].trimEnd()}`;
        found = true;
        break;
      }
    }

    if (found) {
      fs.writeFileSync(resolved, lines.join("\n"), "utf-8");
    }
    return found;
  }

  /**
   * Mark multiple URLs as downloaded. Returns count of newly marked.
   */
  markUrlsDownloaded(urlListPath: string, urls: string[]): number {
    const resolved = path.resolve(urlListPath);
    if (!fs.existsSync(resolved)) return 0;

    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    const urlSet = new Set(urls);
    let marked = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (urlSet.has(trimmed) && !trimmed.startsWith("#")) {
        lines[i] = `# ${lines[i].trimEnd()}`;
        urlSet.delete(trimmed);
        marked++;
      }
    }

    if (marked > 0) {
      fs.writeFileSync(resolved, lines.join("\n"), "utf-8");
    }
    return marked;
  }

  scanDirectories(): DiscoveredFile[] {
    const results: DiscoveredFile[] = [];
    const seen = new Set<string>();

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (
            entry.name.endsWith(".csv") ||
            entry.name.endsWith(".txt")
          ) {
            if (seen.has(fullPath)) continue;
            seen.add(fullPath);

            const stat = fs.statSync(fullPath);
            let type: "csv" | "urls" | "unknown" = "unknown";
            if (entry.name.endsWith(".csv")) type = "csv";
            else if (entry.name.endsWith(".txt")) type = "urls";

            results.push({
              name: entry.name,
              path: fullPath,
              type,
              size: stat.size,
              lastModified: stat.mtime.toISOString(),
            });
          }
        }
      } catch (e) {
        console.error(`Error scanning ${dir}:`, e);
      }
    };

    for (const dir of this.scanDirs) {
      scanDir(dir);
    }

    return results;
  }

  getScanDirs(): string[] {
    return this.scanDirs;
  }

  addScanDir(dir: string): void {
    if (!this.scanDirs.includes(dir)) {
      this.scanDirs.push(dir);
      this.saveConfig();
    }
  }

  removeScanDir(dir: string): boolean {
    const index = this.scanDirs.indexOf(dir);
    if (index === -1) return false;
    this.scanDirs.splice(index, 1);
    this.saveConfig();
    return true;
  }

  private saveConfig() {
    const configPath = path.resolve("webui_config.json");
    let config: any = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {}
    }
    config.podcast_scan_dirs = this.scanDirs;
    config.podcast_feeds_path = this.feedsPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  }
}

export const podcastFeedManager = new PodcastFeedManager();
