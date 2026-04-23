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

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const includeAllCompleted = body?.includeAllCompleted === true;
    const completedLimit =
      typeof body?.completedLimit === "number" ? body.completedLimit : 20;

    return json(queueManager.getQueue({ includeAllCompleted, completedLimit }));
  } catch (e) {
    console.error("Queue API Error:", e);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}
