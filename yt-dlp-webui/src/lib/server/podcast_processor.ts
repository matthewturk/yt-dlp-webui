import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import type { PodcastFeed } from "./podcast_feeds";

const CLEAN_PATTERN = /\s*\[Audio Only\]\s*/gi;

interface CsvEpisode {
  title: string;
  date: string;
  season: number;
  episode: number;
}

interface ProcessResult {
  file: string;
  status: "processed" | "skipped" | "error";
  message: string;
  newPath?: string;
}

function cleanString(s: string): string {
  if (!s) return "";
  return s.replace(CLEAN_PATTERN, "").trim();
}

function formatDate(dateStr: string): string {
  if (dateStr && dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr || "";
}

function parseCsvDate(dateStr: string): string | null {
  try {
    const months: Record<string, number> = {
      January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
      July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
    };
    const cleaned = dateStr.replace(/\xa0/g, " ").trim();
    const match = cleaned.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/,
    );
    if (match) {
      const month = months[match[1]];
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      const dt = new Date(year, month, day);
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString().split("T")[0];
    }
  } catch {}
  return null;
}

function loadCsvData(csvPath: string): CsvEpisode[] {
  const episodes: CsvEpisode[] = [];
  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) return episodes;

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    if (lines.length < 2) return episodes;

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const titleIdx = headers.indexOf("Title");
    const dateIdx = headers.indexOf("Original release date");
    const seasonIdx = headers.indexOf("Season");
    const episodeIdx = headers.indexOf("No. in season");

    if (titleIdx === -1) return episodes;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCsvLine(line);
      if (cols.length <= titleIdx) continue;

      const rawTitle = (cols[titleIdx] || "").replace(/^"+|"+$/g, "").trim();
      const date = (dateIdx >= 0 ? cols[dateIdx] || "" : "").replace(/\xa0/g, " ").trim();
      const season = seasonIdx >= 0 ? parseInt(cols[seasonIdx] || "1", 10) || 1 : 1;
      const episode = episodeIdx >= 0 ? parseInt(cols[episodeIdx] || "0", 10) || 0 : 0;

      episodes.push({ title: rawTitle, date, season, episode });
    }
  } catch (e) {
    console.error(`Error loading CSV ${csvPath}:`, e);
  }

  return episodes;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function similarity(a: string, b: string): number {
  if (a.toLowerCase() === b.toLowerCase()) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;

  const lenA = aLower.length;
  const lenB = bLower.length;
  const maxLen = Math.max(lenA, lenB);
  if (maxLen === 0) return 1;

  const matrix: number[][] = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0),
  );

  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const dist = matrix[lenA][lenB];
  return 1 - dist / maxLen;
}

function findMatchingEpisode(
  cleanTitle: string,
  csvEpisodes: CsvEpisode[],
): CsvEpisode | null {
  if (csvEpisodes.length === 0) return null;

  for (const ep of csvEpisodes) {
    if (ep.title.toLowerCase() === cleanTitle.toLowerCase()) return ep;
  }

  let bestMatch: CsvEpisode | null = null;
  let bestScore = 0;

  for (const ep of csvEpisodes) {
    const score = similarity(cleanTitle, ep.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ep;
    }
  }

  if (bestScore >= 0.85) return bestMatch;
  return null;
}

