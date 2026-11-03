/** Two labelled pages, an outline and a harmless embedded text attachment. */
export function menuPdf(){
 const stream=text=>{const content=`BT /F1 24 Tf 40 700 Td (${text}) Tj ET`;return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`};
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R /Names << /EmbeddedFiles << /Names [(sample.txt) 10 0 R] >> >> /PageLabels 12 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',stream('First PDF page'),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',stream('Second PDF page'),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Outlines /First 9 0 R /Last 9 0 R /Count 1 >>',
  '<< /Title (Second chapter) /Parent 8 0 R /Dest [5 0 R /Fit] >>',
  '<< /Type /Filespec /F (sample.txt) /UF (sample.txt) /EF << /F 11 0 R >> >>',
  '<< /Type /EmbeddedFile /Length 16 >>\nstream\nSafe attachment\n\nendstream',
  '<< /Nums [0 << /P (A-) /S /D /St 1 >>] >>',
 ];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const start=pdf.length;
 return pdf+`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
}
