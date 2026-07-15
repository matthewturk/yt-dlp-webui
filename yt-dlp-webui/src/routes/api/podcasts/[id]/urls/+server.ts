import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

export async function GET({ params }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });
  if (!feed.urlListPath) return json({ content: "", path: "", urls: [], detailed: [] });
  const content = podcastFeedManager.getUrlListContent(feed.urlListPath);
  const urls = content ? podcastFeedManager.parseUrlList(content) : [];
  const detailed = content ? podcastFeedManager.parseUrlListDetailed(content) : [];
  return json({ content: content || "", path: feed.urlListPath, urls, detailed });
}

export async function PUT({ params, request }) {
  const feed = podcastFeedManager.getFeed(params.id);
  if (!feed) return json({ error: "Feed not found" }, { status: 404 });

  const body = await request.json();
  const urlPath = body.path || feed.urlListPath;

  if (!urlPath) {
    return json({ error: "No URL list path specified" }, { status: 400 });
  }

  if (body.content !== undefined) {
    podcastFeedManager.saveUrlListContent(urlPath, body.content);
  }

  if (urlPath !== feed.urlListPath) {
    podcastFeedManager.updateFeed(params.id, { urlListPath: urlPath });
  }

  return json({ ok: true, path: urlPath });
}
