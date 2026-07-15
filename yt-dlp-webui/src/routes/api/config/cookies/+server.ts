import { json } from "@sveltejs/kit";
import {
  listCookieSites,
  saveSiteCookies,
  parseCookieHeader,
  detectDomainsFromContent,
  mergeAllCookies,
} from "$lib/server/cookies";

/**
 * GET /api/config/cookies - List all configured cookie sites.
 */
export async function GET() {
  try {
    const sites = listCookieSites();
    return json({ sites });
  } catch (e: any) {
    console.error("Cookie list error:", e);
    return json({ sites: [], error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/config/cookies - Add cookies for a site.
 *
 * Supports two modes via `mode` field:
 * - "upload": multipart form with `file` + `domain`
 * - "paste": JSON with `domain` + `cookieString`
 */
export async function POST({ request }) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let domain: string;
    let siteContent: string;

    if (contentType.includes("multipart/form-data")) {
      // File upload mode
      const formData = await request.formData();
      const file = formData.get("file");
      domain = (formData.get("domain") as string) || "";

      if (!file || !(file instanceof File)) {
        return json({ error: "No cookie file provided" }, { status: 400 });
      }

      if (file.size > 5 * 1024 * 1024) {
        return json({ error: "File too large (max 5MB)" }, { status: 400 });
      }

      // If no domain provided, try to detect from file content
      if (!domain) {
        const content = await file.text();
        const domains = detectDomainsFromContent(content);
        if (domains.length === 1) {
          domain = domains[0];
        } else if (domains.length > 1) {
          return json(
            {
              error:
                "Cookie file contains cookies for multiple domains. Please specify the domain.",
              domains,
            },
            { status: 400 },
          );
        } else {
          return json(
            {
              error:
                "Could not detect domain from cookie file. Please provide a domain name.",
            },
            { status: 400 },
          );
        }
      }

      const arrayBuffer = await file.arrayBuffer();
      siteContent = Buffer.from(arrayBuffer).toString("utf-8");
    } else if (contentType.includes("application/json")) {
      // Paste mode
      const body = await request.json();
      domain = body.domain || "";
      const cookieString = body.cookieString || "";

      if (!cookieString.trim()) {
        return json(
          { error: "No cookie data provided" },
          { status: 400 },
        );
      }

      if (!domain) {
        return json(
          { error: "Domain is required when pasting cookies" },
          { status: 400 },
        );
      }

      // Convert raw Cookie header to Netscape format
      siteContent = parseCookieHeader(domain, cookieString);
    } else {
      return json(
        { error: "Expected multipart/form-data or application/json" },
        { status: 400 },
      );
    }

    // Clean domain
    domain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "")
      .trim()
      .toLowerCase();

    if (!domain || !domain.includes(".")) {
      return json(
        { error: "Invalid domain. Provide something like 'youtube.com'" },
        { status: 400 },
      );
    }

    // Save per-site file
    const result = saveSiteCookies(domain, siteContent);

    // Re-merge all cookies into the main file
    const mergeResult = mergeAllCookies();

    return json({
      success: true,
      domain,
      sitePath: result.path,
      siteSize: result.size,
      mergedPath: mergeResult.mergedPath,
      totalSites: mergeResult.siteCount,
    });
  } catch (e: any) {
    console.error("Cookie save error:", e);
    return json(
      { error: e.message || "Failed to save cookies" },
      { status: 500 },
    );
  }
}
