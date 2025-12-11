import React, { useState, useCallback, useEffect } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { ShotList } from './components/ShotList';
import { Shot } from './types';
import { analyzeFrameWithGemini, generateImageWithNanoBanana } from './services/gemini';
import { exportToWord } from './services/export';
import { Clapperboard, Settings, Key, X, Save, Download, FileText, Printer, ChevronDown, Globe } from 'lucide-react';

const App: React.FC = () => {
  const [shots, setShots] = useState<Shot[]>([]);
  
  // API Key Management State
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem('huanxi_api_key') || '';
  });
  const [baseUrl, setBaseUrl] = useState<string>(() => {
    return localStorage.getItem('huanxi_base_url') || '';
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const [tempKey, setTempKey] = useState('');
  const [tempBaseUrl, setTempBaseUrl] = useState('');

  useEffect(() => {
    // If we have neither env key nor stored key, show settings
    // But if we have a stored Base URL but no Key (Proxy mode), that's fine too.
    const storedKey = localStorage.getItem('huanxi_api_key');
    const storedBaseUrl = localStorage.getItem('huanxi_base_url');
    const envKey = process.env.API_KEY;

    if (!envKey && !storedKey && !storedBaseUrl) {
      setShowSettings(true);
    }
  }, []);

  const handleSaveSettings = () => {
    const keyToSave = tempKey.trim();
    const urlToSave = tempBaseUrl.trim();

    // Validation: Prevent user from pasting Key into Base URL field
    if (urlToSave.startsWith('sk-') && urlToSave.length > 20) {
      alert("配置错误提醒：\n\n您似乎将 API Key (sk-...) 填入到了 'Base URL' 栏中。\n\n1. 请将 sk- 开头的密钥填入上方的 'API Key' 栏。\n2. Base URL 栏应填写中转站的网址域名 (例如 https://api.proxy.com)。");
      return;
    }

    // Logic: If user provides Base URL but no Key, we save a placeholder key
    const finalKey = keyToSave || (urlToSave ? "custom_proxy_mode" : "");

    if (finalKey) {
      localStorage.setItem('huanxi_api_key', finalKey);
      setApiKey(finalKey);
    }
    
    localStorage.setItem('huanxi_base_url', urlToSave);
    setBaseUrl(urlToSave);
    
    setShowSettings(false);
  };

  const handleClearKey = () => {
    localStorage.removeItem('huanxi_api_key');
    localStorage.removeItem('huanxi_base_url');
    setApiKey(process.env.API_KEY || '');
    setBaseUrl('');
    setTempKey('');
    setTempBaseUrl('');
  };

  const openSettings = () => {
    setTempKey(apiKey === "custom_proxy_mode" ? "" : apiKey);
    setTempBaseUrl(baseUrl);
    setShowSettings(true);
  };

  const handleExportWord = async () => {
    setShowExportMenu(false);
    await exportToWord(shots);
  };

  const handlePrintPDF = () => {
    setShowExportMenu(false);
    window.print();
  };

  const formatErrorMessage = (error: any): string => {
    let msg = error instanceof Error ? error.message : "请求失败";
    
    // Attempt to parse Google JSON error if present in message
    try {
      const jsonMatch = msg.match(/\{.*"error":.*\}/s);
      if (jsonMatch) {
        const errorObj = JSON.parse(jsonMatch[0]);
        if (errorObj.error && errorObj.error.message) {
          return `API Error: ${errorObj.error.message}`;
        }
      }
    } catch (e) {
      // ignore parse error
    }
    
    if (msg.includes("API key not valid")) {
        return "Key 无效。程序已自动尝试使用 Bearer 验证。请检查 Base URL 是否正确 (一般只需填域名)。";
    }

    return msg;
  };

  const handleFramesExtracted = useCallback(async (frames: { time: number; image: string }[]) => {
    if (!apiKey && !baseUrl) {
      setShowSettings(true);
      return;
    }

    const newShots: Shot[] = frames.map((frame, index) => {
      const nextTime = frames[index + 1] ? frames[index + 1].time : frame.time + 3;
      const duration = Math.round((nextTime - frame.time) * 10) / 10;

      return {
        id: `shot-${Date.now()}-${index}`,
        timestamp: frame.time,
        duration: duration,
        originalImage: frame.image,
        isAnalyzing: true,
        isGeneratingImage: false
      };
    });

    setShots(newShots);
    
    frames.forEach(async (frame, index) => {
      const shotId = newShots[index].id;
      
      try {
        const analysis = await analyzeFrameWithGemini(frame.image, apiKey, baseUrl);
        
        setShots(prev => prev.map(s => 
          s.id === shotId 
            ? { ...s, isAnalyzing: false, analysis } 
            : s
        ));
      } catch (error: any) {
        console.error("Analysis failed:", error);
        
        setShots(prev => prev.map(s => 
          s.id === shotId 
            ? { ...s, isAnalyzing: false, error: formatErrorMessage(error) } 
            : s
        ));
      }
    });
  }, [apiKey, baseUrl]);

  const handleGenerateImage = async (shotId: string) => {
    if (!apiKey && !baseUrl) {
      setShowSettings(true);
      return;
    }

    const shot = shots.find(s => s.id === shotId);
    if (!shot || !shot.analysis?.aiPrompt) return;

    setShots(prev => prev.map(s => 
      s.id === shotId ? { ...s, isGeneratingImage: true, error: undefined } : s
    ));

    try {
      const generatedImageBase64 = await generateImageWithNanoBanana(shot.analysis.aiPrompt, apiKey, baseUrl);
      
      setShots(prev => prev.map(s => 
        s.id === shotId ? { ...s, isGeneratingImage: false, generatedImage: generatedImageBase64 } : s
      ));
    } catch (error: any) {
       setShots(prev => prev.map(s => 
        s.id === shotId ? { ...s, isGeneratingImage: false, error: formatErrorMessage(error) } : s
      ));
    }
  };

  const isSaveDisabled = !tempKey.trim() && !tempBaseUrl.trim();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30 print:bg-white print:text-black">
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/95 sticky top-0 z-50 backdrop-blur-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Clapperboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              欢玺AI <span className="text-xs font-medium text-gray-500 ml-2 border border-gray-700 px-2 py-0.5 rounded-full">Nano Banana Edition</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {shots.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-700"
                >
                  <Download className="w-4 h-4 text-green-400" />
                  导出报告
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
                
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 animate-[fadeIn_0.1s_ease-out]">
                    <button 
                      onClick={handleExportWord}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200"
                    >
                      <FileText className="w-4 h-4 text-blue-400" />
                      导出 Word (.docx)
                    </button>
                    <button 
                      onClick={handlePrintPDF}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-200 border-t border-gray-700"
                    >
                      <Printer className="w-4 h-4 text-purple-400" />
                      打印 / 另存为 PDF
                    </button>
                  </div>
                )}
                
                {/* Backdrop to close menu */}
                {showExportMenu && (
                  <div 
                    className="fixed inset-0 z-40 bg-transparent" 
                    onClick={() => setShowExportMenu(false)}
                  />
                )}
              </div>
            )}

            <div className="h-6 w-px bg-gray-700 mx-1"></div>

            <button 
              onClick={openSettings}
              className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
              title="设置 API Key & Base URL"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {shots.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-[fadeIn_0.5s_ease-out]">
            <div className="text-center mb-10 max-w-xl">
              <h2 className="text-3xl font-bold text-white mb-4">
                智能逐帧拉片工具
              </h2>
              <p className="text-gray-400 text-lg">
                上传视频，AI 自动拆解镜头、生成专业摄影笔记，并使用 Nano Banana 模型重绘分镜。
              </p>
            </div>
            <VideoUploader 
              onFramesExtracted={handleFramesExtracted} 
              onLoadingStart={() => setShots([])} 
            />
          </div>
        ) : (
          <div className="animate-[slideUp_0.5s_ease-out]">
            <div className="flex justify-between items-center mb-6 no-print">
              <button 
                onClick={() => setShots([])}
                className="text-gray-400 hover:text-white flex items-center gap-2 px-4 py-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                ← 上传新视频
              </button>
            </div>
            <ShotList shots={shots} onGenerateImage={handleGenerateImage} />
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-20 py-8 text-center text-gray-600 text-sm print:hidden">
        <p>© 2025 Huanxi AI. All rights reserved.</p>
      </footer>

      {/* API Key Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-md w-full p-6 relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="bg-purple-600/20 p-3 rounded-lg">
                <Globe className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">配置 API 设置</h3>
                <p className="text-xs text-gray-400">兼容官方 API 及第三方中转服务 (支持 sk- keys)</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Base URL (API 代理地址)
                </label>
                <input
                  type="text"
                  value={tempBaseUrl}
                  onChange={(e) => setTempBaseUrl(e.target.value)}
                  placeholder="https://your-proxy.com"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                />
                 <p className="text-[10px] text-gray-500 mt-1">
                   请填入中转站的域名 (如 https://api.proxy.com)。<span className="text-red-400 font-bold">请勿在此处填 Key。</span>
                 </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  API Key / Proxy Key
                </label>
                <input
                  type="password"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder={tempBaseUrl ? "sk-..." : "AIzaSy..."}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                />
                 <p className="text-[10px] text-gray-500 mt-1">
                   在此处填入您的密钥 (sk-... 或 AIza...)。系统会自动处理认证格式。
                 </p>
              </div>

              <div className="flex gap-3 pt-2">
                {(localStorage.getItem('huanxi_api_key') || localStorage.getItem('huanxi_base_url')) && (
                   <button
                    onClick={handleClearKey}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    重置
                  </button>
                )}
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaveDisabled}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-purple-900/20"
                >
                  <Save className="w-4 h-4" />
                  保存并继续
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;