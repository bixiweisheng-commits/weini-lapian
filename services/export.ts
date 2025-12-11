import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } from "docx";
import FileSaver from "file-saver";
import { Shot } from "../types";

// Helper to convert base64 to Uint8Array for docx
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const exportToWord = async (shots: Shot[]) => {
  if (shots.length === 0) return;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "欢玺AI - 智能拉片报告",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          
          ...shots.flatMap((shot, index) => {
            const shotRows = [];

            // Title for the shot
            shotRows.push(
              new Paragraph({
                children: [
                    new TextRun({
                        text: `镜头 ${index + 1} (时间点: ${formatTime(shot.timestamp)})`,
                        bold: true,
                        size: 28,
                    })
                ],
                spacing: { before: 400, after: 200 },
                heading: HeadingLevel.HEADING_2,
              })
            );

            // Analysis Content
            if (shot.analysis) {
                // Determine image to show (Original)
                // Note: Adding images increases file size significantly. 
                // We constrain width to 300px (approx) to keep it manageable.
                let imageParagraph = new Paragraph({ text: "[图片加载失败]" });
                try {
                    const imageBytes = base64ToUint8Array(shot.originalImage);
                    imageParagraph = new Paragraph({
                        children: [
                            new ImageRun({
                                data: imageBytes,
                                transformation: {
                                    width: 300,
                                    height: 168, // 16:9 approx
                                },
                            }),
                        ],
                    });
                } catch (e) {
                    console.error("Error processing image for docx", e);
                }

                // Create a table for layout: Image Left, Text Right (Simulated with vertical stack for reliability)
                // Actually, vertical stack is cleaner for Word documents generated client-side.
                
                shotRows.push(imageParagraph);

                const createInfoRow = (label: string, value: string) => {
                    return new Paragraph({
                        children: [
                            new TextRun({ text: `${label}: `, bold: true }),
                            new TextRun({ text: value }),
                        ],
                        spacing: { after: 100 },
                    });
                };

                shotRows.push(new Paragraph({ text: "", spacing: { after: 100 } })); // Spacer
                shotRows.push(createInfoRow("时长", `${shot.duration} 秒`));
                shotRows.push(createInfoRow("景别", shot.analysis.shotSize));
                shotRows.push(createInfoRow("运镜", shot.analysis.cameraMovement));
                shotRows.push(createInfoRow("画面内容", shot.analysis.visualDescription));
                shotRows.push(createInfoRow("光影色彩", shot.analysis.lightingAndColor));
                shotRows.push(createInfoRow("声音氛围", shot.analysis.soundAtmosphere));
                
                // Prompt Box
                shotRows.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: "AI 提示词 (Prompt):", bold: true, color: "5b21b6" }),
                        ],
                        spacing: { before: 200, after: 100 },
                    })
                );
                
                shotRows.push(
                    new Paragraph({
                        children: [
                            new TextRun({ 
                                text: shot.analysis.aiPrompt, 
                                font: "Courier New",
                                size: 20 
                            }),
                        ],
                        border: {
                            left: { color: "cccccc", space: 10, style: BorderStyle.SINGLE, size: 6 },
                        },
                        spacing: { after: 400 },
                    })
                );
            }

            // Divider
            shotRows.push(
                new Paragraph({
                    text: "________________________________________________________________________________",
                    color: "E5E7EB",
                    spacing: { after: 200 },
                })
            );

            return shotRows;
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  FileSaver.saveAs(blob, `欢玺AI_拉片报告_${new Date().toISOString().slice(0, 10)}.docx`);
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };