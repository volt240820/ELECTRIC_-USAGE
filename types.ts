export interface ReadingData {
  date: string;
  value: number;
}

export interface AnalysisResult {
  startReading: ReadingData;
  endReading: ReadingData;
  usage: number;
}

export interface GeminiResponseSchema {
  startReading: {
    date: string;
    value: number;
  };
  endReading: {
    date: string;
    value: number;
  };
}

export interface Tenant {
  id: string;
  name: string;
  meters: string[]; // List of pre-defined meter names for this tenant
}

export interface MeterAssignment {
  tenantId: string; // ID of the company (A, B, C)
  meterName: string; // e.g., "1F AC", "Server Room"
}

export interface AnalysisItem {
  id: string;
  file: File;
  status: 'idle' | 'analyzing' | 'success' | 'error';
  result?: AnalysisResult;
  error?: string;
  assignment: MeterAssignment;
  isShared?: boolean; // Flag to indicate if this item came from a shared link
  thumbnailUrl?: string; // Store base64 thumbnail for shared view
  previewUrl?: string; // Store object URL for local preview
}
