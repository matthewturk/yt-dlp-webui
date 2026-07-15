import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

export async function GET() {
  try {
    const feeds = podcastFeedManager.listFeeds();
    return json({ feeds });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const feed = podcastFeedManager.createFeed({
      name: body.name || "New Feed",
      csvPath: body.csvPath || "",
      urlListPath: body.urlListPath || "",
      destinationDir: body.destinationDir || "",
      concurrency: body.concurrency || 2,
      downloadOptions: body.downloadOptions || {},
      autoProcess: body.autoProcess !== false,
      autoFile: body.autoFile !== false,
    });
    return json({ feed });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
}
