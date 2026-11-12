import { NextResponse, type NextRequest } from "next/server";
import { orchestrate } from "@/lib/orchestrate";
import { readImageText } from "@/lib/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Image inquiry: OCR the image with the vision model, then run the SAME
// six-node pipeline on the transcribed text. Image results are always tagged
// "needs confirmation" (per the report — handwriting is the weak link).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl = typeof body?.image === "string" ? body.image : "";

    if (!dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Please upload a valid image." }, { status: 400 });
    }
    // Vercel serverless body limit is ~4.5 MB; data URLs are ~1.33× the binary size.
    if (dataUrl.length > 4_500_000) {
      return NextResponse.json({ error: "Image too large (max ~3 MB)." }, { status: 413 });
    }

    const ocrText = (await readImageText(dataUrl)).trim();
    if (!ocrText) {
      return NextResponse.json({ error: "Could not read any text from this image." }, { status: 422 });
    }

    const result = await orchestrate(ocrText);
    result.source = "image";
    result.ocrText = ocrText;
    result.warnings.unshift("Image input — transcribed text must be confirmed by engineering before a quote is issued.");

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to process the image" },
      { status: 500 }
    );
  }
}
