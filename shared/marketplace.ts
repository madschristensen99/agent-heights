export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  summary: string;
  agent: string;
  language: string;
  use_cases: string[];
  tags: string;
  image_url: string | null;
  is_free: boolean;
  price: number | null;
  price_usd: number | null;
  is_premium: boolean;
  category: string[];
  requirements: string[];
  links: { label: string; url: string }[];
  user_id: string | null;
  created_at: string;
}

export interface MarketplacePrompt {
  id: string;
  name: string;
  description: string;
  summary: string;
  prompt: string;
  tags: string;
  image_url: string | null;
  is_free: boolean;
  price: number | null;
  price_usd: number | null;
  category: string[];
  use_cases: string[];
  user_id: string | null;
  created_at: string;
}

export interface MarketplaceTool {
  id: string;
  name: string;
  description: string;
  summary: string;
  tags: string;
  image_url: string | null;
  is_free: boolean;
  price: number | null;
  price_usd: number | null;
  category: string[];
  use_cases: string[];
  user_id: string | null;
  created_at: string;
}

export type MarketplaceItemType = "agent" | "prompt" | "tool" | "server";

export interface MarketplaceQuery {
  type: MarketplaceItemType;
  search?: string;
  limit?: number;
  offset?: number;
}
