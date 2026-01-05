import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const configPath = path.resolve("webui_config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    // Only return names to the frontend
    const locations = config.allowed_locations.map(
      (loc: { name: string }) => loc.name
    );

    return json({ locations });
  } catch (e) {
    return json({ error: "Failed to load configuration" }, { status: 500 });
  }
}
