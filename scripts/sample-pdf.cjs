// A small text PDF with an outline, built by hand so the test needs no fixture tools.
function createSamplePdf(pageCount = 3) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const text = `BT /F1 24 Tf 72 700 Td (Sample PDF page ${page}) Tj 0 -40 Td (Highlight target text on page ${page}) Tj ET`;
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  const outline = add(null);
  const items = pageIds.map((pageId, index) => add(null));
  items.forEach((itemId, index) => {
    const links = [index > 0 ? `/Prev ${items[index - 1]} 0 R` : "", index < items.length - 1 ? `/Next ${items[index + 1]} 0 R` : ""].join(" ");
    objects[itemId - 1] = `<< /Title (Chapter ${index + 1}) /Parent ${outline} 0 R ${links} /Dest [${pageIds[index]} 0 R /XYZ 0 792 null] >>`;
  });
  objects[outline - 1] = `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${items.length} >>`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outline} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  let output = "%PDF-1.7\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

module.exports = { createSamplePdf };
