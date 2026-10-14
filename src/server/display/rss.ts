import { memoFetch } from "./memo";

export type RssItem = { title: string; content: string };

export async function fetchRssFeed(url: string): Promise<RssItem | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return memoFetch(
    `rss:${url}`,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const text = await res.text();
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        const itemTitle = text.match(/<item[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i);
        const contentMatch =
          text.match(/<item[^>]*>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/i) ||
          text.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
        const title = (itemTitle?.[1] ?? titleMatch?.[1] ?? "").trim();
        let content = (contentMatch?.[1] ?? "").trim();
        content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
        if (!title && !content) return null;
        return { title, content };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    600_000
  );
}
