import { GoogleGenAI, Type } from "@google/genai";
import { ShotAnalysis } from "../types";

// Models mapping
const MODEL_ANALYSIS = 'gemini-2.5-flash';
const MODEL_IMAGE_GEN = 'gemini-2.5-flash-image'; // Nano Banana

/**
 * Creates a configured GoogleGenAI instance.
 * Automatically handles proxy-specific logic (stripping trailing slash, using dummy key if needed).
 */
const createAIClient = (apiKey: string, baseUrl?: string) => {
    // If baseUrl is provided, the apiKey can sometimes be empty or dummy in certain proxy setups.
    // However, the SDK requires apiKey to be a string.
    const effectiveKey = apiKey || "dummy_key_for_proxy";
    
    let finalBaseUrl = baseUrl ? baseUrl.trim() : undefined;
    
    if (finalBaseUrl) {
        // 1. Ensure protocol exists
        if (!/^https?:\/\//i.test(finalBaseUrl)) {
            finalBaseUrl = `https://${finalBaseUrl}`;
        }

        // 2. Remove trailing slash
        if (finalBaseUrl.endsWith('/')) {
            finalBaseUrl = finalBaseUrl.slice(0, -1);
        }

        // 3. Smart clean: Remove common API version suffixes that SDK adds automatically.
        // The SDK appends /v1beta (or similar) itself.
        // If user provides 'https://api.proxy.com/v1', we strip it to avoid 'https://api.proxy.com/v1/v1beta'.
        // We strip /v1, /v1beta, /google, /goog if they are at the end.
        finalBaseUrl = finalBaseUrl.replace(/(\/v1beta|\/v1|\/google|\/goog)$/i, '');
    }

    const options: any = { 
        apiKey: effectiveKey, 
        baseUrl: finalBaseUrl 
    };

    // 4. Proxy Compatibility Fix:
    // Many "OneAPI" or relay services use `sk-` keys which require `Authorization: Bearer <key>`.
    // The default SDK behavior puts the key in `x-goog-api-key`.
    // We inject the Authorization header to ensure compatibility with OpenAI-compatible proxies forwarding to Gemini.
    if (finalBaseUrl && effectiveKey && effectiveKey !== "dummy_key_for_proxy") {
        const headers = {
            'Authorization': `Bearer ${effectiveKey}`,
            // Some proxies strictly look for this specific header mapping
            'X-Goog-Api-Key': effectiveKey 
        };
        // Pass to both properties to ensure SDK picks it up depending on version/implementation
        options.customHeaders = headers;
        options.headers = headers;
    }

    return new GoogleGenAI(options);
};

/**
 * Analyzes a video frame to extract filmmaking notes and an image prompt.
 */
export const analyzeFrameWithGemini = async (base64Image: string, apiKey: string, baseUrl?: string): Promise<ShotAnalysis> => {
  // We strictly require either a key OR a baseurl to attempt a request
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

  const ai = createAIClient(apiKey, baseUrl);

  // Clean base64 string if it contains metadata
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
        console.error("JSON Parse Error. Raw text received:", text);
        // If the text looks like HTML (common with proxy errors), throw a descriptive error
        if (text.trim().startsWith("<")) {
            throw new Error(`代理服务返回了 HTML (可能是 404/502 错误)。请检查 Base URL 是否正确。收到的内容: ${text.substring(0, 30)}...`);
        }
        throw new Error("无法解析 API 返回的 JSON 数据。");
    }

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    // Pass through specific error messages
    if (error.message) {
        throw error;
    }
    throw new Error("未知错误，请检查控制台");
  }
};

/**
 * Generates an image using the "Nano Banana" model based on a prompt.
 */
export const generateImageWithNanoBanana = async (prompt: string, apiKey: string, baseUrl?: string): Promise<string> => {
  if (!apiKey && !baseUrl) {
    throw new Error("请在设置中配置 API Key 或 Base URL");
  }

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

    // Extract image from response parts
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
};