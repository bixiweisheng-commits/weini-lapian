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
  
  // Status management
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  
  isGeneratingImage: boolean; // For Nano Banana generation
  
  analysis?: ShotAnalysis;
  generatedImage?: string; // Base64 data URI from Nano Banana
  error?: string; // Analysis error
  imageGenError?: string; // Image generation error
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING_VIDEO = 'PROCESSING_VIDEO',
  ANALYZING = 'ANALYZING',
}