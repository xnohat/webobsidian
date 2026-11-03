import {useSyncExternalStore} from 'react';
import {catalog} from './catalog';
import {parseLanguagePack} from './pack';

const storageKey = 'webobsidian.language.v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type StoredLanguagePack = {version:1; name:string; text:string};
type LanguageState = {name: string; translations: Record<string, string>; revision: number};
let state: LanguageState = {name: '', translations: {}, revision: 0};
let storage: Storage | undefined;
const listeners = new Set<() => void>();
const localizedNodes = new Map<WeakRef<Node>, Map<string, () => void>>();
const nodeReferences = new WeakMap<Node, WeakRef<Node>>();
function publish(name: string, translations: Record<string, string>) {
  state = {name, translations, revision: state.revision + 1};
  for (const [ref, update] of localizedNodes) {
    if (ref.deref()) {for (const apply of update.values()) apply();}
    else localizedNodes.delete(ref);
  }
  for (const listener of listeners) listener();
}
export function initializeLanguage(target?: Storage) {
  storage = undefined;
  try {
    storage = target ?? globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(storageKey) ?? 'null');
    if (saved?.version !== 1 || typeof saved.name !== 'string' || typeof saved.text !== 'string') {
      publish('', {});
      return;
    }
    publish(saved.name, parseLanguagePack(saved.text).translations);
  } catch { publish('', {}); }
}
export function prepareLanguagePack(text: string, name: string) {
  if (text.length > 5_000_000) throw Error('Language file is too large (maximum 5 MB).');
  if (!name || name.length > 255) throw Error('Invalid language file name.');
  const result = parseLanguagePack(text);
  if (!Object.keys(result.translations).length) throw Error('No compatible translations found.');
  const compatibleText = Object.entries(result.translations).map(([key, value]) =>
    '[' + key + ']\ntranslation=' + value.replace(/\n/g, '\\n')).join('\n\n');
  return {pack:{version:1 as const,name,text:compatibleText},result};
}
export function applyServerLanguage(pack: StoredLanguagePack | null) {
  const translations = pack ? parseLanguagePack(pack.text).translations : {};
  try {
    if (pack) storage?.setItem(storageKey, JSON.stringify(pack));
    else storage?.removeItem(storageKey);
  } catch { /* The server remains authoritative when browser storage is unavailable. */ }
  publish(pack?.name ?? '', translations);
}
export function getLanguageState() {return state;}
const keysByEnglish = new Map(Object.entries(catalog).map(([key, value]) => [value, key]));
export function translateLabel<T>(value: T): T {
  if (typeof value !== 'string') return value;
  const key = keysByEnglish.get(value);
  return (key ? t(key) : value) as T;
}
export function useLanguage() {
  return useSyncExternalStore(listener => {listeners.add(listener); return () => {listeners.delete(listener);};}, getLanguageState, getLanguageState);
}
export function t(key: string, params: Record<string, string | number | undefined | null> = {}): string {
  if (typeof params.count === 'number' && params.count !== 1 && Object.hasOwn(catalog, key + '_plural')) key += '_plural';
  const text = state.translations[key] || catalog[key] || key;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match);
}
export function setLocalizedText(node: Node, key: string, params: Record<string, string | number | undefined | null> = {}, field = 'textContent') {
  // Bind the text leaf so subsequent updates preserve controls appended by widgets.
  if (field === 'textContent' && node.nodeType !== 3 && node.ownerDocument) {
    const text = node.ownerDocument.createTextNode('');
    node.textContent = '';
    node.appendChild(text);
    node = text;
  }
  let fields = nodeReferences.get(node);
  if (!fields) {fields = new WeakRef(node); nodeReferences.set(node, fields);}
  const ref = fields;
  const update = () => {
    const target = ref.deref();
    if (!target) return;
    const value = t(key, params);
    if (field !== 'textContent' && target instanceof Element) target.setAttribute(field, value);
    else target.textContent = value;
  };
  let updates = localizedNodes.get(ref);
  if (!updates) {updates = new Map(); localizedNodes.set(ref, updates);}
  updates.set(field, update);
  update();
}
