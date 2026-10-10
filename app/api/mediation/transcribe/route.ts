import { NextResponse } from "next/server";
import { transcribeChatScreenshot } from "@/lib/llm/provider";

const MAX_DATA_URL_LENGTH = 7_000_000; // ~5MB image after base64 overhead

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { imageDataUrl?: string; selfName?: string; otherName?: string };
    const imageDataUrl = body.imageDataUrl || "";

    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "请上传有效的图片。" }, { status: 400 });
    }
    if (imageDataUrl.length > MAX_DATA_URL_LENGTH) {
      return NextResponse.json({ error: "图片太大，请压缩后重试。" }, { status: 400 });
    }

    const selfName = (body.selfName || "我").trim().slice(0, 10) || "我";
    const otherName = (body.otherName || "对方").trim().slice(0, 10) || "对方";

    const transcript = await transcribeChatScreenshot({ imageDataUrl, selfName, otherName });
    return NextResponse.json({ transcript });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "识别失败，请重试。" }, { status: 500 });
  }
}
