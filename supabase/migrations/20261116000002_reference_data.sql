-- Reference data: data source catalog (with reliability weights used by the
-- confidence model) and built-in product categories.

insert into public.data_sources (key, name, kind, reliability, requires_credentials, description, docs_url) values
  ('google_trends_serpapi', 'Google Trends (via SerpApi)', 'api', 0.85, true,
   'Relative search interest (0-100 index, normalized per query window) retrieved through SerpApi''s Google Trends engine.',
   'https://serpapi.com/google-trends-api'),
  ('google_trends_csv', 'Google Trends (CSV export)', 'csv_import', 0.85, false,
   'Search interest exported manually from trends.google.com ("Download CSV") and imported.',
   'https://trends.google.com/trends/'),
  ('youtube_data_api', 'YouTube Data API v3', 'api', 0.8, true,
   'Counts and public view statistics for recent short-form videos matching a query (sample of top 50 search results).',
   'https://developers.google.com/youtube/v3'),
  ('meta_ad_library', 'Meta Ad Library API', 'api', 0.7, true,
   'Active ads matching search terms. Non-political ads are only returned for ads delivered in the EU/UK.',
   'https://www.facebook.com/ads/library/api/'),
  ('tiktok_creative_center_manual', 'TikTok Creative Center (manual)', 'manual', 0.65, false,
   'Values recorded by hand from TikTok Creative Center (no public API). Requires a source URL.',
   'https://ads.tiktok.com/business/creativecenter/'),
  ('amazon_manual', 'Amazon listing (manual)', 'manual', 0.65, false,
   'Review counts, best-seller rank and prices recorded by hand from public Amazon listings.',
   'https://www.amazon.com/'),
  ('manual', 'Manual research', 'manual', 0.6, false,
   'Any other observation recorded by the user with a source reference.', null),
  ('competitor_tracking', 'Tracked competitors', 'derived', 0.7, false,
   'Derived from competitor records entered on the platform.', null),
  ('supplier_offers', 'Supplier offers', 'derived', 0.75, false,
   'Derived from supplier offers entered on the platform.', null),
  ('ai_estimate', 'AI estimate', 'ai', 0.35, false,
   'Interpretation or rubric rating produced by Claude. Never a measurement.', null),
  ('demo', 'DEMO DATA (synthetic)', 'demo', 0.5, false,
   'Synthetic development data. Not market intelligence.', null)
on conflict (key) do update set
  name = excluded.name, kind = excluded.kind, reliability = excluded.reliability,
  requires_credentials = excluded.requires_credentials, description = excluded.description,
  docs_url = excluded.docs_url;

insert into public.categories (user_id, name, slug, description, seed_keywords) values
  (null, 'Pet Products', 'pet-products', 'Accessories, grooming, feeding and enrichment for pets.', array['dog accessories','cat toys','pet grooming']),
  (null, 'Home & Kitchen', 'home-kitchen', 'Kitchen gadgets, cleaning tools and home improvement.', array['kitchen gadgets','cleaning tools','home gadgets']),
  (null, 'Fitness Accessories', 'fitness-accessories', 'Home workout gear, recovery and training accessories.', array['home workout equipment','massage gun','resistance bands']),
  (null, 'Beauty Accessories', 'beauty-accessories', 'Beauty tools and grooming accessories (no ingestibles).', array['skincare tools','hair tools','makeup organizer']),
  (null, 'Technology Accessories', 'tech-accessories', 'Phone, desk and computer accessories.', array['phone accessories','desk setup','charging station']),
  (null, 'Car Accessories', 'car-accessories', 'Interior organization, cleaning and convenience for cars.', array['car accessories','car organizer','car cleaning']),
  (null, 'Outdoor Products', 'outdoor', 'Camping, hiking, garden and outdoor living.', array['camping gear','garden tools','outdoor lights']),
  (null, 'Organization & Storage', 'organization-storage', 'Storage solutions and organizers.', array['storage organizer','closet organizer','drawer organizer']),
  (null, 'Lifestyle Products', 'lifestyle', 'Everyday lifestyle and wellbeing products.', array['self care products','gift ideas','sleep aid']),
  (null, 'Personal Accessories', 'personal-accessories', 'Wallets, bags, travel and everyday carry.', array['travel accessories','everyday carry','minimalist wallet']),
  (null, 'Emerging / Other', 'other', 'Anything that does not fit the categories above.', array[]::text[])
on conflict do nothing;

-- Create a profile automatically when a Supabase Auth user signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
