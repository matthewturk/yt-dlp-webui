import { json } from "@sveltejs/kit";
import { queueManager } from "$lib/server/queue";
import { z } from "zod";

const DownloadSchema = z.object({
  urls: z.array(z.string().url()).or(
    z
      .string()
      .url()
      .transform((url) => [url])
  ),
  options: z.object({
    format: z.string().optional(),
    filename: z.string().optional(),
    locationName: z.string().optional(),
    isPlaylist: z.boolean().optional(),
    audioOnly: z.boolean().optional(),
    audioFormat: z.string().optional(),
    maxResolution: z.string().optional(),
    embedMetadata: z.boolean().optional(),
    embedThumbnail: z.boolean().optional(),
    advanced: z.boolean().optional(),
    force: z.boolean().optional(),
    alsoDownloadAudio: z.boolean().optional(),
  }),
});

export async function POST({ request }) {
  const body = await request.json();
  const result = DownloadSchema.safeParse(body);

  if (!result.success) {
    return json(
      { error: "Invalid request", details: result.error },
      { status: 400 }
    );
  }

  const { urls, options } = result.data;

  const tasks = [];
  for (const url of urls) {
    // Add primary task
    tasks.push(queueManager.addTask(url, options));

    // Add secondary audio task if requested (and primary wasn't already audio-only)
    if (options.alsoDownloadAudio && !options.audioOnly) {
      tasks.push(
        queueManager.addTask(url, {
          ...options,
          audioOnly: true,
          alsoDownloadAudio: false, // Prevent infinite recursion (not that it would happen here but good practice)
        })
      );
    }
  }

  return json({ message: `Added ${tasks.length} tasks to queue`, tasks });
}
