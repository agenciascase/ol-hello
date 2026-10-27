import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com)$/i;

// Serves Meta ad pictures through our domain: the CDN can refuse direct loads from other sites.
// Only Meta image hosts are allowed, so this cannot be used as a general proxy.
export const Route = createFileRoute("/api/ad-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) return new Response("forbidden", { status: 403 });
        try {
          const res = await fetch(target.toString(), { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; ScaseReports/1.0)" } });
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || !type.startsWith("image/")) return new Response("not found", { status: 404 });
          return new Response(res.body, { headers: { "content-type": type, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
        } catch {
          return new Response("unavailable", { status: 502 });
        }
      },
    },
  },
});
