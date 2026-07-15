import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";
import { processFeedFiles, findCompletedUrls } from "$lib/server/podcast_processor";

export async function POST({ params }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  if (!feed.destinationDir) {
    return json({ error: "No destination directory configured" }, { status: 400 });
  }

  // Extract URLs from .info.json BEFORE processing (processor deletes them)
  const searchDir = feed.processingDir || feed.destinationDir;
  let preProcessUrls: string[] = [];
  if (feed.urlListPath) {
    const completedUrls = findCompletedUrls(searchDir);
    preProcessUrls = Array.from(completedUrls);
  }

  const results = processFeedFiles(feed);

  const summary = {
    total: results.length,
    processed: results.filter((r) => r.status === "processed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  // Mark completed URLs in the URL list file
  let urlsMarked = 0;
  if (feed.urlListPath && preProcessUrls.length > 0) {
    urlsMarked = podcastFeedManager.markUrlsDownloaded(
      feed.urlListPath,
      preProcessUrls,
    );
  }

  return json({ results, summary, urlsMarked });
}
