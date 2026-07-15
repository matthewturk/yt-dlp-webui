import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

export async function GET({ params }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });
  return json({ feed });
}

export async function PUT({ params, request }) {
  const body = await request.json();
  const feed = podcastFeedManager.updateFeed(params.id, body);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });
  return json({ feed });
}

export async function DELETE({ params }) {
  const ok = podcastFeedManager.deleteFeed(params.id);
  if (!ok) return json({ error: "Feed not found" }, { status: 404 });
  return json({ ok: true });
}
