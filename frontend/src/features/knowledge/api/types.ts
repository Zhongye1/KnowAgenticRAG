export type KnowledgeBase = {
  kb_name: string;
  plugin_namespace: string;
  display_name: string;
  description: string;
  theme: string;
  icon: string;
  pdf_text_page_ratio: number;
  collections_used: string[];
  documents: number;
  text_vectors: number;
  visual_vectors: number;
  created_time: string;
  updated_time: string | null;
};

export type KnowledgeBaseOverview = {
  total_kbs: number;
  total_documents: number;
  total_text_vectors: number;
  total_visual_vectors: number;
};

export type CreateKnowledgeBaseDTO = {
  kb_name: string;
  display_name: string;
  description?: string;
  theme?: string;
  icon?: string;
  pdf_text_page_ratio?: number;
};

export type DocumentItem = {
  document_id: string;
  kb_name: string;
  plugin_namespace: string;
  name: string;
  source_type: string;
  source_uri: string | null;
  pipeline: string;
  status: string;
  sha256: string | null;
  chunk_count: number;
  created_time: string;
  updated_time: string | null;
};

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
  links: {
    first: string;
    last: string;
    self: string;
    next: string | null;
    prev: string | null;
  };
};
