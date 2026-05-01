import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawUrl = req.query.url;
  const imageUrl = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        Referer: "https://www.tiktok.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!imgRes.ok) {
      return res.status(404).send("Image not found");
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");

    const buffer = await imgRes.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch {
    return res.status(500).send("Failed to fetch image");
  }
}
