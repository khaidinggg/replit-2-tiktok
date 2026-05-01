import type { VercelRequest, VercelResponse } from "@vercel/node";

interface RapidApiVideo {
  video_id: string;
  title?: string;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
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
  apiKey: string
): Promise<RapidApiVideo[]> {
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
  const data = await res.json() as {
    code?: number;
    data?: { videos?: RapidApiVideo[] };
  };
  if (data.code !== 0) return [];
  return data.data?.videos ?? [];
}

type BraveResult = {
  url: string;
  title: string;
  description?: string;
  thumbnail?: { src?: string };
  age?: string;
  page_age?: string;
  extra_snippets?: string[];
};

async function braveSearch(query: string, apiKey: string): Promise<BraveResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("result_filter", "web");
  url.searchParams.set("safesearch", "off");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];
  const data = await res.json() as { web?: { results?: BraveResult[] } };
  return data.web?.results ?? [];
}

function parseViewCount(text: string): number | null {
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

async function fetchOembed(videoUrl: string): Promise<{ thumbnail_url?: string; author_name?: string } | null> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    return await res.json() as { thumbnail_url?: string; author_name?: string };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const countRaw = typeof req.query.count === "string" ? parseInt(req.query.count) : 20;
  const count = Math.min(isNaN(countRaw) ? 20 : countRaw, 20);

  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const braveApiKey = process.env.BRAVE_API_KEY;

  try {
    // Primary: RapidAPI TikTok Scraper
    if (rapidApiKey) {
      const videos = await searchViaRapidApi(q, count, rapidApiKey);

      if (videos.length > 0) {
        const results = videos.slice(0, count).map((v) => {
          const username = v.author?.unique_id ?? "unknown";
          const videoId = v.video_id;
          return {
            id: videoId,
            title: v.title ?? "",
            thumbnail: v.origin_cover ?? v.cover ?? "",
            videoUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
            author: v.author?.nickname ?? username,
            authorUsername: username,
            views: v.play_count ?? null,
            likes: v.digg_count ?? null,
            saves: null,
            comments: v.comment_count ?? null,
            shares: v.share_count ?? null,
            postedAt: v.create_time
              ? new Date(v.create_time * 1000).toISOString()
              : null,
            duration: null,
            description: v.title ?? null,
          };
        });

        return res.json({ results, query: q, total: results.length });
      }
    }

    // Fallback: Brave Search
    if (!braveApiKey) {
      return res.status(500).json({ error: "No search API key configured" });
    }

    const variants = [`${q} tiktok video`, `${q} tiktok viral`, `tiktok ${q}`];
    const allRaw = await Promise.all(variants.map((v) => braveSearch(v, braveApiKey)));

    const seen = new Set<string>();
    const items: Array<{
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
        const m = item.url.match(/\/video\/(\d+)/);
        if (!m) continue;
        const videoId = m[1];
        if (seen.has(videoId)) continue;
        seen.add(videoId);

        const authorMatch = item.url.match(/\/@([^/]+)/);
        const authorUsername = authorMatch ? authorMatch[1] : "unknown";

        let likes: number | null = null;
        for (const snippet of item.extra_snippets ?? []) {
          const lm = snippet.match(/([\d.,]+[kmb]?)\s*likes?/i);
          if (lm) { likes = parseViewCount(lm[1]); break; }
        }

        items.push({
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

    const sliced = items.slice(0, count);
    const oembeds = await Promise.all(sliced.map((it) => fetchOembed(it.videoUrl)));

    const results = sliced.map((item, i) => ({
      id: item.videoId,
      title: item.title,
      thumbnail: oembeds[i]?.thumbnail_url ?? item.braveThumb ?? "",
      videoUrl: item.videoUrl,
      author: oembeds[i]?.author_name ?? item.authorUsername,
      authorUsername: item.authorUsername,
      views: null,
      likes: item.likes,
      saves: null,
      comments: null,
      shares: null,
      postedAt: item.postedAt,
      duration: null,
      description: item.description,
    }));

    return res.json({ results, query: q, total: results.length });
  } catch {
    return res.status(500).json({ error: "Failed to perform search" });
  }
}