function buildFfmpegTags(
  infoJson: any,
  csvMatch: CsvEpisode | null,
  seasonNum: number,
): Array<[string, string]> {
  const rawTitle = cleanString(infoJson?.title || "");
  const uploader = cleanString(
    infoJson?.uploader || infoJson?.channel || infoJson?.artist || "",
  );
  const series = cleanString(
    infoJson?.series || infoJson?.album || uploader || "Unknown Podcast",
  );
  const description = infoJson?.description || "";
  const language = infoJson?.language || "en";

  let episodeNum = 0;
  let formattedDate = "";
  let title = rawTitle;

  if (csvMatch) {
    episodeNum = csvMatch.episode;
    title = csvMatch.title;
    const csvDate = parseCsvDate(csvMatch.date);
    if (csvDate) {
      formattedDate = csvDate;
    } else {
      formattedDate = formatDate(infoJson?.release_date || infoJson?.upload_date || "");
    }
  } else {
    episodeNum = infoJson?.episode_number || infoJson?.playlist_index || 0;
    formattedDate = formatDate(infoJson?.release_date || infoJson?.upload_date || "");
  }

  const tags: Array<[string, string]> = [
    ["title", title],
    ["album", series],
    ["album_sort", series],
    ["series", series],
    ["movement_name", series],
    ["artist", uploader],
    ["artist_sort", uploader],
    ["album_artist", uploader],
    ["album_artist_sort", uploader],
    ["disc", String(seasonNum)],
    ["track", String(episodeNum)],
    ["movement", String(episodeNum)],
    ["comment", description],
    ["description", description],
    ["lyrics", description],
    ["date", formattedDate],
    ["publisher", uploader],
    ["genre", "Podcast"],
    ["language", language],
    ["podcast", "1"],
  ];

  return tags.filter(([, value]) => value !== "");
}

function findMediaFile(infoPath: string, fileId: string): string | null {
  const dir = path.dirname(infoPath);
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f.endsWith(".info.json") || f.endsWith(".part") || f.endsWith(".ytdl") ||
        f.endsWith(".py") || f.endsWith(".txt")) continue;
    if (f.includes(`[${fileId}]`)) {
      return path.join(dir, f);
    }
  }
  return null;
}

export function processFeedFiles(
  feed: PodcastFeed,
): ProcessResult[] {
  const results: ProcessResult[] = [];
  const csvEpisodes = feed.csvPath ? loadCsvData(feed.csvPath) : [];

  const searchDir = feed.destinationDir;
  if (!fs.existsSync(searchDir)) {
    fs.mkdirSync(searchDir, { recursive: true });
  }

  const infoFiles: string[] = [];

  // Walk for .info.json files
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".info.json")) {
        infoFiles.push(full);
      }
    }
  };
  walk(searchDir);

  for (const infoPath of infoFiles) {
    try {
      const infoJson = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
      const fileId = infoJson.id;
      if (!fileId) {
        results.push({ file: infoPath, status: "skipped", message: "No ID in JSON" });
        continue;
      }

      const rawTitle = infoJson.title || "";
      const cleanTitle = cleanString(rawTitle);
      const seasonNum = infoJson.season_number ?? 1;
      const csvMatch = findMatchingEpisode(cleanTitle, csvEpisodes);

      const mediaFile = findMediaFile(infoPath, fileId);
      if (!mediaFile) {
        results.push({ file: infoPath, status: "skipped", message: "No media file found" });
        continue;
      }

      const ext = path.extname(mediaFile);
      const epNum = csvMatch
        ? csvMatch.episode
        : infoJson.episode_number || infoJson.playlist_index || 0;
      const title = csvMatch ? csvMatch.title : cleanTitle;
      const newBasename = `s${String(seasonNum).padStart(2, "0")}e${String(epNum).padStart(2, "0")} - ${title}`;
      const targetFilename = path.join(path.dirname(mediaFile), `${newBasename}${ext}`);
      const tempFilename = path.join(path.dirname(mediaFile), `temp_${newBasename}${ext}`);

      if (
        fs.existsSync(targetFilename) &&
        path.resolve(targetFilename) !== path.resolve(mediaFile)
      ) {
        results.push({ file: infoPath, status: "skipped", message: "Target already exists" });
        continue;
      }

      if (path.resolve(targetFilename) === path.resolve(mediaFile)) {
        results.push({ file: infoPath, status: "skipped", message: "Already correctly named" });
        continue;
      }

      const tags = buildFfmpegTags(infoJson, csvMatch, seasonNum);
      const ffmpegArgs = [
        "-y", "-v", "quiet", "-i", mediaFile,
        "-c", "copy",
      ];
      for (const [key, value] of tags) {
        ffmpegArgs.push("-metadata", `${key}=${value}`);
      }
      ffmpegArgs.push(tempFilename);

      const ffmpeg = spawnSync("ffmpeg", ffmpegArgs, { encoding: "utf-8" });
      if (ffmpeg.status === 0 && fs.existsSync(tempFilename)) {
        fs.unlinkSync(mediaFile);
        fs.unlinkSync(infoPath);
        fs.renameSync(tempFilename, targetFilename);
        results.push({
          file: infoPath,
          status: "processed",
          message: `Renamed to ${path.basename(targetFilename)}`,
          newPath: targetFilename,
        });
      } else {
        if (fs.existsSync(tempFilename)) fs.unlinkSync(tempFilename);
        results.push({
          file: infoPath,
          status: "error",
          message: `ffmpeg failed: ${ffmpeg.stderr?.trim() || "unknown error"}`,
        });
      }
    } catch (e: any) {
      results.push({
        file: infoPath,
        status: "error",
        message: e.message || "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Scan a destination directory for .info.json files and extract original URLs.
 * Used to determine which URLs from a list have been downloaded.
 * Returns a Set of URLs that have corresponding completed files.
 */
export function findCompletedUrls(destinationDir: string): Set<string> {
  const urls = new Set<string>();
  if (!fs.existsSync(destinationDir)) return urls;

  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".info.json")) {
          try {
            const data = JSON.parse(fs.readFileSync(full, "utf-8"));
            const url = data.webpage_url || data.url;
            if (url) urls.add(url);
          } catch {}
        }
      }
    } catch {}
  };

  walk(destinationDir);
  return urls;
}

