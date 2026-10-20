
import { useEffect, useState } from "react";
import Review from "./Review.jsx";

const STORAGE_KEY = "ledgerline-invoices-v1";

const initialInvoices = [
  {
    uid: "sample-001",
    id: "INV-2026-001",
    vendor: "Acme Technologies",
    date: "2026-10-20",
    amount: "24500",
    status: "Pending",
    file: null,
    fileName: "",
  },
  {
    uid: "sample-002",
    id: "INV-2026-002",
    vendor: "Bluewave Systems",
    date: "2026-10-19",
    amount: "18200",
    status: "Approved",
    file: null,
    fileName: "",
  },
  {
    uid: "sample-003",
    id: "INV-2026-003",
    vendor: "Northstar Supplies",
    date: "2026-10-18",
    amount: "32750",
    status: "Needs review",
    file: null,
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
          file: null,
          fileName: invoice.fileName || "",
        }));
      }
    }
  } catch (error) {
    console.error("Could not load saved invoices:", error);
  }

  return initialInvoices;
}

export default function App() {
  const [page, setPage] = useState("Dashboard");
  const [invoices, setInvoices] = useState(loadInvoices);
  const [selectedId, setSelectedId] = useState(null);

  // Save invoice metadata whenever it changes.
  // File objects are intentionally excluded because localStorage
  // cannot persist uploaded File objects.
  useEffect(() => {
    try {
      const serializableInvoices = invoices.map(
        ({ file, ...invoice }) => invoice
      );

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(serializableInvoices)
      );
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
          ? { ...updated, file: invoice.file }
          : invoice
      )
    );
  }

  function openReview(uid) {
    setSelectedId(uid);
    setPage("Review");
  }

  function handleUpload(event) {
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
      file,
      fileName: file.name,
    };

    setInvoices((current) => [newInvoice, ...current]);
    setSelectedId(uid);
    setPage("Review");
  }

  if (page === "Review" && selectedInvoice) {
    return (
      <Review
        key={selectedInvoice.uid}
        invoice={selectedInvoice}
        onUpdate={updateInvoice}
        onBack={() => setPage("Dashboard")}
        initialFile={selectedInvoice.file}
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
                    Select Review to open that invoice's own details and document.
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
                    {invoices.map((invoice) => (
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
                          <button
                            className="text-button"
                            onClick={() => openReview(invoice.uid)}
                          >
                            Review →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="demo-note">
                Invoice details and statuses are saved in this browser.
                Uploaded documents need to be selected again after a refresh.
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
