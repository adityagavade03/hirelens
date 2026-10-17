import { PDFParse } from "pdf-parse";
import { ApiError } from "./security.js";
import { config } from "./config.js";
import { access } from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
let processing = false;
export async function extractResume(data: Buffer) {
  return (await extractResumeDetailed(data)).text;
}
export async function extractResumeDetailed(data: Buffer) {
  if (data.subarray(0, 5).toString() !== "%PDF-")
    throw new ApiError(400, "Upload a valid PDF resume.");
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    if (info.total > 30)
      throw new ApiError(422, "Resumes must have at most 30 pages.");
    const result = await parser.getText();
    let text = result.text.replace(/--\s*\d+ of \d+\s*--/g, "").trim();
    const scanned = result.pages.filter((p) => p.text.trim().length < 30);
    let method = "pdf-text";
    if (scanned.length && config.ocrEnabled) {
      if (result.total > 8)
        throw new ApiError(
          422,
          "Scanned resumes must have at most 8 pages. Upload a shorter PDF.",
        );
      if (processing)
        throw new ApiError(
          429,
          "Another scanned resume is being read. Please try again shortly.",
        );
      try {
        await access(path.join(config.ocrPath, "eng.traineddata.gz"));
      } catch {
        throw new ApiError(
          503,
          "OCR language data is missing. Run npm run setup:assets on the server.",
        );
      }
      processing = true;
      let cancelled = false;
      let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = async () => {
          worker = await createWorker("eng", 1, {
            langPath: path.resolve(config.ocrPath),
            cacheMethod: "none",
            errorHandler: () => {},
          });
          if (cancelled) {
            await worker.terminate();
            throw new ApiError(422, "OCR timed out.");
          }
          const pages: string[] = [];
          for (const page of result.pages) {
            if (page.text.trim().length >= 30) {
              pages.push(page.text);
              continue;
            }
            const size = info.pages.find((p) => p.pageNumber === page.num);
            if (!size || size.width <= 0 || size.height / size.width > 3)
              throw new ApiError(
                422,
                "Use standard A4 or Letter pages for scanned resumes.",
              );
            const rendered = await parser.getScreenshot({
              partial: [page.num],
              desiredWidth: 1600,
              imageDataUrl: false,
              imageBuffer: true,
            });
            if (!rendered.pages[0] || rendered.pages[0].height > 5000)
              throw new ApiError(
                422,
                "This scanned page is too large. Export a standard A4 or Letter PDF.",
              );
            const recognized = await worker.recognize(
              Buffer.from(rendered.pages[0].data),
            );
            pages.push(recognized.data.text);
          }
          return pages.join("\n").trim();
        };
        text = await Promise.race([
          work(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new ApiError(
                    422,
                    "OCR took too long. Upload a clearer, shorter scan.",
                  ),
                ),
              90000,
            );
          }),
        ]);
        method = "local-ocr";
      } finally {
        cancelled = true;
        if (timer) clearTimeout(timer);
        await worker?.terminate();
        processing = false;
      }
    }
    if (text.length < 30)
      throw new ApiError(
        422,
        config.ocrEnabled
          ? "This PDF has too little readable text, even after OCR. Upload a clearer resume."
          : "This PDF has too little readable text. Enable local OCR or upload a text-readable PDF.",
      );
    return { text: text.slice(0, 100000), method };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      422,
      "This PDF could not be read. It may be encrypted, damaged, or scanned. Export a text-readable PDF.",
    );
  } finally {
    await parser.destroy();
  }
}
