const PDFDocument = require("pdfkit");

import type { DischargeExportDocument } from "./dischargeExportService";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function formatDate(value?: string): string {
  if (!value) {
    return "Not recorded";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function writeSectionHeading(doc: any, title: string): void {
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1f2937")
    .text(title);
  doc.moveDown(0.2);
  doc
    .strokeColor("#d1d5db")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

function writeLabelValue(doc: any, label: string, value: string): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text(`${label}: `, { continued: true });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(value);
}

function writeParagraph(doc: any, value: string): void {
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#111827")
    .text(value, {
      lineGap: 3,
    });
}

function writeBulletList(doc: any, values: string[]): void {
  values.forEach((value) => {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#111827")
      .text(`- ${value}`, {
        indent: 10,
        lineGap: 3,
      });
  });
}

function addFooter(doc: any, pageNumber: number, pageCount: number, note: string): void {
  const footerTop = doc.page.height - doc.page.margins.bottom + 8;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#4b5563")
    .text(note, doc.page.margins.left, footerTop, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 90,
      align: "left",
    });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#4b5563")
    .text(`Page ${pageNumber} of ${pageCount}`, doc.page.margins.left, footerTop, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "right",
    });
}

export function createDischargeSummaryPdfFilename(
  patientId: string,
  generatedAt: string
): string {
  const normalizedPatientId = patientId.trim() || "patient";
  const parsed = new Date(generatedAt);
  const datePart = Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `Aura_Discharge_Summary_${normalizedPatientId}_${datePart}.pdf`;
}

export async function renderDischargeSummaryPdf(
  document: DischargeExportDocument
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
      margin: 50,
      size: "A4",
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `Aura Discharge Summary - ${document.patientId}`,
        Author: "Aura",
        Subject: "Discharge summary export",
        Keywords: "Aura, discharge summary, care transition",
        Creator: "Aura server",
        Producer: "Aura server",
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    pdf.on("error", reject);
    pdf.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    pdf
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#111827")
      .text("Aura Discharge Summary");
    pdf.moveDown(0.2);
    pdf
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text(`Generated: ${formatDateTime(document.generatedAt)} UTC`);
    pdf
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text(`Data as of: ${formatDateTime(document.dataAsOf)} UTC`);
    pdf.moveDown(0.4);
    writeLabelValue(pdf, "Patient name", document.patientName);
    writeLabelValue(pdf, "Patient ID", document.patientId);

    writeSectionHeading(pdf, "Care state and attribution");
    writeLabelValue(pdf, "Current care state", document.careStateLabel);
    writeLabelValue(pdf, "Discharge date", formatDate(document.dischargedAt));
    writeLabelValue(
      pdf,
      "Discharge clinician",
      document.dischargedByName?.trim() || "Not recorded"
    );
    pdf.moveDown(0.2);
    writeParagraph(pdf, document.careStateSummary);

    writeSectionHeading(pdf, "Transition summary");
    writeParagraph(pdf, document.transitionSummary);

    writeSectionHeading(pdf, "Recent recovery snapshot");
    writeParagraph(pdf, document.recentTrendSummary);
    if (document.weeklyHeadline) {
      pdf.moveDown(0.4);
      writeLabelValue(pdf, "Weekly headline", document.weeklyHeadline);
    }
    if (document.weeklyHighlights.length > 0) {
      pdf.moveDown(0.3);
      writeBulletList(pdf, document.weeklyHighlights);
    }
    pdf.moveDown(0.3);
    writeLabelValue(pdf, "Plan status", document.planStatus);

    writeSectionHeading(pdf, "Next steps");
    writeBulletList(pdf, document.nextSteps);

    writeSectionHeading(pdf, "Safety and contact instructions");
    writeLabelValue(pdf, "Clinic contact guidance", document.contactInstructions);
    writeLabelValue(pdf, "Urgent-help guidance", document.urgentHelpInstructions);
    writeLabelValue(pdf, "Monitoring caveat", document.monitoringCaveat);

    const footerNote = `${document.confidentialityNotice} ${document.historicalDetailNote}`;
    const range = pdf.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      pdf.switchToPage(range.start + index);
      addFooter(pdf, index + 1, range.count, footerNote);
    }

    pdf.end();
  });
}
