import "server-only";
import { serpApiTrends } from "./serpapi-trends";
import { youtubeSource } from "./youtube";
import { metaAdLibrary } from "./meta-ads";

export const API_SOURCES = { google_trends_serpapi: serpApiTrends, youtube_data_api: youtubeSource, meta_ad_library: metaAdLibrary } as const;
export type ApiSourceKey = keyof typeof API_SOURCES;

/** Sources with no public API, and the manual workflow to use instead. */
export const MANUAL_WORKFLOWS = [
  {
    key: "google_trends_csv",
    name: "Google Trends — CSV export (no credentials)",
    steps: [
      "Open trends.google.com/trends/explore, enter the product keyword, choose the country and “Past 12 months” (or 5 years for longevity).",
      "Click the download (⬇) icon on “Interest over time” to save multiTimeline.csv.",
      "On the product's Trends tab, use “Import Google Trends CSV”. Values are stored as imported measurements.",
    ],
  },
  {
    key: "tiktok_creative_center_manual",
    name: "TikTok Creative Center (no public API)",
    steps: [
      "Open ads.tiktok.com/business/creativecenter → Trends → Hashtags (or Top Products), set region and 7/30-day period.",
      "Find the relevant hashtag/product and note the posts count or views shown.",
      "Record it on the product's Trends tab as a manual observation with the page URL and the date you viewed it.",
    ],
  },
  {
    key: "amazon_manual",
    name: "Amazon listings (manual)",
    steps: [
      "Search Amazon for the product; open the top 3 organic listings.",
      "Record the review count of the top listing (metric: amazon_top_review_count), its best-seller rank and price, with the listing URL.",
      "Amazon's Product Advertising API requires an approved Associates account with qualifying sales; it is not integrated.",
    ],
  },
  {
    key: "meta_ad_library_manual",
    name: "Meta Ad Library (manual, any country)",
    steps: [
      "Open facebook.com/ads/library, choose country, “All ads”, search the product keyword.",
      "Note the approximate result count and record it as a manual observation (metric: meta_active_ads) with the URL.",
    ],
  },
];

export function sourceStatuses() {
  return Object.values(API_SOURCES).map((s) => ({ key: s.key, name: s.name, configured: s.configured(), setupHelp: s.setupHelp }));
}
