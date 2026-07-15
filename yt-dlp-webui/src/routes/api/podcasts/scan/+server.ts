import { json } from "@sveltejs/kit";
import { podcastFeedManager } from "$lib/server/podcast_feeds";

export async function GET() {
  try {
    const files = podcastFeedManager.scanDirectories();
    const scanDirs = podcastFeedManager.getScanDirs();
    return json({ files, scanDirs });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    if (body.action === "add" && body.dir) {
      podcastFeedManager.addScanDir(body.dir);
      return json({ ok: true, scanDirs: podcastFeedManager.getScanDirs() });
    }
    if (body.action === "remove" && body.dir) {
      podcastFeedManager.removeScanDir(body.dir);
      return json({ ok: true, scanDirs: podcastFeedManager.getScanDirs() });
    }
    return json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
}
