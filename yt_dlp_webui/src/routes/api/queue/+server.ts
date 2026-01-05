import { json } from "@sveltejs/kit";
import { queueManager } from "$lib/server/queue";

export async function GET() {
  return json(queueManager.getQueue());
}
