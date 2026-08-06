-- Replace unreliable third-party favicon URLs with DiceBear initials avatars
-- Google favicon service (google.com/s2/favicons) and DuckDuckGo (icons.duckduckgo.com)
-- return 404 for many obscure domains, causing console errors in the marketplace UI

-- Fix premium agents using Google favicon URLs
UPDATE heights_cloud_agents
SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=' || replace(name, ' ', '%20') || '&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff'
WHERE image_url LIKE '%google.com/s2/favicons%'
  AND is_premium = true;

-- Fix agents using DuckDuckGo favicon URLs that 404
UPDATE heights_cloud_agents
SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=' || replace(name, ' ', '%20') || '&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff'
WHERE image_url LIKE '%icons.duckduckgo.com%'
  AND image_url = 'https://icons.duckduckgo.com/ip3/talken.io.ico';
