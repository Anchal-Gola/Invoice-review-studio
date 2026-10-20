
import { useEffect, useState } from "react";
import Review from "./Review.jsx";

const STORAGE_KEY = "ledgerline-invoices-v1";
const DB_NAME = "ledgerline-documents";
const STORE_NAME = "documents";

const initialInvoices = [
  {
    uid: "sample-001",
    id: "INV-2026-001",
    vendor: "Acme Technologies",
    date: "2026-10-20",
    amount: "24500",
    status: "Pending",
    fileName: "",
  },
  {
    uid: "sample-002",
    id: "INV-2026-002",
    vendor: "Bluewave Systems",
    date: "2026-10-19",
    amount: "18200",
    status: "Approved",
    fileName: "",
  },
  {
    uid: "sample-003",
    id: "INV-2026-003",
    vendor: "Northstar Supplies",
    date: "2026-10-18",
    amount: "32750",
    status: "Needs review",
    fileName: "",
  },
];

function loadInvoices() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved !== null) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        return parsed.map((invoice, index) => ({
          ...invoice,
          uid: invoice.uid || `restored-${invoice.id}-${index}`,
          fileName: invoice.fileName || "",
        }));
      }
    }
  } catch (error) {
    console.error("Could not load invoices:", error);
  }

  return initialInvoices;
}

function openDocumentDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDocument(uid, file) {
  const db = await openDocumentDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).put(
      {
        blob: file,
        name: file.name,
        type: file.type,
      },
      uid
    );

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getDocument(uid) {
  const db = await openDocumentDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(uid);

    request.onsuccess = () => {
      const saved = request.result;
      db.close();

      if (!saved?.blob) {
        resolve(null);
        return;
      }

      resolve(
        new File([saved.blob], saved.name || "invoice", {
          type: saved.type || saved.blob.type || "",
        })
      );
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteDocument(uid) {
  const db = await openDocumentDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(uid);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [invoices, setInvoices] = useState(loadInvoices);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    } catch (error) {
      console.error("Could not save invoices:", error);
    }
  }, [invoices]);

  const selectedInvoice = invoices.find(
    (invoice) => invoice.uid === selectedId
  );

  function updateInvoice(updated) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.uid === updated.uid
          ? { ...invoice, ...updated }
          : invoice
      )
    );
  }

  async function openReview(uid) {
    setSelectedId(uid);
    setSelectedFile(null);
    setStorageError("");
    setPage("Review");
    setFileLoading(true);

    try {
      const file = await getDocument(uid);
      setSelectedFile(file);
    } catch (error) {
      console.error("Could not restore document:", error);
      setStorageError(
        "Could not restore the saved document. Please upload it again."
      );
    } finally {
      setFileLoading(false);
    }
  }

  async function handleDeleteInvoice(invoice) {
    const confirmed = window.confirm(
      `Delete invoice "${invoice.id}"${invoice.vendor ? ` (${invoice.vendor})` : ""}?\n\nThis will permanently remove the invoice and its saved document from this browser.`
    );

    if (!confirmed) return;

    setDeletingId(invoice.uid);

    try {
      await deleteDocument(invoice.uid);

      setInvoices((current) =>
        current.filter((item) => item.uid !== invoice.uid)
      );

      if (selectedId === invoice.uid) {
        setSelectedId(null);
        setSelectedFile(null);
        setStorageError("");
        setFileLoading(false);
        setPage("Dashboard");
      }
    } catch (error) {
      console.error("Could not delete invoice document:", error);
      alert(
        "Could not delete the saved document. The invoice was not removed. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      alert("Please select a PDF or image file.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert("Maximum file size is 15 MB.");
      return;
    }

    const uid = `invoice-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const newInvoice = {
      uid,
      id: `UPLOAD-${Date.now()}`,
      vendor: "",
      date: "",
      amount: "",
      status: "Pending",
      fileName: file.name,
    };

    try {
      await saveDocument(uid, file);
    } catch (error) {
      console.error("Could not save document:", error);
      alert("Could not save the file in browser storage. Please try again.");
      return;
    }

    setInvoices((current) => [newInvoice, ...current]);
    setSelectedId(uid);
    setSelectedFile(file);
    setStorageError("");
    setPage("Review");
  }

  async function handleFileChange(file) {
    if (!selectedId) return;

    try {
      if (file) {
        await saveDocument(selectedId, file);
      } else {
        await deleteDocument(selectedId);
      }

      setSelectedFile(file);
      setStorageError("");

      setInvoices((current) =>
        current.map((invoice) =>
          invoice.uid === selectedId
            ? {
                ...invoice,
                fileName: file?.name || "",
              }
            : invoice
        )
      );
    } catch (error) {
      console.error("Could not update saved document:", error);
      setStorageError("Could not save the document. Please try again.");
    }
  }

  function handleBack() {
    setPage("Dashboard");
    setSelectedId(null);
    setSelectedFile(null);
    setStorageError("");
  }

  if (page === "Review" && selectedInvoice) {
    return (
      <Review
        key={selectedInvoice.uid}
        invoice={selectedInvoice}
        onUpdate={updateInvoice}
        onBack={handleBack}
        initialFile={selectedFile}
        fileLoading={fileLoading}
        storageError={storageError}
        onFileChange={handleFileChange}
      />
    );
  }

  const pendingCount = invoices.filter(
    (invoice) => invoice.status === "Pending"
  ).length;

  const approvedCount = invoices.filter(
    (invoice) => invoice.status === "Approved"
  ).length;

  const attentionCount = invoices.filter(
    (invoice) =>
      invoice.status === "Needs review" ||
      invoice.status === "Rejected"
  ).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-mark">L</div>
        <h2>Ledgerline</h2>
        <p className="sidebar-subtitle">INVOICE OPERATIONS</p>
        <p className="menu-label">WORKSPACE</p>

        {["Dashboard", "Invoices", "History", "Settings"].map((item) => (
          <button
            key={item}
            className={`nav-item ${page === item ? "active" : ""}`}
            onClick={() => setPage(item)}
          >
            <span>
              {item === "Dashboard"
                ? "▦"
                : item === "Invoices"
                  ? "▤"
                  : item === "History"
                    ? "◷"
                    : "⚙"}
            </span>
            <span>{item}</span>
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="avatar">A</div>
          <div>
            <strong>Workspace Admin</strong>
            <small>Invoice reviewer</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <span>Workspace / {page}</span>
          <span className="topbar-label">DEMO WORKSPACE</span>
        </header>

        {page === "Dashboard" || page === "Invoices" ? (
          <>
            <section className="welcome">
              <p className="eyebrow">OVERVIEW / INVOICE OPERATIONS</p>
              <h1>
                {page === "Dashboard" ? "Invoice dashboard" : "All invoices"}
              </h1>
              <p>
                Upload documents, analyse invoice details, and manage approvals.
              </p>

              <label className="primary-button upload-dashboard-button">
                + Upload invoice
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/*"
                  onChange={handleUpload}
                  hidden
                />
              </label>
            </section>

            {page === "Dashboard" && (
              <section className="stats">
                <article className="stat-card">
                  <span>Total invoices</span>
                  <h2>{invoices.length}</h2>
                  <small>Saved invoices</small>
                </article>

                <article className="stat-card">
                  <span>Pending review</span>
                  <h2>{pendingCount}</h2>
                  <small>Awaiting decision</small>
                </article>

                <article className="stat-card">
                  <span>Approved</span>
                  <h2>{approvedCount}</h2>
                  <small>Successfully verified</small>
                </article>

                <article className="stat-card">
                  <span>Needs attention</span>
                  <h2>{attentionCount}</h2>
                  <small>Require attention</small>
                </article>
              </section>
            )}

            <section className="invoice-section">
              <div className="section-heading">
                <div>
                  <h2>
                    {page === "Dashboard" ? "Recent invoices" : "Invoice queue"}
                  </h2>
                  <p>
                    Select Review to open an invoice and its saved document.
                  </p>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>INVOICE</th>
                      <th>VENDOR / FILE</th>
                      <th>DATE</th>
                      <th>AMOUNT</th>
                      <th>STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="empty-invoices">
                          No invoices yet. Upload an invoice to get started.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((invoice) => (
                        <tr key={invoice.uid}>
                          <td>{invoice.id}</td>
                          <td>
                            {invoice.vendor ||
                              invoice.fileName ||
                              "New uploaded invoice"}
                          </td>
                          <td>
                            {invoice.date
                              ? new Date(`${invoice.date}T00:00:00`).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  }
                                )
                              : "Not detected"}
                          </td>
                          <td>
                            {invoice.amount
                              ? `₹${Number(invoice.amount).toLocaleString("en-IN")}`
                              : "Not detected"}
                          </td>
                          <td>
                            <span
                              className={`status ${invoice.status
                                .toLowerCase()
                                .replaceAll(" ", "-")}`}
                            >
                              {invoice.status}
                            </span>
                          </td>
                          <td>
                            <div className="invoice-actions">
                              <button
                                className="text-button"
                                onClick={() => openReview(invoice.uid)}
                              >
                                Review →
                              </button>

                              <button
                                className="delete-button"
                                onClick={() => handleDeleteInvoice(invoice)}
                                disabled={deletingId === invoice.uid}
                                title={`Delete ${invoice.id}`}
                                aria-label={`Delete invoice ${invoice.id}`}
                              >
                                {deletingId === invoice.uid
                                  ? "Deleting..."
                                  : "🗑 Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <p className="demo-note">
                Invoice details are saved in this browser. Uploaded documents
                are stored separately in IndexedDB.
              </p>
            </section>
          </>
        ) : (
          <section className="welcome">
            <p className="eyebrow">WORKSPACE</p>
            <h1>{page}</h1>
            <p>
              {page === "History"
                ? "Review individual invoices from the invoice dashboard."
                : "Workspace settings will be added in a future iteration."}
            </p>
            <button
              className="primary-button"
              onClick={() => setPage("Dashboard")}
            >
              Back to dashboard
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
