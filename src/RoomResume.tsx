import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ErrorBox } from "./ui";
GlobalWorkerOptions.workerSrc = pdfWorker;

export default function RoomResume({
  id,
  resumeId,
}: {
  id: string;
  resumeId: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setPdf(null);
    setPage(1);
    setError("");
    let active = true;
    const task = getDocument({
      url: `/api/interviews/${id}/room/resume/pdf`,
      withCredentials: true,
      isEvalSupported: false,
      useWasm: false,
    });
    void task.promise
      .then((value) => {
        if (active) setPdf(value);
      })
      .catch(() => {
        if (active)
          setError(
            "The resume could not be opened. Check your connection and sharing permission, then retry.",
          );
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [id, resumeId, attempt]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true,
      render: RenderTask | undefined;
    const element = canvas.current;
    void (async () => {
      const documentPage = await pdf.getPage(page);
      if (!active) return;
      const viewport = documentPage.getViewport({ scale: zoom });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.floor(viewport.width * dpr);
      element.height = Math.floor(viewport.height * dpr);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      render = documentPage.render({
        canvas: element,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      await render.promise;
      const content = await documentPage.getTextContent();
      if (active)
        setText(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
    })().catch((e) => {
      if (active && e.name !== "RenderingCancelledException")
        setError("This PDF page could not be rendered.");
    });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page, zoom]);
  return (
    <div className="meeting-pdf">
      <div className="meeting-toolbar" aria-label="Resume viewer controls">
        <button
          className="btn secondary"
          disabled={!pdf || page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous page
        </button>
        <span aria-live="polite">
          Page {page} / {pdf?.numPages || "…"}
        </span>
        <button
          className="btn secondary"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
        <label>
          Zoom{" "}
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.6, 0.8, 1, 1.25, 1.5, 2].map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox message={error} />
      {error && (
        <button
          className="btn secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry resume
        </button>
      )}
      {!pdf && !error && <p role="status">Opening secure resume…</p>}
      <div className="meeting-pdf-page">
        <canvas ref={canvas} aria-label={`Resume page ${page}`} />
      </div>
      {pdf && (
        <details>
          <summary>Accessible text for this page</summary>
          <p>
            {text ||
              "This page has no selectable text. It may contain a scanned image."}
          </p>
        </details>
      )}
    </div>
  );
}
