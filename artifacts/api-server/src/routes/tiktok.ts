import { Router, type IRouter } from "express";
import { SearchTikTokQueryParams, SearchTikTokResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function formatCount(count: number | null | undefined): number | null {
  if (count == null) return null;
  return count;
}

function parseViewCount(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").toLowerCase();
  const match = cleaned.match(/^([\d.]+)\s*([kmb]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") return Math.round(num * 1000);
  if (suffix === "m") return Math.round(num * 1000000);
  if (suffix === "b") return Math.round(num * 1000000000);
  return Math.round(num);
}

function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

function buildTikTokVideoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("tiktok.com")) {
      const videoIdMatch = parsed.pathname.match(/\/video\/(\d+)/);
      if (videoIdMatch) {
        const authorMatch = parsed.pathname.match(/\/@([^/]+)/);
        if (authorMatch) {
          return `https://www.tiktok.com/@${authorMatch[1]}/video/${videoIdMatch[1]}`;
        }
      }
    }
    return url;
  } catch {
    return url;
  }
}

router.get("/tiktok/search", async (req, res): Promise<void> => {
  const queryParsed = SearchTikTokQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const { q, count } = queryParsed.data;

  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    req.log.error("BRAVE_API_KEY not configured");
    res.status(500).json({ error: "Search API key not configured" });
    return;
  }

  try {
    const searchQuery = `site:tiktok.com/@ ${q}`;
    const countToFetch = Math.min(count ?? 20, 20);

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("count", String(countToFetch));
    url.searchParams.set("result_filter", "web");
    url.searchParams.set("freshness", "");
    url.searchParams.set("safesearch", "off");

    req.log.info({ query: q, count: countToFetch }, "Searching TikTok via Brave");

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, body: errText }, "Brave API error");
      res.status(500).json({ error: `Search API error: ${response.status}` });
      return;
    }

    const data = await response.json() as {
      web?: {
        results?: Array<{
          url: string;
          title: string;
          description?: string;
          thumbnail?: { src?: string; original?: string };
          profile?: { name?: string; long_name?: string; img?: string; url?: string };
          meta_url?: { path?: string };
          age?: string;
          extra_snippets?: string[];
          page_age?: string;
        }>;
      };
      videos?: {
        results?: Array<{
          url: string;
          title: string;
          description?: string;
          thumbnail?: { src?: string; original?: string };
          author?: string;
          duration?: string;
          views?: number;
          age?: string;
          page_age?: string;
        }>;
      };
    };

    const results: Array<{
      id: string;
      title: string;
      thumbnail: string;
      videoUrl: string;
      author: string;
      authorUsername: string;
      views: number | null;
      likes: number | null;
      saves: number | null;
      comments: number | null;
      shares: number | null;
      postedAt: string | null;
      duration: string | null;
      description: string | null;
    }> = [];

    const allResults = [
      ...(data.web?.results ?? []),
    ];

    for (const item of allResults) {
      if (!item.url.includes("tiktok.com")) continue;

      const videoIdMatch = item.url.match(/\/video\/(\d+)/);
      if (!videoIdMatch) continue;

      const videoId = videoIdMatch[1];
      const videoUrl = buildTikTokVideoUrl(item.url);

      const authorMatch = item.url.match(/\/@([^/]+)/);
      const authorUsername = authorMatch ? authorMatch[1] : (item.profile?.name ?? "unknown");
      const authorName = item.profile?.long_name ?? authorUsername;

      const thumbnailSrc = item.thumbnail?.src ?? "";
      const thumbnailOriginal = item.thumbnail?.original ?? "";
      const isTikTokUrl = thumbnailOriginal.includes("tiktok.com/@");
      const thumbnail = isTikTokUrl ? thumbnailSrc : (thumbnailOriginal || thumbnailSrc || "");

      let views: number | null = null;
      let likes: number | null = null;

      if (item.extra_snippets) {
        for (const snippet of item.extra_snippets) {
          const viewMatch = snippet.match(/(\d[\d.,]*[kmb]?)\s*views?/i);
          if (viewMatch) views = parseViewCount(viewMatch[1]);
          const likeMatch = snippet.match(/(\d[\d.,]*[kmb]?)\s*likes?/i);
          if (likeMatch) likes = parseViewCount(likeMatch[1]);
        }
      }

      let postedAt: string | null = null;
      if (item.page_age) postedAt = item.page_age;
      else if (item.age) postedAt = item.age;

      results.push({
        id: videoId,
        title: item.title,
        thumbnail,
        videoUrl,
        author: authorName,
        authorUsername,
        views,
        likes,
        saves: null,
        comments: null,
        shares: null,
        postedAt,
        duration: null,
        description: item.description ?? null,
      });
    }

    const parsed = SearchTikTokResponse.parse({
      results,
      query: q,
      total: results.length,
    });

    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Failed to search TikTok");
    res.status(500).json({ error: "Failed to perform search" });
  }
});

export default router;
