import { GoogleGenAI, Type } from "@google/genai";
import { ShotAnalysis } from "../types";

// Models mapping
const MODEL_ANALYSIS = 'gemini-2.5-flash';
const MODEL_IMAGE_GEN = 'gemini-2.5-flash-image'; // Nano Banana

/**
 * Utility: Wait for a specified duration (ms)
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to patch window.fetch temporarily to inject headers.
 * Adds 'Authorization: Bearer' and 'x-goog-api-key' for proxies that need them.
 */
const withAuthHeaderInjection = async <T>(
    apiKey: string, 
    baseUrl: string | undefined, 
    fn: () => Promise<T>
): Promise<T> => {
    // Check if we need to patch.
    // 1. BaseURL is present (Custom Proxy)
    // 2. OR Key starts with "sk-" (OpenAI-compatible / Proxy Key)
    const isProxyKey = apiKey.startsWith("sk-");
    const needsPatch = !!baseUrl || isProxyKey;

    if (!needsPatch) {
        return fn();
    }

    const originalFetch = window.fetch;
    
    // Patch fetch
    window.fetch = async (input, init) => {
        const urlStr = input.toString();
        
        // Determine if this request is targeting our custom base or google
        const targetBase = baseUrl ? baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'googleapis.com';
        
        // Only modify requests going to our target
        if (urlStr.includes(targetBase)) {
            init = init || {};
            init.headers = new Headers(init.headers);
            
            // Inject Headers - Additive only, do not remove query params.
            // Many proxies expect the key in the Authorization header.
            if (!init.headers.has("Authorization")) {
                init.headers.set("Authorization", `Bearer ${apiKey}`);
            }
            
            // Also inject x-goog-api-key for compatibility
            if (!init.headers.has("x-goog-api-key")) {
                init.headers.set("x-goog-api-key", apiKey);
            }

            // NOTE: We do NOT remove the 'key' query param anymore. 
            // The SDK adds it automatically (using the real key now).
            // Removing it caused issues with some proxies that strictly validated the URL param.
            
            return originalFetch(urlStr, init);
        }
        return originalFetch(input, init);
    };

    try {
        return await fn();
    } finally {
        // Restore fetch immediately
        window.fetch = originalFetch;
    }
};

/**
 * Retry wrapper for API calls.
 * Handles 429 (Quota Exceeded) and 5xx errors.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
    let currentDelay = initialDelay;
    
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const msg = error.message || "";
            const isQuotaError = msg.includes("429") || msg.includes("Quota exceeded") || error.status === 429;
            const isServerError = msg.includes("500") || msg.includes("502") || msg.includes("503");
            const isLoadError = msg.includes("Failed to fetch") || msg.includes("Load failed");
            
            // If it's the last retry, throw
            if (i === retries - 1) throw error;

            if (isQuotaError || isServerError || isLoadError) {
                console.warn(`API Error (${isQuotaError ? 'Quota' : 'Network/Server'}). Retrying in ${currentDelay}ms... (Attempt ${i + 1}/${retries})`);
                await delay(currentDelay);
                currentDelay *= 2; // Exponential backoff
            } else {
                throw error; // Throw other errors immediately (e.g., Auth error)
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
        // Remove version suffixes to ensure clean base - SDK appends version
        finalBaseUrl = finalBaseUrl.replace(/(\/v1beta|\/v1|\/google|\/goog)$/i, '');
    }

    // CRITICAL FIX: Always use the REAL API Key.
    // Previous usage of dummy key caused standard Google calls to fail auth,
    // and caused proxies to fail if they validated the `key` query param.
    return new GoogleGenAI({ 
        apiKey: apiKey, 
        baseUrl: finalBaseUrl 
    });
};

/**
 * Analyzes a video frame to extract filmmaking notes and an image prompt.
 */
export const analyzeFrameWithGemini = async (base64Image: string, apiKey: string, baseUrl?: string): Promise<ShotAnalysis> => {
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

  // Wrap with Retry and Header Injection
  return withRetry(async () => {
    return withAuthHeaderInjection(apiKey, baseUrl, async () => {
        const ai = createAIClient(apiKey, baseUrl);
        
        // Clean base64 string
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
              // Handle non-JSON responses (often HTML errors from proxies)
              if (text.trim().startsWith("<")) {
                  // Extract title from HTML if possible
                  const titleMatch = text.match(/<title>(.*?)<\/title>/i);
                  const title = titleMatch ? titleMatch[1] : "Unknown HTML Error";
                  throw new Error(`Proxy Error: ${title}. Content: ${text.substring(0, 50)}...`);
              }
              throw new Error("JSON Parse Error");
          }

        } catch (error: any) {
          console.error("Gemini Analysis Error:", error);
          if (error.message) throw error;
          throw new Error("Gemini Request Failed");
        }
    });
  }, 3, 2000); // Retry 3 times, start with 2s delay
};

/**
 * Generates an image using the "Nano Banana" model based on a prompt.
 */
export const generateImageWithNanoBanana = async (prompt: string, apiKey: string, baseUrl?: string): Promise<string> => {
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

  return withRetry(async () => {
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
                }
              }
            });

            if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  return `data:image/png;base64,${part.inlineData.data}`;
                }
              }
            }
            throw new Error("响应中未找到图片数据");

          } catch (error: any) {
            console.error("Nano Banana Generation Error:", error);
            if (error.message) throw error;
            throw new Error("生成图片失败");
          }
      });
  }, 2, 2000);
};