import {t,setLocalizedText} from './runtime';
const keys: Record<string,string> = {
  "Управление PDF": "webobsidian.pdf-fcf7c01b99",
  "Свернуть/развернуть боковую панель": "webobsidian.pdf-8b9b1bbd66",
  "Параметры боковой панели": "webobsidian.pdf-252e1acb5d",
  "Уменьшить": "commands.zoom-out",
  "Увеличить": "commands.zoom-in",
  "Параметры отображения": "webobsidian.pdf-6eaed50006",
  "Номер страницы": "webobsidian.pdf-8b08ca4222",
  "из …": "webobsidian.pdf-702e488f39",
  "Открыть": "webobsidian.open-cf9b77",
  "Редактировать блок": "webobsidian.pdf-add13aac45",
  "Миниатюры PDF": "webobsidian.pdf-ac82463cf5",
  "Оглавление PDF": "webobsidian.pdf-188247ca83",
  "Не удалось выполнить команду": "webobsidian.pdf-c64eedff97",
  "Открыть в новой вкладке": "webobsidian.pdf-71bf47a728",
  "Открыть в новом окне": "interface.menu.open-in-new-window",
  "Копировать ссылку": "webobsidian.copy-link-2f84ee",
  "Неверный пароль PDF. Попробуйте ещё раз: ": "webobsidian.pdf-7e380db1f7",
  "Пароль PDF": "webobsidian.pdf-6a79213d18",
  "из ": "webobsidian.pdf-2449d65241",
  "Страница ": "webobsidian.pdf-108d9ea56d",
  "Миниатюры": "webobsidian.pdf-fcecbb00b4",
  "Оглавление": "plugins.outline.name",
  "Показать страницу в оглавлении": "webobsidian.pdf-7ba8cf8ed1",
  "Подогнать по ширине": "webobsidian.pdf-0071b9d89d",
  "Подогнать по высоте": "webobsidian.pdf-e33d6802d1",
  "Одна страница": "webobsidian.pdf-db19485e8b",
  "Две страницы (нечётные)": "webobsidian.pdf-f339ca1216",
  "Две страницы (чётные)": "webobsidian.pdf-012f37de0b",
  "Адаптировать к теме": "webobsidian.pdf-229344e7a2"
};
export function pdfLabel(source: string) {return keys[source] ? t(keys[source]) : source;}
export function bindPdfLabel(node: Node, source: string, field: string) {
 const original = Object.hasOwn(keys,source) ? source : Object.keys(keys).find(label => t(keys[label]) === source);
 if (original) setLocalizedText(node,keys[original],{},field);
 else if (field === 'textContent') node.textContent=source;
 else if (node instanceof Element) node.setAttribute(field,source);
}
