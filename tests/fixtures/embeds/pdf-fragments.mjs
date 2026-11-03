/** Synthetic text and a highlight annotation; no user document is read. */
export function fragmentPdf(){
 const stream=text=>{const content=`BT /F1 24 Tf 40 700 Td (${text}) Tj 0 -100 Td (Another selected line) Tj ET`;return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`};
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',stream('First PDF page'),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R /Annots [8 0 R] >>',stream('Second PDF page'),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Annot /Subtype /Highlight /Rect [40 590 290 625] /QuadPoints [40 625 290 625 40 590 290 590] /C [1 1 0] /T (Fixture author) /Contents (Fixture annotation) /NM (fixture-highlight) /F 4 >>',
 ];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const start=pdf.length;
 return pdf+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}
