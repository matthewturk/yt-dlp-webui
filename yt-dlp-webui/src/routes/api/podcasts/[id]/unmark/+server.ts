import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

/**
 * POST /api/podcasts/:id/unmark
 *
 * Unmark a URL as downloaded (removes the "# " prefix), allowing it to be re-downloaded.
 *
 * Body: { url: string }
 */
export async function POST({ params, request }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  if (!feed.urlListPath) {
    return json({ error: "No URL list configured" }, { status: 400 });
  }

  const body = await request.json();
  if (!body.url) {
    return json({ error: "No URL specified" }, { status: 400 });
  }

  const found = podcastFeedManager.unmarkUrlDownloaded(feed.urlListPath, body.url);

  if (!found) {
    return json({ error: "URL not found or not marked" }, { status: 404 });
  }

  return json({ ok: true, message: "URL unmarked — ready for re-download" });
}