/**
 * Scan a destination directory for completed media files (not .info.json, .part, etc.)
 * and return their original URLs by cross-referencing with .info.json files.
 * More reliable than findCompletedUrls because it checks that the actual media
 * file exists (download finished, not just info written).
 */
export function findCompletedMediaUrls(destinationDir: string): Set<string> {
  const urls = new Set<string>();
  if (!fs.existsSync(destinationDir)) return urls;

  const audioExtensions = new Set([
    ".mp3", ".m4a", ".opus", ".wav", ".ogg", ".flac", ".aac",
  ]);

  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".info.json")) {
          try {
            const data = JSON.parse(fs.readFileSync(full, "utf-8"));
            const url = data.webpage_url || data.url;
            if (!url) continue;

            // Check that a corresponding media file exists
            const dirPath = path.dirname(full);
            const fileId = data.id;
            if (fileId) {
              const hasMedia = fs.readdirSync(dirPath).some((f) => {
                if (f === entry.name) return false;
                if (f.endsWith(".part") || f.endsWith(".ytdl")) return false;
                const ext = path.extname(f).toLowerCase();
                if (!audioExtensions.has(ext)) return false;
                return f.includes(`[${fileId}]`);
              });
              if (hasMedia) urls.add(url);
            }
          } catch {}
        }
      }
    } catch {}
  };

  walk(destinationDir);
  return urls;
}
  feedId: string;
  feedName: string;
  totalUrls: number;
  downloadedCount: number;
  processedCount: number;
  failedCount: number;
  isDownloading: boolean;
  logs: string[];
}

const downloadStatuses = new Map<string, PodcastDownloadStatus>();

export function getDownloadStatus(feedId: string): PodcastDownloadStatus | undefined {
  return downloadStatuses.get(feedId);
}

export function setDownloadStatus(feedId: string, status: PodcastDownloadStatus) {
  downloadStatuses.set(feedId, status);
}

export function clearDownloadStatus(feedId: string) {
  downloadStatuses.delete(feedId);
}
