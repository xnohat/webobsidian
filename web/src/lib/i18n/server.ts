import {api} from '../api';
import {applyServerLanguage, getLanguageState, prepareLanguagePack} from './runtime';
import type {StoredLanguagePack} from './runtime';
let revision = 0;
let pendingWrites = 0;
let writes: Promise<void> = Promise.resolve();

function writeServerLanguage(pack: StoredLanguagePack | null) {
  revision++;
  pendingWrites++;
  const write = writes.then(async () => {
    await api.putSettings({ui:{languagePack:pack}});
    applyServerLanguage(pack);
  });
  writes = write.catch(() => {});
  return write.finally(() => {pendingWrites--;});
}

export async function loadServerLanguage() {
  if (pendingWrites) return;
  const current = ++revision;
  const settings = await api.getSettings();
  if (current !== revision || pendingWrites) return;
  if (settings.ui.languagePack === undefined && getLanguageState().name) {
    const local = getLanguageState();
    const text = Object.entries(local.translations).map(([key,value]) =>
      '[' + key + ']\ntranslation=' + value.replace(/\n/g,'\\n')).join('\n\n');
    await saveServerLanguage(text, local.name);
    return;
  }
  applyServerLanguage(settings.ui.languagePack ?? null);
}

export async function saveServerLanguage(text: string, name: string) {
  const {pack,result} = prepareLanguagePack(text,name);
  await writeServerLanguage(pack);
  return result;
}

export async function clearServerLanguage() {
  await writeServerLanguage(null);
}
