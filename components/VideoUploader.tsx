import React, { useRef, useState, useCallback } from 'react';
import { Upload, Film, Loader2 } from 'lucide-react';

interface VideoUploaderProps {
  onFramesExtracted: (frames: { time: number; image: string }[]) => void;
  onLoadingStart: () => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFramesExtracted, onLoadingStart }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      processVideo(url);
    }
  };

  const processVideo = useCallback((videoUrl: string) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    onLoadingStart();
    setIsProcessing(true);
    setProgress(0);

    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    
    // Config: extract one frame every 3 seconds
    const INTERVAL_SECONDS = 3; 
    // Resize frames for API efficiency (720p height max usually enough for analysis)
    const MAX_HEIGHT = 540; 

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const frames: { time: number; image: string }[] = [];
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      // Calculate scale
      const scale = Math.min(1, MAX_HEIGHT / video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      const seekResolve = (el: HTMLVideoElement) => {
        return new Promise<void>((resolve) => {
          const onSeeked = () => {
            el.removeEventListener('seeked', onSeeked);
            resolve();
          };
          el.addEventListener('seeked', onSeeked);
        });
      };

      for (let time = 1; time < duration; time += INTERVAL_SECONDS) {
        video.currentTime = time;
        await seekResolve(video);

        // Draw to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        frames.push({
          time: time,
          image: dataUrl
        });

        setProgress(Math.round((time / duration) * 100));
      }

      setIsProcessing(false);
      onFramesExtracted(frames);
    };
  }, [onFramesExtracted, onLoadingStart]);

  return (
    <div className="w-full max-w-2xl mx-auto mb-12">
      <div 
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
          ${isProcessing 
            ? 'border-blue-500 bg-blue-900/10 cursor-wait' 
            : 'border-gray-600 hover:border-blue-400 hover:bg-gray-800'
          }
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="video/*" 
          className="hidden" 
        />
        
        {isProcessing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <div>
              <p className="text-xl font-medium text-blue-400">正在拆解视频镜头...</p>
              <p className="text-sm text-gray-400 mt-2">进度: {progress}%</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center">
              <Film className="w-8 h-8 text-gray-300" />
            </div>
            <div>
              <p className="text-xl font-medium text-gray-100">上传视频进行拉片</p>
              <p className="text-sm text-gray-400 mt-2">支持 MP4, WebM 等常见格式</p>
            </div>
            <button className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
              <Upload className="w-4 h-4" />
              选择文件
            </button>
          </div>
        )}
      </div>

      {/* Hidden elements for processing */}
      <video ref={videoRef} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};