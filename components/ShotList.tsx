import React from 'react';
import { Shot } from '../types';
import { Zap, AlertCircle, Image as ImageIcon, Film, Loader2, Maximize, Video, Palette, Music, Clock, Download, RefreshCw } from 'lucide-react';

interface ShotListProps {
  shots: Shot[];
  onGenerateImage: (shotId: string) => void;
  onRetryAnalysis: (shotId: string) => void;
}

export const ShotList: React.FC<ShotListProps> = ({ shots, onGenerateImage, onRetryAnalysis }) => {
  if (shots.length === 0) return null;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-6 no-print">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Film className="w-6 h-6 text-blue-500" />
          拉片结果 ({shots.length} 镜头)
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {shots.map((shot) => (
          <div key={shot.id} className="shot-card-print">
            <ShotCard 
              shot={shot} 
              onGenerateImage={() => onGenerateImage(shot.id)} 
              onRetryAnalysis={() => onRetryAnalysis(shot.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

interface ShotCardProps {
  shot: Shot;
  onGenerateImage: () => void;
  onRetryAnalysis: () => void;
}

const ShotCard: React.FC<ShotCardProps> = ({ shot, onGenerateImage, onRetryAnalysis }) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-xl flex flex-col xl:flex-row print:border-gray-300 print:shadow-none print:bg-white print:text-black">
      {/* Visual Column */}
      <div className="xl:w-[400px] flex-shrink-0 border-b xl:border-b-0 xl:border-r border-gray-700 flex flex-col bg-black/20 print:bg-white print:border-gray-300">
        <div className="relative group">
          <img 
            src={shot.originalImage} 
            alt={`Shot at ${formatTime(shot.timestamp)}`}
            className="w-full h-auto object-cover"
          />
          <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white font-mono border border-gray-600 print:border-black print:text-black print:bg-white/80">
            {formatTime(shot.timestamp)}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(shot.originalImage, `shot-${shot.timestamp.toFixed(2)}.jpg`);
            }}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded transition-colors backdrop-blur-sm border border-white/10 z-20 hover:scale-105 no-print"
            title="下载原图"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
        
        {/* Generated Image Section */}
        {shot.generatedImage ? (
           <div className="relative mt-auto border-t border-gray-700 print:border-gray-300">
             <div className="absolute top-2 left-2 z-10 bg-purple-600/90 px-2 py-1 rounded text-xs text-white font-bold flex items-center gap-1 shadow-lg backdrop-blur-sm print:hidden">
               <Zap className="w-3 h-3" /> Nano Banana 重绘
             </div>
             <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(shot.generatedImage!, `generated-${shot.id}.jpg`);
                }}
                className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded transition-colors backdrop-blur-sm border border-white/10 hover:scale-105 no-print"
                title="下载 AI 生成图"
              >
                <Download className="w-4 h-4" />
              </button>
             <img 
               src={shot.generatedImage} 
               alt="AI Generated"
               className="w-full h-auto object-cover"
             />
           </div>
        ) : (
          <div className="p-4 bg-gray-900/50 flex-1 flex flex-col items-center justify-center min-h-[160px] border-t border-gray-700 no-print">
            {shot.isGeneratingImage ? (
              <div className="flex flex-col items-center gap-3 text-purple-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium">Nano Banana 正在绘制分镜...</span>
              </div>
            ) : shot.imageGenError ? (
                <div className="flex flex-col items-center gap-3 text-red-400 p-2 text-center w-full">
                    <div className="flex items-center gap-2">
                         <AlertCircle className="w-5 h-5" />
                         <span className="text-sm font-bold">生图失败</span>
                    </div>
                    <span className="text-xs text-gray-400 break-words w-full px-2">{shot.imageGenError}</span>
                    <button 
                        onClick={onGenerateImage}
                        className="mt-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded border border-gray-600 flex items-center gap-1 transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" /> 重试生图
                    </button>
                </div>
            ) : shot.analysis ? (
              <button
                onClick={onGenerateImage}
                className="group flex flex-col items-center gap-2 text-gray-500 hover:text-purple-400 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-gray-800 group-hover:bg-purple-900/30 flex items-center justify-center border border-gray-700 group-hover:border-purple-500/50 transition-all">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium">生成 AI 概念图</span>
              </button>
            ) : (
               <span className="text-gray-600 text-sm">等待分析完成...</span>
            )}
          </div>
        )}
      </div>

      {/* Info Column */}
      <div className="flex-1 p-6 flex flex-col print:p-4">
        {shot.status === 'analyzing' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-blue-400 space-y-3 min-h-[300px]">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p>Gemini 正在分析此镜头...</p>
          </div>
        ) : shot.status === 'failed' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-red-400 gap-4 min-h-[300px] p-4 text-center">
            <div className="flex items-center gap-2 text-lg font-medium">
                <AlertCircle className="w-6 h-6" />
                分析失败
            </div>
            <p className="text-sm text-gray-500 break-all max-w-md">{shot.error}</p>
            <button 
                onClick={onRetryAnalysis}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors shadow-lg border border-gray-600"
            >
                <RefreshCw className="w-4 h-4" />
                重新分析
            </button>
          </div>
        ) : shot.analysis ? (
          <div className="space-y-6 print:space-y-4">
            
            {/* Shot Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-900/80 p-3 rounded-lg border border-gray-700/50 print:bg-white print:border-gray-300 print:text-black">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 uppercase font-bold print:text-gray-700">
                  <Maximize className="w-3 h-3" /> 景别
                </div>
                <div className="text-blue-200 font-medium text-sm print:text-black">{shot.analysis.shotSize}</div>
              </div>
              <div className="bg-gray-900/80 p-3 rounded-lg border border-gray-700/50 print:bg-white print:border-gray-300 print:text-black">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 uppercase font-bold print:text-gray-700">
                  <Video className="w-3 h-3" /> 镜头运动
                </div>
                <div className="text-blue-200 font-medium text-sm print:text-black">{shot.analysis.cameraMovement}</div>
              </div>
              <div className="bg-gray-900/80 p-3 rounded-lg border border-gray-700/50 print:bg-white print:border-gray-300 print:text-black">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 uppercase font-bold print:text-gray-700">
                  <Clock className="w-3 h-3" /> 时长
                </div>
                <div className="text-blue-200 font-medium text-sm print:text-black">{shot.duration} 秒</div>
              </div>
              <div className="bg-gray-900/80 p-3 rounded-lg border border-gray-700/50 print:bg-white print:border-gray-300 print:text-black">
                 <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 uppercase font-bold print:text-gray-700">
                  <Music className="w-3 h-3" /> 声音/音乐
                </div>
                <div className="text-blue-200 font-medium text-xs leading-tight line-clamp-2 print:text-black" title={shot.analysis.soundAtmosphere}>
                  {shot.analysis.soundAtmosphere}
                </div>
              </div>
            </div>

            {/* Visual Description & Lighting */}
            <div className="grid md:grid-cols-2 gap-6 print:gap-4">
               <div className="space-y-2">
                 <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 print:text-gray-800">画面内容</h4>
                 <p className="text-gray-300 text-sm leading-relaxed print:text-black">
                   {shot.analysis.visualDescription}
                 </p>
               </div>
               <div className="space-y-2">
                 <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1 print:text-gray-800">
                   <Palette className="w-3 h-3" /> 光影色彩
                 </h4>
                 <p className="text-gray-300 text-sm leading-relaxed print:text-black">
                   {shot.analysis.lightingAndColor}
                 </p>
               </div>
            </div>

            {/* Prompt */}
            <div className="mt-auto pt-4 border-t border-gray-700/50 print:border-gray-300">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2 flex items-center gap-2 print:text-purple-800">
                <Zap className="w-3 h-3" /> MJ / Nano Banana Prompt
              </h4>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-xs text-green-400/90 break-all border border-gray-700 relative group transition-all hover:border-green-500/30 print:bg-white print:border-gray-300 print:text-black">
                 {shot.analysis.aiPrompt}
                 <button 
                  onClick={() => navigator.clipboard.writeText(shot.analysis?.aiPrompt || "")}
                  className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-white hover:text-black text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-all no-print"
                  title="Copy Prompt"
                 >
                   <span className="text-[10px] font-bold">COPY</span>
                 </button>
              </div>
            </div>

            {/* Action Bar */}
            {!shot.generatedImage && !shot.isGeneratingImage && !shot.imageGenError && (
              <div className="flex justify-end no-print">
                <button
                  onClick={onGenerateImage}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40 transform hover:-translate-y-0.5"
                >
                  <Zap className="w-4 h-4" />
                  生成分镜画面
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};