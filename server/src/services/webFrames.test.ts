import {it,expect} from 'vitest';
import {renderPreparedMarkdown} from './markdownRendering.js';

it('renders an authored web iframe with dimensions and a fixed isolated sandbox',()=>{
 const html=renderPreparedMarkdown('<iframe src="https://example.org/page?q=1&amp;lang=ru" width="600" height="300" title="Reference site" allowfullscreen></iframe>');
 expect(html).toMatch(/<iframe\b/);
 expect(html).toContain('src="https://example.org/page?q=1&#x26;lang=ru"');
 expect(html).toContain('width="600"');expect(html).toContain('height="300"');
 expect(html).toContain('title="Reference site"');
 expect(html).toContain('sandbox="allow-forms allow-scripts allow-presentation"');
 expect(html).toContain('referrerpolicy="no-referrer"');
 expect(html).toMatch(/allowfullscreen/);
});

it('rebuilds iframe attributes without srcdoc, handlers or note-supplied permissions',()=>{
 const html=renderPreparedMarkdown('<iframe src="https://example.org/" srcdoc="<script>parent.compromised=1</script>" onload="parent.compromised=2" sandbox="allow-same-origin allow-top-navigation allow-popups" allow="camera *; microphone *" style="position:fixed;inset:0" name="parent"></iframe>');
 expect(html).toMatch(/<iframe\b/);
 expect(html).not.toMatch(/srcdoc|onload|allow-same-origin|allow-top-navigation|allow-popups|camera|microphone|position:fixed|name="parent"|compromised/);
});

it.each(['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///C:/secret.txt','blob:https://example.org/id','about:blank','/api/files/content?path=secret.md','https://user:password@example.org/'])('does not create a frame for unsafe or non-web source %s',src=>{
 const html=renderPreparedMarkdown(`<iframe src="${src}"></iframe>`);
 expect(html).not.toMatch(/<iframe\b/);
});

it('supports protocol-relative web embeds and valid percentage width',()=>{
 const html=renderPreparedMarkdown('<iframe src="//example.org/embed" width="100%" height="420"></iframe>');
 expect(html).toMatch(/<iframe\b/);expect(html).toContain('src="https://example.org/embed"');
 expect(html).toContain('width="100%"');expect(html).toContain('height="420"');
});

it('keeps iframe syntax literal inside code and removes parent-page scripts',()=>{
 const html=renderPreparedMarkdown('`<iframe src="https://example.org"></iframe>`\n\n<script>window.compromised=1</script>');
 expect(html).not.toMatch(/<iframe\b|<script\b/);expect(html).toContain('&#x3C;iframe');
});

it('does not copy invalid layout values into a reconstructed frame',()=>{
 const html=renderPreparedMarkdown('<iframe src="http://example.org/" width="calc(100% + 100px)" height="1;position:fixed"></iframe>');
 expect(html).toMatch(/<iframe\b/);expect(html).not.toMatch(/calc\(|position:fixed/);
});


it('uses the existing trusted YouTube player policy for validated authored embed URLs',()=>{
 const html=renderPreparedMarkdown('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="560" height="315" title="Video" allowfullscreen srcdoc="<script>parent.bad=1</script>" onload="parent.bad=1"></iframe>');
 expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
 expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"');
 expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
 expect(html).toContain('width="560"');expect(html).toContain('height="315"');
 expect(html).not.toMatch(/srcdoc|onload|parent.bad/);
});

it.each(['https://www.youtube-nocookie.com.evil.invalid/embed/dQw4w9WgXcQ','https://youtube-nocookie.com/not-an-embed/dQw4w9WgXcQ','https://example.org/embed/dQw4w9WgXcQ'])('keeps untrusted lookalike player %s opaque',src=>{
 const html=renderPreparedMarkdown(`<iframe src="${src}"></iframe>`);
 expect(html).toContain('sandbox="allow-forms allow-scripts allow-presentation"');expect(html).not.toContain('allow-same-origin');
});
