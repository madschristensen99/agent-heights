-- Replace favicon URLs that 404 for specific obscure domains with DiceBear initials avatars
-- Only targets the 6 premium agent domains + 1 DeFi agent domain known to 404

-- Premium agents with broken Google favicon URLs
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=Surf&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'Surf';
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=Andi&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'Andi';
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=Aviato&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'Aviato';
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=Fantastic%20Jobs&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'Fantastic Jobs';
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=OpenFunnel&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'OpenFunnel';
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=PredictLeads&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'PredictLeads';

-- DeFi agent with broken DuckDuckGo favicon URL
UPDATE heights_cloud_agents SET image_url = 'https://api.dicebear.com/7.x/initials/svg?seed=Talken%20Swap%20Agent&backgroundColor=1e293b,312e81,3730a3,5b21b6,6d28d9&textColor=ffffff' WHERE name = 'Talken Swap Agent';
