import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";
import { findCompletedMediaUrls } from "$lib/server/podcast_processor";

/**
 * POST /api/podcasts/:id/mark-downloaded
 *
 * Scans the destination directory for completed media files and marks
 * their corresponding URLs in the URL list file as downloaded (prepends `# `).
 * Non-destructive — comments preserve the original URLs.
 *
 * Body: { urls?: string[] } — optional specific URLs to mark.
 *       If omitted, scans the destination directory automatically.
 */
export async function POST({ params, request }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  if (!feed.urlListPath) {
    return json({ error: "No URL list configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  let urlsToMark: string[];

  if (body.urls && Array.isArray(body.urls) && body.urls.length > 0) {
    urlsToMark = body.urls;
  } else if (feed.destinationDir) {
    const completedUrls = findCompletedMediaUrls(feed.destinationDir);
    urlsToMark = Array.from(completedUrls);
  } else {
    return json({ error: "No destination directory or URLs specified" }, { status: 400 });
  }

  if (urlsToMark.length === 0) {
    return json({ marked: 0, message: "No completed downloads found" });
  }

  const marked = podcastFeedManager.markUrlsDownloaded(feed.urlListPath, urlsToMark);

  return json({
    marked,
    total: urlsToMark.length,
    message: `Marked ${marked} URL(s) as downloaded`,
  });
}
