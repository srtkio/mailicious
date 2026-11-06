// Writes the fictional fake offer letter that the site's Offer Letter X-ray offers as a sample. Run once: node scripts/sample-letter.mjs
import { writeFileSync } from "node:fs";

const LINES = [
  [20, "Northwind Softech Pvt Ltd"],
  [11, "CIN: U72900ZZ2031XYZ004512   GSTIN: 29NRTHW4821K1ZQ"],
  [11, "Contact: northwind.hr.desk@gmail.com"],
  [11, " "],
  [12, "Date: 12 March 2026"],
  [12, " "],
  [14, "Offer of Internship"],
  [12, " "],
  [12, "Dear Candidate,"],
  [12, " "],
  [12, "We are pleased to offer you the post of Software Intern at a stipend of Rs 65,000 a month."],
  [12, "No interview is required. To block your seat, pay the refundable security deposit of"],
  [12, "Rs 4,500 to our accounts team at northwind.hr@ybl within 24 hours."],
  [12, " "],
  [12, "Please also send your Aadhaar and bank details to the contact above."],
  [12, " "],
  [12, "Regards,"],
  [12, "Human Resources"],
  [12, " "],
  [10, "Fictional sample for the MAILicious demo. This company does not exist."],
];
const escape = (s) => s.replace(/[\\()]/g, "\\$&");
let y = 770;
const content = ["BT"];
for (const [size, line] of LINES) {
  content.push(`/F1 ${size} Tf 1 0 0 1 56 ${y} Tm (${escape(line)}) Tj`);
  y -= size + 10;
}
content.push("ET");
const stream = content.join("\n");
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Title (Offer Letter) /Producer (Canva) /Creator (Canva) /CreationDate (D:20260903101500+05'30') >>",
];
let pdf = "%PDF-1.4\n";
const offsets = objects.map((body, i) => {
  const at = pdf.length;
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  return at;
});
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(new URL("../public/samples/fake-offer-letter.pdf", import.meta.url), pdf, "latin1");
