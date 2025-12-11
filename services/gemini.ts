import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ShotAnalysis } from "../types";

// Models mapping
const MODEL_ANALYSIS = 'gemini-2.5-flash';
const MODEL_IMAGE_GEN = 'gemini-2.5-flash-image'; // Nano Banana

/**
 * Concurrency Queue Manager (High Speed Mode)
 * Limits simultaneous requests simply to manage network load, but does not block globally on errors.
 */
class RequestQueue {
  private concurrency: number;
  private active: number;
  private queue: Array<() => void>;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.active++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          this.next();
        }
      };

      if (this.active < this.concurrency) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private next() {
    if (this.active < this.concurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }
}

// Concurrency increased to 5 for maximum speed as requested.
const apiQueue = new RequestQueue(5);

/**
 * Utility: Wait for a specified duration (ms)
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to patch window.fetch temporarily to inject headers.
 */
const withAuthHeaderInjection = async <T>(
    apiKey: string, 
    baseUrl: string | undefined, 
    fn: () => Promise<T>
): Promise<T> => {
    const isProxyKey = apiKey.startsWith("sk-");
    const needsPatch = !!baseUrl || isProxyKey;

    if (!needsPatch) {
        return fn();
    }

    const originalFetch = window.fetch;
    
    window.fetch = async (input, init) => {
        const urlStr = input.toString();
        
        const shouldIntercept = baseUrl 
            ? urlStr.includes(baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')) 
            : true;
        
        if (shouldIntercept) {
            init = init || {};
            const headers = new Headers(init.headers);
            
            if (!headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${apiKey}`);
            }
            if (!headers.has("x-goog-api-key")) {
                headers.set("x-goog-api-key", apiKey);
            }
            
            init.headers = headers;
            return originalFetch(urlStr, init);
        }
        return originalFetch(input, init);
    };

    try {
        return await fn();
    } finally {
        window.fetch = originalFetch;
    }
};

/**
 * Retry wrapper for API calls.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 1000): Promise<T> {
    let currentDelay = initialDelay;
    
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const msg = error.message || "";
            const isQuotaError = msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || error.status === 429;
            const isServerError = msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("Overloaded");
            
            if (i === retries - 1) throw error;

            if (isQuotaError || isServerError) {
                // Linear backoff instead of exponential to retry faster
                const waitTime = currentDelay; 
                console.warn(`API Error (${isQuotaError ? '429' : 'Server'}). Retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
                await delay(waitTime);
                // currentDelay *= 1.5; // Removed exponential increase for speed
            } else {
                throw error;
            }
        }
    }
    throw new Error("Retry failed");
}

/**
 * Creates a configured GoogleGenAI instance.
 */
const createAIClient = (apiKey: string, baseUrl?: string) => {
    let finalBaseUrl = baseUrl ? baseUrl.trim() : undefined;
    
    if (finalBaseUrl) {
        if (!/^https?:\/\//i.test(finalBaseUrl)) {
            finalBaseUrl = `https://${finalBaseUrl}`;
        }
        if (finalBaseUrl.endsWith('/')) {
            finalBaseUrl = finalBaseUrl.slice(0, -1);
        }
        finalBaseUrl = finalBaseUrl.replace(/\/v1beta\/?$/i, '').replace(/\/v1\/?$/i, '');
    }

    return new GoogleGenAI({ 
        apiKey: apiKey, 
        baseUrl: finalBaseUrl 
    });
};

/**
 * Analyzes a video frame.
 */
export const analyzeFrameWithGemini = async (base64Image: string, apiKey: string, baseUrl?: string): Promise<ShotAnalysis> => {
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

  // Queue manages concurrency (5)
  return apiQueue.add(() => withRetry(async () => {
    return withAuthHeaderInjection(apiKey, baseUrl, async () => {
        const ai = createAIClient(apiKey, baseUrl);
        const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

        const prompt = `
          作为一名资深的电影摄影师和拉片专家，请深入分析这张电影画面。
          请提供以下 JSON 格式的输出 (所有描述性文字请使用中文，aiPrompt 使用英文)：

          1. visualDescription: 画面内容描述 (客观描述画面中的人物、动作、环境)。
          2. shotSize: 景别 (如：特写、中景、全景、大远景等)。
          3. cameraMovement: 推测的镜头运动 (如：固定镜头、推轨、手持跟拍、摇镜头等。如果是静态图看不出，请根据构图推测最可能的运镜方式)。
          4. lightingAndColor: 光影与色彩分析 (如：侧逆光、高对比度、赛博朋克霓虹色调、低饱和度冷调等)。
          5. soundAtmosphere: 建议的音乐与音效氛围 (如：紧张的弦乐、嘈杂的街道环境音、寂静无声、轻快的钢琴曲等)。
          6. aiPrompt: 一个用于 Midjourney 或 Gemini Image Model 的**高质量英文提示词**。
             - 格式要求：[Subject Description], [Environment], [Lighting & Color], [Camera Angle/Shot Size], [Style/Aesthetics].
             - 必须包含美学关键词：cinematic lighting, photorealistic, 8k, highly detailed, film grain, shot on 35mm lens, masterpiece.
             - 目标是生成一张在构图、光影和质感上都极度接近原图的电影感画面。
        `;

        try {
          const response = await ai.models.generateContent({
            model: MODEL_ANALYSIS,
            contents: {
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
                { text: prompt }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  visualDescription: { type: Type.STRING },
                  shotSize: { type: Type.STRING },
                  cameraMovement: { type: Type.STRING },
                  lightingAndColor: { type: Type.STRING },
                  soundAtmosphere: { type: Type.STRING },
                  aiPrompt: { type: Type.STRING },
                },
                required: ["visualDescription", "shotSize", "cameraMovement", "lightingAndColor", "soundAtmosphere", "aiPrompt"],
              }
            }
          });

          const text = response.text;
          if (!text) throw new Error("API 返回内容为空");

          try {
              return JSON.parse(text) as ShotAnalysis;
          } catch (e) {
              if (text.trim().startsWith("<")) {
                  const titleMatch = text.match(/<title>(.*?)<\/title>/i);
                  const title = titleMatch ? titleMatch[1] : "Unknown HTML Error";
                  throw new Error(`Proxy Error: ${title}`);
              }
              throw new Error("JSON Parse Error");
          }

        } catch (error: any) {
          console.error("Gemini Analysis Error:", error);
          if (error.message) throw error;
          throw new Error("Gemini Request Failed");
        }
    });
  }, 3, 1000));
};

