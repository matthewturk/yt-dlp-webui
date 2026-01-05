import { json } from "@sveltejs/kit";
import { queueManager } from "$lib/server/queue";

export async function POST() {
  queueManager.clearCompleted();
  return json({ success: true });
}
