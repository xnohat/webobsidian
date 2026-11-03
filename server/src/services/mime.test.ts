import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { attachmentDisposition, mimeFor } from './mime.js';

describe('mimeFor', () => {
  it('maps the types the vault renders, and defaults to a download type', () => {
    expect(mimeFor('a/b/report.PDF')).toBe('application/pdf');
    expect(mimeFor('clip.mp4')).toBe('video/mp4');
    expect(mimeFor('note.md')).toBe('application/octet-stream');
    expect(mimeFor('costs.xlsx')).toBe('application/octet-stream');
  });
});

// FR-22: a binary served through /api/files/content is saved under its own name.
describe('attachmentDisposition', () => {
  it('names the download after the file, not after the URL', () => {
    expect(attachmentDisposition('operations-documentation-system-2026-09-27.pptx')).toBe(
      "attachment; filename=\"operations-documentation-system-2026-09-27.pptx\"; filename*=UTF-8''operations-documentation-system-2026-09-27.pptx",
    );
  });

  it('takes the basename when handed a path', () => {
    assert.match(attachmentDisposition('office-104/outbox/report.docx'), /filename="report\.docx"/);
    assert.match(attachmentDisposition('/srv/docs/outbox/report.docx'), /filename="report\.docx"/);
  });

  it('keeps a non-ASCII name in filename* and gives ASCII in filename', () => {
    const header = attachmentDisposition('báo-cáo-quý-3.xlsx');
    expect(header).toContain("filename=\"b_o-c_o-qu_-3.xlsx\"");
    expect(header).toContain("filename*=UTF-8''b%C3%A1o-c%C3%A1o-qu%C3%BD-3.xlsx");
  });

  it('escapes the characters that would break the header', () => {
    // A quote or backslash inside the ASCII fallback would end the header early.
    const header = attachmentDisposition('a"b.txt');
    expect(header).toContain("filename=\"a_b.txt\"");
    // An apostrophe must be percent-encoded, not left bare inside filename*.
    expect(attachmentDisposition("d'on't.txt")).toContain("filename*=UTF-8''d%27on%27t.txt");
  });

  it('never emits an empty name', () => {
    expect(attachmentDisposition('')).toContain('filename="download"');
    expect(attachmentDisposition('dir/')).toContain('filename="download"');
  });
});
