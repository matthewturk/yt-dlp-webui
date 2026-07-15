import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";
import { processFeedFiles, findCompletedMediaUrls } from "$lib/server/podcast_processor";

export async function POST({ params }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  if (!feed.destinationDir) {
    return json({ error: "No destination directory configured" }, { status: 400 });
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
  if (feed.urlListPath) {
    const completedUrls = findCompletedMediaUrls(feed.destinationDir);
    if (completedUrls.size > 0) {
      urlsMarked = podcastFeedManager.markUrlsDownloaded(
        feed.urlListPath,
        Array.from(completedUrls),
      );
    }
  }

  return json({ results, summary, urlsMarked });
}
