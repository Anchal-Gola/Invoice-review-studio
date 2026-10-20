
import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function isPdfFile(file) {
  return (
    file?.type === "application/pdf" ||
    file?.name?.toLowerCase().endsWith(".pdf")
  );
}

function formatTimestamp() {
  return new Date().toLocaleString();
}

export default function Review({
  invoice,
  onUpdate,
  onBack,
  initialFile = null,
  fileLoading = false,
  storageError = "",
  onFileChange,
}) {
  const [file, setFile] = useState(initialFile || null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(0);
  const [pdfError, setPdfError] = useState("");

  const pdfCanvasRef = useRef(null);

  useEffect(() => {
    setFile(initialFile || null);
  }, [initialFile]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file || !isPdfFile(file) || !previewUrl) return undefined;

    let cancelled = false;
    let loadingTask;
    let renderTask;

    async function renderPdfPage() {
      setPdfError("");

      try {
        const bytes = await file.arrayBuffer();

        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = pdfCanvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          throw new Error("PDF canvas is unavailable.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });

        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          console.error("PDF preview error:", error);
          setPdfError(
            "Could not display this PDF. Try selecting the file again."
          );
        }
      }
    }

    renderPdfPage();

    return () => {
      cancelled = true;

      try {
        renderTask?.cancel();
      } catch {
        // Rendering may already have completed.
      }

      try {
        loadingTask?.destroy();
      } catch {
        // The loading task may already have closed.
      }
    };
  }, [file, previewUrl]);

  function addHistory(entry) {
    setHistory((previous) => [
      `${formatTimestamp()} — ${entry}`,
      ...previous,
    ]);
  }

  function updateField(field, value) {
    onUpdate({ ...invoice, [field]: value });
  }

  function selectFile(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";

    if (!selected) return;

    const validPdf = isPdfFile(selected);
    const validImage = selected.type.startsWith("image/");

    if (!validPdf && !validImage) {
      setMessage("Please choose a PDF or image file.");
      return;
    }

    if (selected.size > 15 * 1024 * 1024) {
      setMessage("File size must be less than 15 MB.");
      return;
    }

    setFile(selected);
    onFileChange?.(selected);
    setResult(null);
    setProgress(0);
    setPdfError("");
    setMessage("File selected. Click Submit for Analysis.");
    addHistory(`Selected ${selected.name}`);
  }

  function removeFile() {
    setFile(null);
    onFileChange?.(null);
    setResult(null);
    setProgress(0);
    setPdfError("");
    setMessage("File removed. Select the correct document.");
    addHistory("Removed document");
  }

  async function recognizeImage(source) {
    const output = await Tesseract.recognize(source, "eng", {
      logger: (info) => {
        if (info.status === "recognizing text") {
          setProgress(Math.round((info.progress || 0) * 100));
        }
      },
    });

    return output.data.text || "";
  }

  async function extractDocumentText(selectedFile) {
    if (!isPdfFile(selectedFile)) {
      return recognizeImage(selectedFile);
    }

    const pdf = await pdfjsLib.getDocument({
      data: await selectedFile.arrayBuffer(),
    }).promise;

    let text = "";

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      setMessage(`Reading PDF page ${pageNumber} of ${pdf.numPages}...`);

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      let pageText = "";

      for (const item of content.items) {
        if (!("str" in item)) continue;

        pageText += item.str || "";
        pageText += item.hasEOL ? "\n" : " ";
      }

      if (pageText.trim().length > 15) {
        text += `${pageText}\n`;
      } else {
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create a PDF rendering context.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        text += `${await recognizeImage(canvas.toDataURL("image/png"))}\n`;
      }
    }

    return text;
  }

  function analyseText(text) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const flatText = lines.join("\n");

    const invoicePatterns = [
      /\binvoice\s*(?:number|no\.?|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i,
      /\binv\.?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i,
      /\binvoice\s*[:#-]\s*([A-Z0-9][A-Z0-9/-]{2,})/i,
    ];

    let invoiceNumber = "";

    for (const pattern of invoicePatterns) {
      const match = flatText.match(pattern);

      if (match) {
        invoiceNumber = match[1].replace(/[.,;:]$/, "");
        break;
      }
    }

    const datePatterns = [
      /\b(\d{4}-\d{2}-\d{2})\b/,
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
      /\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i,
      /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i,
    ];

    let date = "";

    for (const line of lines) {
      if (/\binvoice\s*date\b/i.test(line)) {
        for (const pattern of datePatterns) {
          const match = line.match(pattern);
          if (match) {
            date = match[1];
            break;
          }
        }
      }

      if (date) break;
    }

    if (!date) {
      for (const line of lines) {
        if (/\bdue\s*date\b/i.test(line)) continue;

        for (const pattern of datePatterns) {
          const match = line.match(pattern);
          if (match) {
            date = match[1];
            break;
          }
        }

        if (date) break;
      }
    }

    const amountPatterns = [
      /\bgrand\s*total\b/i,
      /\btotal\s*due\b/i,
      /\bamount\s*due\b/i,
      /\binvoice\s*total\b/i,
      /\btotal\s*amount\b/i,
      /\bbalance\s*due\b/i,
    ];

    const parseAmounts = (line) =>
      [
        ...line.matchAll(
          /(?:₹|INR|Rs\.?|USD|\$)?\s*([\d,]+(?:\.\d{1,2})?)/gi
        ),
      ]
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((value) => Number.isFinite(value) && value > 0);

    let amount = "";

    for (const pattern of amountPatterns) {
      const matchingLines = lines.filter((line) => pattern.test(line));

      for (const line of matchingLines) {
        const values = parseAmounts(line);

        if (values.length) {
          amount = String(values[values.length - 1]);
          break;
        }
      }

      if (amount) break;
    }

    const excludedLine = (line) =>
      /https?:|www\.|@|GSTIN|email:|phone:|mobile:|invoice|amount due|grand total|total due|invoice date|due date|bill to|ship to|description|quantity|subtotal|balance due|payment terms|unit price|tax\b|items\s*&?\s*services/i.test(
        line
      );

    const vendorCandidates = lines.filter(
      (line) =>
        line.length >= 3 &&
        line.length <= 100 &&
        !excludedLine(line) &&
        !/^[\d\s.,:/-]+$/.test(line)
    );

    const vendor = vendorCandidates[0] || "";
    const warnings = [];

    if (!vendor) warnings.push("Vendor name could not be confidently detected.");
    if (!invoiceNumber) warnings.push("Invoice number could not be confidently detected.");
    if (!date) warnings.push("Invoice date could not be detected.");
    if (!amount) warnings.push("Total amount could not be detected.");

    return {
      text,
      vendor,
      invoiceNumber,
      date,
      amount,
      warnings,
    };
  }

  async function submitAnalysis() {
    if (!file) {
      setMessage("Select a PDF or image before submitting.");
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress(0);
    setMessage("Analysing your uploaded document...");

    try {
      const text = await extractDocumentText(file);
      const analysis = analyseText(text);

      setResult(analysis);
      addHistory(`Analysed ${file.name}`);

      setMessage(
        text.trim()
          ? "Analysis complete. Verify the detected values below."
          : "No readable text found. Try a clearer PDF or photo."
      );
    } catch (error) {
      console.error("Invoice analysis error:", error);
      setMessage("Analysis failed. Try a clearer or different document.");
    } finally {
      setLoading(false);
    }
  }

  function convertDate(value) {
    if (!value) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      const check = new Date(year, month - 1, day);

      return check.getFullYear() === year &&
        check.getMonth() === month - 1 &&
        check.getDate() === day
        ? value
        : "";
    }

    const monthNames = {
      jan: 1, january: 1, feb: 2, february: 2,
      mar: 3, march: 3, apr: 4, april: 4,
      may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, sept: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11,
      dec: 12, december: 12,
    };

    let day;
    let month;
    let year;

    const named = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    const namedFirst = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);

    if (named) {
      day = Number(named[1]);
      month = monthNames[named[2].toLowerCase()];
      year = Number(named[3]);
    } else if (namedFirst) {
      month = monthNames[namedFirst[1].toLowerCase()];
      day = Number(namedFirst[2]);
      year = Number(namedFirst[3]);
    } else {
      const parts = value.split(/[/-]/).map(Number);

      if (parts.length !== 3 || parts.some(Number.isNaN)) return "";

      if (String(value).split(/[/-]/)[0].length === 4) {
        [year, month, day] = parts;
      } else {
        [day, month, year] = parts;
      }

      if (year < 100) year += 2000;
    }

    if (!month || !day || !year) return "";

    const parsed = new Date(year, month - 1, day);

    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return "";
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function applyResults() {
    if (!result) return;

    const updated = { ...invoice };

    if (result.vendor) updated.vendor = result.vendor;
    if (result.invoiceNumber) updated.id = result.invoiceNumber;
    if (result.amount) updated.amount = result.amount;

    const parsedDate = convertDate(result.date);
    if (parsedDate) updated.date = parsedDate;

    onUpdate(updated);
    setMessage("Detected fields applied. Please verify all values manually.");
    addHistory("Applied extracted fields to invoice");
  }

  function saveChanges() {
    if (!String(invoice.vendor || "").trim()) {
      setMessage("Please enter a vendor name.");
      return;
    }

    if (
      !invoice.amount ||
      !Number.isFinite(Number(invoice.amount)) ||
      Number(invoice.amount) <= 0
    ) {
      setMessage("Please enter a valid amount.");
      return;
    }

    setMessage("Invoice details saved successfully.");
    addHistory("Invoice details saved");
  }

  function decide(status) {
    if (
      !String(invoice.vendor || "").trim() ||
      !invoice.amount ||
      !Number.isFinite(Number(invoice.amount)) ||
      Number(invoice.amount) <= 0
    ) {
      setMessage("Enter the vendor name and a valid amount before deciding.");
      return;
    }

    onUpdate({ ...invoice, status });
    setMessage(`Invoice marked as ${status}.`);
    addHistory(`Invoice ${status}`);
  }

  return (
    <main className="page-content">
      <button className="back-button" onClick={onBack}>
        ← Back to dashboard
      </button>

      <div className="page-heading">
        <div>
          <p className="eyebrow">INVOICE WORKSPACE</p>
          <h1>Review invoice</h1>
          <p>Review this invoice, verify extracted fields and record changes.</p>
        </div>

        <span
          className={`status ${String(invoice.status || "")
            .toLowerCase()
            .replaceAll(" ", "-")}`}
        >
          {invoice.status}
        </span>
      </div>

      <div className="review-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Invoice information</h2>
              <p>Review and edit invoice details directly in this form.</p>
            </div>
          </div>

          <label>Invoice number</label>
          <input
            value={invoice.id ?? ""}
            placeholder="Enter invoice number"
            onChange={(event) => updateField("id", event.target.value)}
          />

          <label>Vendor name</label>
          <input
            value={invoice.vendor ?? ""}
            placeholder="Enter vendor name"
            onChange={(event) => updateField("vendor", event.target.value)}
          />

          <label>Invoice date</label>
          <input
            type="date"
            value={invoice.date ?? ""}
            onChange={(event) => updateField("date", event.target.value)}
          />

          <label>Total amount (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={invoice.amount ?? ""}
            placeholder="Enter total amount"
            onChange={(event) => updateField("amount", event.target.value)}
          />

          <div className="button-row">
            <button className="primary-button" onClick={saveChanges}>
              Save changes
            </button>
          </div>

          <div className="decision-row">
            <button className="approve-button" onClick={() => decide("Approved")}>
              ✓ Approve invoice
            </button>

            <button className="reject-button" onClick={() => decide("Rejected")}>
              ✕ Reject
            </button>

            <button className="review-button" onClick={() => decide("Needs review")}>
              Needs review
            </button>
          </div>

          <h3 className="history-title">Change log</h3>
          <p className="muted">
            Changes made to the invoice fields can be reviewed here.
          </p>
        </section>

        <section className="panel document-panel">
          <div className="panel-heading">
            <div>
              <h2>Document viewer</h2>
              <p>Preview the uploaded document and analyse its text.</p>
            </div>
          </div>

          {fileLoading && (
            <p className="feedback" role="status">
              Restoring saved document...
            </p>
          )}

          {storageError && (
            <p className="feedback" role="alert">
              {storageError}
            </p>
          )}

          <label className="upload-area">
            <strong>↑ Choose PDF or photo</strong>
            <span>PDF, JPG, PNG, WEBP and other images · Maximum 15 MB</span>
            <input
              type="file"
              accept="application/pdf,.pdf,image/*"
              onChange={selectFile}
              disabled={loading || fileLoading}
            />
          </label>

          {file && (
            <div className="pdf-actions">
              <span title={file.name}>Selected: {file.name}</span>
              <button
                type="button"
                className="remove-pdf-button"
                onClick={removeFile}
                disabled={loading}
              >
                ✕ Remove file
              </button>
            </div>
          )}

          {previewUrl && (
            <div className="pdf-preview">
              {isPdfFile(file) ? (
                <div className="document-page">
                  <div className="document-canvas-wrap">
                    <canvas
                      ref={pdfCanvasRef}
                      className="document-pdf-canvas"
                    />
                  </div>
                  <p className="document-page-caption">Page 1 preview</p>
                </div>
              ) : (
                <div className="document-page">
                  <div className="document-canvas-wrap">
                    <img
                      src={previewUrl}
                      alt="Selected invoice"
                      className="document-image"
                    />
                  </div>
                  <p className="document-page-caption">Image preview</p>
                </div>
              )}
            </div>
          )}

          {pdfError && (
            <p className="feedback" role="alert">
              {pdfError}
            </p>
          )}

          {!file && !fileLoading && (
            <div className="empty-document">
              <span>▤</span>
              <strong>No document uploaded</strong>
              <p>Choose a PDF or image to preview your invoice.</p>
            </div>
          )}

          <button
            type="button"
            className="primary-button"
            style={{ width: "100%", marginTop: 16 }}
            onClick={submitAnalysis}
            disabled={!file || loading || fileLoading}
          >
            {loading ? "Analysing..." : "Submit for Analysis →"}
          </button>

          {loading && <p className="muted">OCR progress: {progress}%</p>}

          {message && (
            <p className="feedback" role="status">
              {message}
            </p>
          )}

          {result && (
            <section className="analysis-results">
              <h2>OCR Analysis Results</h2>
              <p>Detected data is an estimate. Verify it against the document.</p>

              <div className="result-item">
                <strong>Vendor</strong>
                <span>{result.vendor || "Not detected"}</span>
              </div>

              <div className="result-item">
                <strong>Invoice number</strong>
                <span>{result.invoiceNumber || "Not detected"}</span>
              </div>

              <div className="result-item">
                <strong>Date</strong>
                <span>{result.date || "Not detected"}</span>
              </div>

              <div className="result-item">
                <strong>Total amount</strong>
                <span>
                  {result.amount
                    ? `₹${Number(result.amount).toLocaleString("en-IN")}`
                    : "Not detected"}
                </span>
              </div>

              {result.warnings.length > 0 && (
                <>
                  <h3>Validation warnings</h3>
                  <ul>
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </>
              )}

              <h3>Extracted text</h3>
              <textarea
                value={result.text || "No text extracted."}
                readOnly
                rows={8}
                style={{ width: "100%" }}
              />

              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", marginTop: 12 }}
                onClick={applyResults}
              >
                Apply OCR Results to Invoice
              </button>
            </section>
          )}

          <h3 className="history-title">Activity history</h3>

          {history.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
