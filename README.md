# Invoice Review Studio

A web-based invoice review application that helps users upload invoices, extract key details, review and edit the extracted information, and manage invoice approval status through a simple interface.

## Live Demo

**Live Application:** [Open Invoice Review Studio](https://invoice-review-studio.vercel.app/)

**GitHub Repository:** [Invoice Review Studio](https://github.com/Anchal-Gola/Invoice-review-studio)

## Overview

Invoice Review Studio is a frontend-focused invoice management tool designed to simplify the invoice review process. Users can upload PDF or image-based invoices, extract important invoice information, make corrections, and update the review status.

The application combines document text extraction, OCR support, editable invoice fields, and browser-based persistence in a clean, easy-to-use interface.

## Features

- **Invoice Dashboard** — View and manage invoices in one place.
- **PDF and Image Upload** — Upload invoice documents for analysis.
- **Text Extraction** — Extract invoice details from supported PDF documents.
- **OCR Support** — Use OCR to recognize text in scanned documents and images.
- **Automatic Field Detection** — Detect details such as invoice number, vendor name, invoice date, and total amount.
- **Editable Invoice Details** — Review and manually correct extracted information.
- **Invoice Status Management** — Mark invoices as Approved, Rejected, or Needs Review.
- **Save Changes** — Update invoice details and preserve supported metadata in the browser.
- **Responsive Interface** — Work with the application through a straightforward interface.

## Tech Stack

- **React.js** — Component-based user interface
- **JavaScript** — Application logic and interactions
- **Vite** — Development server and production build
- **Tesseract.js** — Optical character recognition (OCR)
- **PDF.js (`pdfjs-dist`)** — PDF text extraction and document processing
- **CSS** — Styling and responsive layouts
- **Local Storage** — Browser-side persistence of invoice metadata

## Getting Started

### Prerequisites

Install [Node.js](https://nodejs.org/) and npm before running the project locally.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Anchal-Gola/Invoice-review-studio.git
   ```

2. Navigate to the project directory:

   ```bash
   cd Invoice-review-studio
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL shown in the terminal, usually `http://localhost:5173`.

### Production Build

To create a production build, run:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## How to Use

1. Open the application.
2. Select an existing invoice or upload a PDF/image document.
3. Run the invoice analysis process.
4. Review the automatically detected invoice details.
5. Apply the detected fields and manually correct any inaccurate values.
6. Save your changes.
7. Update the invoice status to Approved, Rejected, or Needs Review.

**Note:** Automatically extracted information should always be reviewed for accuracy before approval.

## Data Persistence and Limitations

- Invoice metadata and review status are stored in the browser using Local Storage.
- Local Storage is specific to the browser and website origin; data is not automatically shared across different users or devices.
- Uploaded file objects are not permanently stored by a backend service. Depending on the session, a document may need to be uploaded again after a refresh.
- OCR and field extraction can produce inaccurate results depending on document quality and layout.
- The application does not independently verify invoice authenticity or perform server-side financial validation.

## Project Structure

```text
Invoice-review-studio/
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── package-lock.json
└── README.md
```

*The exact folders and files may vary depending on the current project structure.*

## Future Improvements

- Backend integration for shared and persistent invoice storage
- Secure user authentication and role-based access
- Cloud storage for uploaded invoice documents
- Improved extraction accuracy and validation rules
- Invoice search, filtering, and reporting

## Author

**Anchal Gola**

Computer Science Undergraduate | Web Development

- **GitHub:** [Anchal-Gola](https://github.com/Anchal-Gola)

---

Built as a practical project to explore document processing, OCR, invoice review workflows, and frontend application development.