import { Router, type IRouter } from "express";
import { SearchTikTokQueryParams, SearchTikTokResponse } from "@workspace/api-zod";

const router: IRouter = Router();

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

function buildTikTokVideoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("tiktok.com")) {
      const videoIdMatch = parsed.pathname.match(/\/video\/(\d+)/);
      const authorMatch = parsed.pathname.match(/\/@([^/]+)/);
      if (videoIdMatch && authorMatch) {
        return `https://www.tiktok.com/@${authorMatch[1]}/video/${videoIdMatch[1]}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

interface OembedData {
  thumbnail_url?: string;
  author_name?: string;
  title?: string;
}

async function fetchOembed(videoUrl: string): Promise<OembedData | null> {
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json() as OembedData;
  } catch {
    return null;
  }
}

type BraveWebResult = {
  url: string;
  title: string;
  description?: string;
  thumbnail?: { src?: string; original?: string };
  profile?: { name?: string; long_name?: string };
  age?: string;
  extra_snippets?: string[];
  page_age?: string;
};

async function braveSearch(query: string, apiKey: string, offset = 0): Promise<BraveWebResult[]> {
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("result_filter", "web");
    url.searchParams.set("safesearch", "off");

    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const data = await res.json() as { web?: { results?: BraveWebResult[] } };
    return data.web?.results ?? [];
  } catch {
    return [];
  }
}

function extractVideoItems(results: BraveWebResult[]) {
  return results
    .filter(item => item.url.includes("tiktok.com") && /\/video\/(\d+)/.test(item.url))
    .map(item => {
      const videoIdMatch = item.url.match(/\/video\/(\d+)/);
      const videoId = videoIdMatch![1];
      const videoUrl = buildTikTokVideoUrl(item.url);
      const authorMatch = item.url.match(/\/@([^/]+)/);
      const authorUsername = authorMatch ? authorMatch[1] : "unknown";

      let likes: number | null = null;
      if (item.extra_snippets) {
        for (const snippet of item.extra_snippets) {
          const likeMatch = snippet.match(/([\d.,]+[kmb]?)\s*likes?/i);
          if (likeMatch) { likes = parseViewCount(likeMatch[1]); break; }
        }
      }

      const postedAt = item.page_age ?? item.age ?? null;

      return {
        videoId,
        videoUrl,
        title: item.title,
        authorUsername,
        description: item.description ?? null,
        likes,
        postedAt,
        braveThumb: item.thumbnail?.src ?? "",
      };
    });
}

router.get("/tiktok/thumbnail", async (req, res): Promise<void> => {
  const rawUrl = req.query["url"];
  const imageUrl = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;
  if (!imageUrl || typeof imageUrl !== "string") {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        "Referer": "https://www.tiktok.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!imgRes.ok) {
      res.status(404).send("Image not found");
      return;
    }
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const buffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).send("Failed to fetch image");
  }
});

router.get("/tiktok/search", async (req, res): Promise<void> => {
  const queryParsed = SearchTikTokQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const { q, count } = queryParsed.data;
  const desiredCount = Math.min(count ?? 20, 40);

  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    req.log.error("BRAVE_API_KEY not configured");
    res.status(500).json({ error: "Search API key not configured" });
    return;
  }

  try {
    req.log.info({ query: q, count: desiredCount }, "Searching TikTok via Brave (multi-query)");

    const searchVariants = [
      `${q} tiktok video`,
      `${q} tiktok viral`,
      `tiktok ${q}`,
    ];

    const allRawResults = await Promise.all(
      searchVariants.map(variant => braveSearch(variant, apiKey))
    );

    const allItems = allRawResults.flatMap(r => extractVideoItems(r));

    const seen = new Set<string>();
    const uniqueItems = allItems.filter(item => {
      if (seen.has(item.videoId)) return false;
      seen.add(item.videoId);
      return true;
    });

    req.log.info({ total: uniqueItems.length }, "Unique TikTok videos found");

    const slicedItems = uniqueItems.slice(0, desiredCount);

    const oembedResults = await Promise.all(
      slicedItems.map(item => fetchOembed(item.videoUrl))
    );

    const results = slicedItems.map((item, i) => {
      const oembed = oembedResults[i];
      const thumbnail = oembed?.thumbnail_url ?? item.braveThumb ?? "";
      const author = oembed?.author_name ?? item.authorUsername;

      return {
        id: item.videoId,
        title: item.title,
        thumbnail,
        videoUrl: item.videoUrl,
        author,
        authorUsername: item.authorUsername,
        views: null as number | null,
        likes: item.likes,
        saves: null as number | null,
        comments: null as number | null,
        shares: null as number | null,
        postedAt: item.postedAt,
        duration: null as string | null,
        description: item.description,
      };
    });

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
