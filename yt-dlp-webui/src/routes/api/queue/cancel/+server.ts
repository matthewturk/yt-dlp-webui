import { json } from "@sveltejs/kit";
import { queueManager } from "$lib/server/queue";

export async function POST({ request }) {
  const { id } = await request.json();
  if (!id) return json({ error: "Missing task ID" }, { status: 400 });

  const success = queueManager.cancelTask(id);
  return json({ success });
}
