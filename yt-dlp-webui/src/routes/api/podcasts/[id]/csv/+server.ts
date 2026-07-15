import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

export async function GET({ params }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });
  if (!feed.csvPath) return json({ content: "", path: "" });
  const content = podcastFeedManager.getCsvContent(feed.csvPath);
  return json({ content: content || "", path: feed.csvPath });
}

export async function PUT({ params, request }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  const body = await request.json();
  const csvPath = body.path || feed.csvPath;

  if (!csvPath) {
    return json({ error: "No CSV path specified" }, { status: 400 });
  }

  if (body.content !== undefined) {
    podcastFeedManager.saveCsvContent(csvPath, body.content);
  }

  if (csvPath !== feed.csvPath) {
    podcastFeedManager.updateFeed(params.id, { csvPath });
  }

  return json({ ok: true, path: csvPath });
}
