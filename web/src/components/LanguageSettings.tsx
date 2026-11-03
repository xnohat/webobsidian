import {useEffect, useRef, useState} from 'react';
import {catalog} from '../lib/i18n/catalog';
import {exportLanguageTemplate} from '../lib/i18n/pack';
import {t, useLanguage} from '../lib/i18n/runtime';
import {saveServerLanguage, clearServerLanguage, loadServerLanguage} from '../lib/i18n/server';

export default function LanguageSettings() {
  const language = useLanguage();
  const importRevision = useRef(0);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  useEffect(() => {void loadServerLanguage().catch(e=>setError(String(e)));},[]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportLanguageTemplate()], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'webobsidian-language.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label={t("setting.about.option-language")}>
    <h2>{t("setting.about.option-language")}</h2>
    <p>{t("webobsidian.import-a-language-file-or-download-a-template-to-02f3d1")}</p>
    <p><a href="https://github.com/obsidianmd/obsidian-translations/tree/master/translations" target="_blank" rel="noopener noreferrer">{t("webobsidian.find-language-files-in-the-obsidian-translations-f3de40")}</a></p>
    <p>{t("webobsidian.download-a-txt-file-there-then-choose-it-below-y-02cf17")}</p>
    <p role="status">{language.name ? language.name + ' · ' + Object.keys(language.translations).length + ' / ' + Object.keys(catalog).length : t("webobsidian.default-language-852814")}</p>
    <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center'}}>
      <button className="btn secondary" onClick={download}>{t("webobsidian.download-template-d26856")}</button>
      <label>{t("webobsidian.import-language-file-ba526c")} <input type="file" disabled={busy} accept=".txt,text/plain" onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        const revision = ++importRevision.current;
        setError(''); setWarnings([]);
        setBusy(true);
        try {
          if (file.size > 5_000_000) throw Error(t("webobsidian.language-file-is-too-large-maximum-5-mb-120492"));
          const text = await file.text();
          if (revision !== importRevision.current) return;
          const result = await saveServerLanguage(text, file.name);
          setWarnings(result.warnings);
        } catch (e) {if (revision === importRevision.current) setError(e instanceof Error ? e.message : String(e));}
        input.value = '';setBusy(false);
      }}/></label>
      <button className="btn secondary" disabled={busy} onClick={async () => {setBusy(true);try {importRevision.current++;await clearServerLanguage(); setError('');setWarnings([]);} catch(e) {setError(String(e));} finally {setBusy(false);}}}>{t("webobsidian.restore-default-language-a41d48")}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!!warnings.length && <p role="status">{warnings.join('\n')}</p>}
  </section>;
}
