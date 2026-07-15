import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";
import { queueManager } from "$lib/server/queue";

export async function POST({ params, request }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const selectedUrls: string[] | undefined = body.urls;

  if (!feed.urlListPath) {
    return json({ error: "No URL list configured for this feed" }, { status: 400 });
  }

  const content = podcastFeedManager.getUrlListContent(feed.urlListPath);
  if (!content) {
    return json({ error: "URL list file not found" }, { status: 404 });
  }

  let urls = podcastFeedManager.parseUrlList(content);
  if (selectedUrls && selectedUrls.length > 0) {
    urls = urls.filter((u) => selectedUrls.includes(u));
  }

  // Limit how many URLs to queue
  const limit = body.limit;
  if (typeof limit === "number" && limit > 0) {
    urls = urls.slice(0, limit);
  }

  if (urls.length === 0) {
    return json({ error: "No URLs to download" }, { status: 400 });
  }

  // Set concurrency on the queue manager
  queueManager.setMaxConcurrent(feed.concurrency);

  // Use processingDir for staging; if not set, fall back to destinationDir
  const downloadDir = feed.processingDir || feed.destinationDir;

  const downloadOptions = {
    audioOnly: feed.downloadOptions.audioOnly,
    audioFormat: feed.downloadOptions.audioFormat,
    embedMetadata: feed.downloadOptions.embedMetadata,
    enhancedAudioMetadata: feed.downloadOptions.enhancedAudioMetadata,
    embedThumbnail: feed.downloadOptions.embedThumbnail,
    absMode: feed.downloadOptions.absMode,
    sanitizeFilename: feed.downloadOptions.sanitizeFilename,
    locationName: undefined,
    outputDir: downloadDir,
    outputNameMode: "custom_title" as const,
    outputName: feed.name,
    force: body.force || false,
    noOverwrites: feed.downloadOptions.noOverwrites,
    advanced: true,
  };

  // Resolve cookies path from feed config or global config
  const cookiesPath = feed.downloadOptions.cookiesPath || "";
  if (cookiesPath) {
    (downloadOptions as any).cookiesPath = cookiesPath;
  }

  const tasks = queueManager.addPodcastTasks(urls, downloadOptions, feed.id);

  return json({
    message: `Queued ${tasks.length} downloads for ${feed.name}`,
    taskCount: tasks.length,
    concurrency: feed.concurrency,
  });
}
