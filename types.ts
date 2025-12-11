export interface ShotAnalysis {
  visualDescription: string;
  shotSize: string;      // 景别
  cameraMovement: string; // 镜头运动
  lightingAndColor: string; // 光影与色彩
  soundAtmosphere: string; // 听觉氛围
  aiPrompt: string; // The prompt for generating similar images
}

export interface Shot {
  id: string;
  timestamp: number; // Time in seconds
  duration: number; // Duration of the shot in seconds
  originalImage: string; // Base64 data URI
  isAnalyzing: boolean;
  analysis?: ShotAnalysis;
  isGeneratingImage: boolean;
  generatedImage?: string; // Base64 data URI from Nano Banana
  error?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING_VIDEO = 'PROCESSING_VIDEO',
  ANALYZING = 'ANALYZING',
}