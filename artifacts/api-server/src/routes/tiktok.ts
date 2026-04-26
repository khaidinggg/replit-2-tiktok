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

function buildTikTokVideoUrl(username: string, videoId: string): string {
  return `https://www.tiktok.com/@${username}/video/${videoId}`;
}

interface RapidApiVideo {
  video_id: string;
  aweme_id?: string;
  title?: string;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  download_count?: number;
  create_time?: number;
  cover?: string;
  origin_cover?: string;
  author?: {
    unique_id?: string;
    nickname?: string;
  };
}

async function searchViaRapidApi(
  query: string,
  count: number,
  apiKey: string,
): Promise<RapidApiVideo[]> {
  try {
    const url = new URL("https://tiktok-scraper7.p.rapidapi.com/feed/search");
    url.searchParams.set("keywords", query);
    url.searchParams.set("count", String(Math.min(count, 20)));
    url.searchParams.set("cursor", "0");
    url.searchParams.set("region", "US");
    url.searchParams.set("publish_time", "0");
    url.searchParams.set("sort_type", "0");

    const res = await fetch(url.toString(), {
      headers: {
        "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const data = await res.json() as { code?: number; data?: { videos?: RapidApiVideo[] } };
    if (data.code !== 0) return [];
    return data.data?.videos ?? [];
  } catch {
    return [];
  }
}

interface OembedData {
  thumbnail_url?: string;
  author_name?: string;
}

async function fetchOembed(videoUrl: string): Promise<OembedData | null> {
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
      signal: AbortSignal.timeout(5000),
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
  thumbnail?: { src?: string };
  age?: string;
  extra_snippets?: string[];
  page_age?: string;
};

async function braveSearch(query: string, apiKey: string): Promise<BraveWebResult[]> {
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "20");
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
  const desiredCount = Math.min(count ?? 20, 20);

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const braveApiKey = process.env.BRAVE_API_KEY;

  try {
    // --- Primary: RapidAPI TikTok Scraper ---
    if (rapidApiKey) {
      req.log.info({ query: q, count: desiredCount }, "Searching TikTok via RapidAPI");

      const videos = await searchViaRapidApi(q, desiredCount, rapidApiKey);

      if (videos.length > 0) {
        const results = videos.slice(0, desiredCount).map(v => {
          const username = v.author?.unique_id ?? "unknown";
          const videoId = v.video_id;
          const videoUrl = buildTikTokVideoUrl(username, videoId);
          const thumbnail = v.origin_cover ?? v.cover ?? "";
          const postedAt = v.create_time
            ? new Date(v.create_time * 1000).toISOString()
            : null;

          return {
            id: videoId,
            title: v.title ?? "",
            thumbnail,
            videoUrl,
            author: v.author?.nickname ?? username,
            authorUsername: username,
            views: v.play_count ?? null,
            likes: v.digg_count ?? null,
            saves: null as number | null,
            comments: v.comment_count ?? null,
            shares: v.share_count ?? null,
            postedAt,
            duration: null as string | null,
            description: v.title ?? null,
          };
        });

        req.log.info({ total: results.length }, "RapidAPI results found");

        const parsed = SearchTikTokResponse.parse({
          results,
          query: q,
          total: results.length,
        });

        res.json(parsed);
        return;
      }

      req.log.warn("RapidAPI returned no results, falling back to Brave");
    }

    // --- Fallback: Brave Search ---
    if (!braveApiKey) {
      res.status(500).json({ error: "No search API key configured" });
      return;
    }

    req.log.info({ query: q }, "Searching TikTok via Brave (fallback)");

    const searchVariants = [
      `${q} tiktok video`,
      `${q} tiktok viral`,
      `tiktok ${q}`,
    ];

    const allRaw = await Promise.all(
      searchVariants.map(v => braveSearch(v, braveApiKey))
    );

    const seen = new Set<string>();
    const uniqueItems: Array<{
      videoId: string;
      videoUrl: string;
      title: string;
      authorUsername: string;
      description: string | null;
      likes: number | null;
      postedAt: string | null;
      braveThumb: string;
    }> = [];

    for (const results of allRaw) {
      for (const item of results) {
        if (!item.url.includes("tiktok.com")) continue;
        const videoIdMatch = item.url.match(/\/video\/(\d+)/);
        if (!videoIdMatch) continue;
        const videoId = videoIdMatch[1];
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        const authorMatch = item.url.match(/\/@([^/]+)/);
        const authorUsername = authorMatch ? authorMatch[1] : "unknown";

        let likes: number | null = null;
        if (item.extra_snippets) {
          for (const snippet of item.extra_snippets) {
            const m = snippet.match(/([\d.,]+[kmb]?)\s*likes?/i);
            if (m) { likes = parseViewCount(m[1]); break; }
          }
        }

        uniqueItems.push({
          videoId,
          videoUrl: `https://www.tiktok.com/@${authorUsername}/video/${videoId}`,
          title: item.title,
          authorUsername,
          description: item.description ?? null,
          likes,
          postedAt: item.page_age ?? item.age ?? null,
          braveThumb: item.thumbnail?.src ?? "",
        });
      }
    }

    const sliced = uniqueItems.slice(0, desiredCount);

    const oembedResults = await Promise.all(
      sliced.map(item => fetchOembed(item.videoUrl))
    );

    const results = sliced.map((item, i) => {
      const oembed = oembedResults[i];
      return {
        id: item.videoId,
        title: item.title,
        thumbnail: oembed?.thumbnail_url ?? item.braveThumb ?? "",
        videoUrl: item.videoUrl,
        author: oembed?.author_name ?? item.authorUsername,
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
