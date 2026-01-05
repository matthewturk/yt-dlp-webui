import { json } from "@sveltejs/kit";
import { queueManager } from "$lib/server/queue";

export async function GET() {
  try {
    return json(queueManager.getQueue());
  } catch (e) {
    console.error("Queue API Error:", e);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}
