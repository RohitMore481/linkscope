import { jsPDF } from "jspdf";

import type { LinkAnalysisResponse } from "../types/analysis";

export function exportAnalysisToPdf(report: LinkAnalysisResponse): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 44;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 50;

  let y = 48;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > bottomLimit) {
      doc.addPage();
      y = 48;
    }
  };

  const addSectionHeading = (title: string) => {
    ensureSpace(34);
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(title, marginX, y);
    y += 16;
  };

  const addSubHeading = (label: string) => {
    ensureSpace(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(label, marginX, y);
    y += 14;
  };

  const addParagraph = (text: string, indent = 0, fontSize = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
    const lineHeight = fontSize * 1.4;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX + indent, y);
      y += lineHeight;
    }
    y += 4;
  };

  const addBulletList = (items: string[], indent = 10) => {
    for (const item of items) {
      addParagraph(`•  ${item}`, indent, 9.5);
    }
  };

  // Document Header
  const brandName = report.analysis.competitor_vs_your_brand.brand_name;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`${brandName} — Link Analysis Report`, marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(67, 56, 202);
  doc.text(report.url, marginX, y);
  y += 14;

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Provider: ${report.meta.provider}  |  Model: ${report.meta.model}  |  Input: ${report.meta.input_chars.toLocaleString()} chars  |  Generated: ${new Date().toLocaleDateString()}`,
    marginX,
    y
  );
  y += 14;

  // Section 1: Competitor vs Your Brand
  const compSection = report.analysis.competitor_vs_your_brand;
  addSectionHeading("01. Competitor vs. Your Brand");

  addSubHeading("Your Brand Strengths");
  addBulletList(compSection.your_brand_strengths);

  addSubHeading("Your Brand Weaknesses");
  addBulletList(compSection.your_brand_weaknesses);

  addSubHeading("Market Opportunities");
  addBulletList(compSection.opportunities);

  addSubHeading("Identified Competitors");
  for (const comp of compSection.competitors) {
    ensureSpace(44);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(comp.name, marginX + 8, y);
    y += 13;
    addParagraph(`Why Competitor: ${comp.why_competitor}`, 14, 9.5);
    addParagraph(`Strengths: ${comp.strengths.join("; ")}`, 14, 9.5);
    addParagraph(`Weaknesses: ${comp.weaknesses.join("; ")}`, 14, 9.5);
  }

  // Section 2: Top 5 Target Search Queries
  addSectionHeading("02. Top 5 Target Search Queries");
  report.analysis.top_5_target_search_queries.forEach((q, idx) => {
    ensureSpace(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${String(idx + 1).padStart(2, "0")}. ${q.query}`, marginX, y);
    y += 13;
    addParagraph(
      `Platform: ${q.platform}  |  Intent: ${q.intent}  |  Target Audience: ${q.target_audience}`,
      14,
      9
    );
  });

  // Section 3: SEO Improvement
  const seo = report.analysis.seo_improvement;
  addSectionHeading("03. SEO Improvement");
  addSubHeading(`Recommended SEO Title (${seo.seo_title.length} chars)`);
  addParagraph(seo.seo_title, 8);
  addSubHeading(`Recommended Meta Description (${seo.meta_description.length} chars)`);
  addParagraph(seo.meta_description, 8);
  addSubHeading("Primary & Secondary Keywords");
  addParagraph(`Primary: ${seo.primary_keyword}`, 8);
  addParagraph(`Secondary: ${seo.secondary_keywords.join(", ")}`, 8);
  addSubHeading("Supporting Content Ideas");
  addBulletList(seo.content_ideas);

  // Section 4: Top 5 Services
  addSectionHeading("04. Top 5 Services");
  report.analysis.top_5_services.forEach((service, idx) => {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${String(idx + 1).padStart(2, "0")}. ${service.name}`, marginX, y);
    y += 13;
    addParagraph(service.description, 14, 9.5);
  });

  // Section 5: Target Audience Identification
  const audience = report.analysis.target_audience_identification;
  addSectionHeading("05. Target Audience Identification");
  addSubHeading("Primary Audience");
  addParagraph(audience.primary_audience, 8);
  addSubHeading("Secondary Audience");
  addParagraph(audience.secondary_audience, 8);
  addSubHeading("Industries");
  addParagraph(audience.industries.join(", "), 8);
  addSubHeading("Customer Needs");
  addBulletList(audience.customer_needs);
  addSubHeading("Recommended Segments");
  addBulletList(audience.recommended_segments);

  // Disclaimer
  ensureSpace(32);
  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const disclaimerLines = doc.splitTextToSize(
    report.meta.inferred_data_disclaimer,
    contentWidth
  ) as string[];
  for (const line of disclaimerLines) {
    ensureSpace(12);
    doc.text(line, marginX, y);
    y += 12;
  }

  // Page footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 24, {
      align: "right",
    });
  }

  const slug = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  doc.save(`${slug || "link-analysis"}-report.pdf`);
}
