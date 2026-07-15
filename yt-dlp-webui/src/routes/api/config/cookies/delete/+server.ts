import { json } from "@sveltejs/kit";
import { deleteSiteCookies, mergeAllCookies } from "$lib/server/cookies";

/**
 * POST /api/config/cookies/delete - Remove cookies for a site.
 * (Using POST because SvelteKit doesn't have a convenient DELETE route helper
 * that accepts a body, and we want to keep the frontend simple.)
 */
export async function POST({ request }) {
  try {
    const { domain } = await request.json();

    if (!domain) {
      return json({ error: "Missing domain" }, { status: 400 });
    }

    const deleted = deleteSiteCookies(domain);

    // Re-merge after deletion
    const mergeResult = mergeAllCookies();

    return json({
      success: deleted,
      domain,
      mergedPath: mergeResult.mergedPath,
      totalSites: mergeResult.siteCount,
    });
  } catch (e: any) {
    console.error("Cookie delete error:", e);
    return json(
      { error: e.message || "Failed to delete cookies" },
      { status: 500 },
    );
  }
}
