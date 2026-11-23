export interface Competitor {
  name: string;
  why_competitor: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CompetitorSection {
  brand_name: string;
  competitors: Competitor[];
  your_brand_strengths: string[];
  your_brand_weaknesses: string[];
  opportunities: string[];
}

export interface SearchQuery {
  query: string;
  platform: string;
  intent: string;
  target_audience: string;
}

export interface SEOSection {
  primary_keyword: string;
  secondary_keywords: string[];
  seo_title: string;
  meta_description: string;
  content_ideas: string[];
}

export interface ServiceItem {
  name: string;
  description: string;
}

export interface AudienceSection {
  primary_audience: string;
  secondary_audience: string;
  industries: string[];
  customer_needs: string[];
  recommended_segments: string[];
}

export interface LinkAnalysisData {
  competitor_vs_your_brand: CompetitorSection;
  top_5_target_search_queries: SearchQuery[];
  seo_improvement: SEOSection;
  top_5_services: ServiceItem[];
  target_audience_identification: AudienceSection;
}

export interface AnalysisMeta {
  model: string;
  provider: string;
  input_chars: number;
  inferred_data_disclaimer: string;
}

export interface LinkAnalysisResponse {
  status: string;
  url: string;
  analysis: LinkAnalysisData;
  meta: AnalysisMeta;
}
