
import { useEffect, useState } from "react";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function Review({
  invoice,
  onUpdate,
  onBack,
  initialFile = null,
}) {
  const [file, setFile] = useState(initialFile || null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function updateField(field, value) {
    onUpdate({ ...invoice, [field]: value });
  }

  function selectFile(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";

    if (!selected) return;

    const isPdf =
      selected.type === "application/pdf" ||
      selected.name.toLowerCase().endsWith(".pdf");

    if (!isPdf && !selected.type.startsWith("image/")) {
      setMessage("Please choose a PDF or image file.");
      return;
    }

    if (selected.size > 15 * 1024 * 1024) {
      setMessage("File size must be less than 15 MB.");
      return;
    }

    setFile(selected);
    setResult(null);
    setProgress(0);
    setMessage("File selected. Click Submit for Analysis.");
  }

  function removeFile() {
    setFile(null);
    setResult(null);
    setProgress(0);
    setMessage("File removed. Select the correct document.");
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
    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return recognizeImage(selectedFile);
    }

    const pdf = await pdfjsLib.getDocument({
      data: await selectedFile.arrayBuffer(),
    }).promise;

    let text = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      setMessage(`Reading PDF page ${pageNumber} of ${pdf.numPages}...`);

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      // Preserve PDF line breaks to help identify fields.
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;

        pageText += item.str || "";
        pageText += item.hasEOL ? "\n" : " ";
      }

      if (pageText.trim().length > 15) {
        text += pageText + "\n";
      } else {
        // Scanned PDFs need OCR.
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Could not create a PDF rendering context.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
        text += (await recognizeImage(canvas.toDataURL("image/png"))) + "\n";
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

    // Match labels such as "Invoice Number NS-2026-1042".
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

    // Support ISO, numeric and month-name dates.
    const datePatterns = [
      /\b(\d{4}-\d{2}-\d{2})\b/,
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
      /\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i,
      /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i,
    ];

    let date = "";

    // Prefer the date explicitly associated with Invoice Date.
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

    // Otherwise use the first valid date, avoiding a due date if possible.
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

    // Find the grand total before falling back to other total labels.
    const amountPatterns = [
      /\bgrand\s*total\b/i,
      /\btotal\s*due\b/i,
      /\bamount\s*due\b/i,
      /\binvoice\s*total\b/i,
      /\btotal\s*amount\b/i,
      /\bbalance\s*due\b/i,
    ];

    const parseAmounts = (line) => {
      const matches = [
        ...line.matchAll(/(?:₹|INR|Rs\.?|USD|\$)?\s*([\d,]+(?:\.\d{1,2})?)/gi),
      ];

      return matches
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((value) => Number.isFinite(value) && value > 0);
    };

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

    // Vendor: first meaningful company heading, preferably before invoice details.
    const excludedLine = (line) =>
      /https?:|www\.|@|GSTIN|email:|phone:|mobile:|invoice|amount due|grand total|total due|invoice date|due date|bill to|ship to|description|quantity|subtotal|balance due|payment terms|unit price|tax\b|items\s*&?\s*services/i.test(line);

    const vendorCandidates = lines.filter(
      (line) =>
        line.length >= 3 &&
        line.length <= 100 &&
        !excludedLine(line) &&
        !/^[\d\s.,:/-]+$/.test(line)
    );

    // Prefer the first meaningful heading, such as NORTHSTAR OFFICE SUPPLIES.
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
      setHistory((old) => [
        ...old,
        `${new Date().toLocaleTimeString()} — Analysed ${file.name}`,
      ]);

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

    // Already in the format required by input[type=date].
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      const check = new Date(year, month - 1, day);

      return check.getFullYear() === year &&
        check.getMonth() === month - 1 &&
        check.getDate() === day
        ? value
        : "";
    }

    // Handle dates such as "20 Oct 2026", "Oct 20, 2026",
    // and numeric dates such as "20/10/2026".
    const monthNames = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };

    let day, month, year;
    const named = value.match(
      /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/
    );
    const namedFirst = value.match(
      /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/
    );

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

    // uid is the stable internal identity; id is the displayed invoice number.
    if (result.invoiceNumber) updated.id = result.invoiceNumber;

    if (result.amount) updated.amount = result.amount;

    const parsedDate = convertDate(result.date);
    if (parsedDate) updated.date = parsedDate;

    onUpdate(updated);
    setMessage("Detected fields applied. Please verify all values manually.");
  }

  function saveChanges() {
    if (!invoice.vendor.trim()) {
      setMessage("Please enter a vendor name.");
      return;
    }

    if (!invoice.amount || Number(invoice.amount) <= 0) {
      setMessage("Please enter a valid amount.");
      return;
    }

    // Field changes are sent to App through updateField.
    setMessage("Invoice details saved successfully.");
    setHistory((old) => [
      ...old,
      `${new Date().toLocaleTimeString()} — Invoice details saved`,
    ]);
  }

  function decide(status) {
    if (!invoice.vendor.trim() || !invoice.amount || Number(invoice.amount) <= 0) {
      setMessage("Enter the vendor name and a valid amount before deciding.");
      return;
    }

    onUpdate({ ...invoice, status });
    setMessage(`Invoice marked as ${status}.`);

    setHistory((old) => [
      ...old,
      `${new Date().toLocaleTimeString()} — Invoice ${status}`,
    ]);
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
          <p>Review only this invoice and its uploaded document.</p>
        </div>

        <span className={`status ${invoice.status.toLowerCase().replaceAll(" ", "-")}`}>
          {invoice.status}
        </span>
      </div>

      <div className="review-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Invoice information</h2>
              <p>Apply extracted details or edit them manually.</p>
            </div>
          </div>


          <label>Invoice number</label>
          <input
            value={invoice.id}
            placeholder="Enter invoice number"
            onChange={(e) => updateField("id", e.target.value)}
          />


          <label>Vendor name</label>
          <input
            value={invoice.vendor}
            placeholder="Enter vendor name"
            onChange={(e) => updateField("vendor", e.target.value)}
          />

          <label>Invoice date</label>
          <input
            type="date"
            value={invoice.date}
            onChange={(e) => updateField("date", e.target.value)}
          />

          <label>Total amount (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={invoice.amount}
            placeholder="Enter total amount"
            onChange={(e) => updateField("amount", e.target.value)}
          />

          <div className="button-row">
            <button className="primary-button" onClick={saveChanges}>
              Save changes
            </button>
          </div>

          <div className="decision-row">
            <button className="approve-button" onClick={() => decide("Approved")}>
              ✓ Approve
            </button>
            <button className="reject-button" onClick={() => decide("Rejected")}>
              ✕ Reject
            </button>
            <button className="review-button" onClick={() => decide("Needs review")}>
              Needs review
            </button>
          </div>
        </section>

        <section className="panel document-panel">
          <div className="panel-heading">
            <div>
              <h2>Document for this invoice</h2>
              <p>Choose a PDF or image up to 15 MB.</p>
            </div>
          </div>

          <label className="upload-area">
            <strong>↑ Choose PDF or photo</strong>
            <span>PDF, JPG, PNG, WEBP and other images</span>
            <input
              type="file"
              accept="application/pdf,.pdf,image/*"
              onChange={selectFile}
              disabled={loading}
            />
          </label>

          {file && (
            <div className="pdf-actions">
              <span title={file.name}>Selected: {file.name}</span>
              <button
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
              {file.type.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt="Selected invoice"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 480,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <iframe
                  title="Selected invoice PDF"
                  src={previewUrl}
                  width="100%"
                  height="480"
                  style={{ border: 0 }}
                />
              )}
            </div>
          )}

          <button
            className="primary-button"
            style={{ width: "100%", marginTop: 16 }}
            onClick={submitAnalysis}
            disabled={!file || loading}
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
              <h2>Analysis Results</h2>
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
                className="primary-button"
                style={{ width: "100%", marginTop: 12 }}
                onClick={applyResults}
              >
                Apply Detected Fields
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
