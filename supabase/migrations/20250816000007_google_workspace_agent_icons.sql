-- Update Google Workspace agent icons to use product-specific logos.
-- Uses simpleicons.org CDN for branded product icons.

UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/gmail' WHERE name = 'Gmail Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googledrive' WHERE name = 'Google Drive Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googledocs' WHERE name = 'Google Docs Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googlesheets' WHERE name = 'Google Sheets Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googleslides' WHERE name = 'Google Slides Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googlecalendar' WHERE name = 'Google Calendar Agent';
UPDATE public.heights_cloud_agents SET image_url = 'https://cdn.simpleicons.org/googlechat' WHERE name = 'Google Chat Agent';
UPDATE public.heights_cloud_agents SET image_url = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2216%22%20fill%3D%22%234285F4%22%2F%3E%3Cpath%20fill%3D%22white%22%20d%3D%22M64%2036a16%2016%200%201%200%200%2032%2016%2016%200%200%200%200-32zm0%2040c-21%200-38%2010.5-38%2023.5V108h76V99.5C102%2086.5%2085%2076%2064%2076z%22%2F%3E%3C%2Fsvg%3E' WHERE name = 'Google Contacts Agent';
