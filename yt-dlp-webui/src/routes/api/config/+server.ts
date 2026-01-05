import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    let configPath = path.resolve("webui_config.json");
    if (!fs.existsSync(configPath) && fs.existsSync("/app/webui_config.json")) {
      configPath = "/app/webui_config.json";
    }

    if (!fs.existsSync(configPath)) {
      return json({ locations: ["Default (local)"] });
    }

    const content = fs.readFileSync(configPath, "utf-8");
    if (!content.trim()) {
      return json({ locations: ["Default (local)"] });
    }

    const config = JSON.parse(content);

    // Only return names to the frontend
    const locations = (config.allowed_locations || []).map(
      (loc: { name: string }) => loc.name
    );

    if (locations.length === 0) {
      locations.push("Default (local)");
    }

    return json({ locations });
  } catch (e) {
    console.error("Config API Error:", e);
    return json({
      locations: ["Default (local)"],
      error: "Using fallback config",
    });
  }
}
