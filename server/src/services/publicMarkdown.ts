/** Interactivity for the sanitized SSR note; no note text is interpolated into JS. */
export function publicMarkdownScript(nonce: string): string {
  const safeNonce = nonce.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<script nonce="${safeNonce}">
for (const title of document.querySelectorAll('.callout[data-callout-fold="-"] > .callout-title, .callout[data-callout-fold="+"] > .callout-title')) {
  title.setAttribute('role', 'button');
  title.tabIndex = 0;
  const update = () => title.setAttribute('aria-expanded', String(!title.parentElement.classList.contains('is-collapsed')));
  const toggle = () => { title.parentElement.classList.toggle('is-collapsed'); update(); };
  title.addEventListener('click', e => { if (!e.target.closest('a')) toggle(); });
  title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  update();
}
</script>`;
}
