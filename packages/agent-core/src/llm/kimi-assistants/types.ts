export interface KimiAssistantConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface WebSearchResult {
  query: string;
  answer: string;
  searchedAt: string;
}

export interface WebFetchResult {
  url: string;
  title?: string;
  summary: string;
  fetchedAt: string;
}

export interface AnalyzeMediaInput {
  source: string;
  mimeType?: string;
  prompt?: string;
}

export interface AnalyzeMediaResult {
  summary: string;
  analyzedAt: string;
}