/**
 * Generates an image using Nano Banana.
 */
export const generateImageWithNanoBanana = async (prompt: string, apiKey: string, baseUrl?: string): Promise<string> => {
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

  // Queue manages concurrency (5)
  return apiQueue.add(() => withRetry(async () => {
      return withAuthHeaderInjection(apiKey, baseUrl, async () => {
          const ai = createAIClient(apiKey, baseUrl);

          try {
            const response = await ai.models.generateContent({
              model: MODEL_IMAGE_GEN,
              contents: {
                parts: [
                  { text: prompt }
                ]
              },
              config: {
                imageConfig: {
                  aspectRatio: "16:9", 
                },
                // Add Safety Settings to BLOCK_NONE to prevent model from refusing prompts
                safetySettings: [
                  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ]
              }
            });

            if (response.candidates && response.candidates.length > 0) {
                 const parts = response.candidates[0].content?.parts;
                 if (parts) {
                     for (const part of parts) {
                        if (part.inlineData && part.inlineData.data) {
                          return `data:image/png;base64,${part.inlineData.data}`;
                        }
                     }
                 }
            }
            
            if (response.text) {
                console.warn("Nano Banana returned text instead of image:", response.text);
                throw new Error("模型拒绝生成图片 (安全拦截)");
            }

            throw new Error("响应中未找到图片数据");

          } catch (error: any) {
            console.error("Nano Banana Generation Error:", error);
            if (error.message) throw error;
            throw new Error("生成图片失败");
          }
      });
  }, 2, 1000));
};