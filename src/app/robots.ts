import type { MetadataRoute } from "next";

const SITE_URL = (process.env.APP_BASE_URL || "https://nexvid.online").replace(
  /\/$/,
  "",
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          "facebookexternalhit",
          "Facebot",
          "meta-externalagent",
          "Twitterbot",
          "LinkedInBot",
          "Discordbot",
          "Slackbot-LinkExpanding",
          "WhatsApp",
          "TelegramBot",
          "Applebot",
          "Applebot-Extended",
          "SkypeUriPreview",
        ],
        allow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        // Keep only private/runtime routes out of generic crawler access.
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
