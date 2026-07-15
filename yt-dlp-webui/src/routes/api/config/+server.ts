import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";

function listImmediateSubdirectories(dirPath: string): string[] {
  if (!dirPath || !fs.existsSync(dirPath)) return [];

  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error(`Failed to read subdirectories for ${dirPath}:`, error);
    return [];
  }
}

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
    if (!content || !content.trim()) {
      return json({ locations: ["Default (local)"] });
    }

    let config;
    try {
      config = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse config JSON:", parseError);
      return json({
        locations: ["Default (local)"],
        error: "Invalid config file",
      });
    }

    // Ensure allowed_locations is an array of objects
    let rawLocations = config.allowed_locations;
    if (
      rawLocations &&
      typeof rawLocations === "object" &&
      !Array.isArray(rawLocations)
    ) {
      if (rawLocations.name && rawLocations.path) {
        rawLocations = [rawLocations];
      } else {
        rawLocations = Object.values(rawLocations);
      }
    }

    // Normalize location objects for frontend usage.
    const normalizedLocations = (rawLocations || [])
      .filter((loc: any) => typeof loc === "object" && loc !== null)
      .map((loc: any) => ({
        name: loc.name || loc.path || "Unknown",
        path: loc.path || "",
      }));

    const locations = normalizedLocations.map((loc: any) => loc.name);
    const absStableBaseNamesByLocation: Record<string, string[]> = {};

    for (const loc of normalizedLocations) {
      absStableBaseNamesByLocation[loc.name] = listImmediateSubdirectories(
        loc.path,
      );
    }

    if (locations.length === 0) {
      locations.push("Default (local)");
    }

    return json({ locations, absStableBaseNamesByLocation });
  } catch (e) {
    console.error("Config API Error:", e);
    return json({
      locations: ["Default (local)"],
      absStableBaseNamesByLocation: {},
      error: "Using fallback config",
    });
  }
}
