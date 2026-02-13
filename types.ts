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
