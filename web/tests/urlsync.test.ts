import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRAPH_PATH, TASKS_PATH, useStore } from '../src/lib/store';
import { initUrlSync, modeFromUrl, pathToUrl, urlToPath } from '../src/lib/urlsync';

// pathToUrl/urlToPath are pure (initUrlSync is the only part that touches
// `window`), so they're testable directly under node without a DOM.

test('pathToUrl', () => {
  assert.equal(pathToUrl(null), '/');
  assert.equal(pathToUrl(GRAPH_PATH), '/graph');
  assert.equal(pathToUrl(TASKS_PATH), '/tasks');
  assert.equal(pathToUrl('Wiki/My Note.md'), '/note/Wiki/My%20Note.md');
});

test('urlToPath', () => {
  assert.equal(urlToPath('/graph'), GRAPH_PATH);
  assert.equal(urlToPath('/tasks'), TASKS_PATH);
  assert.equal(urlToPath('/note/Wiki/My%20Note.md'), 'Wiki/My Note.md');
  assert.equal(urlToPath('/'), null);
});

test('pathToUrl/urlToPath round-trip for the Tasks board', () => {
  assert.equal(urlToPath(pathToUrl(TASKS_PATH)), TASKS_PATH);
});

test('pathToUrl carries the Tasks timeline mode in the deep link', () => {
  assert.equal(pathToUrl(TASKS_PATH), '/tasks', 'the board is the bare path');
  assert.equal(pathToUrl(TASKS_PATH, 'board'), '/tasks');
  assert.equal(pathToUrl(TASKS_PATH, 'timeline'), '/tasks?mode=timeline');
  assert.equal(pathToUrl(null, 'timeline'), '/', 'the mode only means something for /tasks');
  assert.equal(pathToUrl(GRAPH_PATH, 'timeline'), '/graph');
  // Regression: a restore that rewrites the URL must not turn the timeline into
  // the board by emitting the bare path.
  assert.equal(urlToPath(pathToUrl(TASKS_PATH, 'timeline').split('?')[0]), TASKS_PATH);
});

test('modeFromUrl reads the Tasks mode back out of a URL', () => {
  assert.equal(modeFromUrl('/tasks', ''), null, 'no query means "leave the mode alone"');
  assert.equal(modeFromUrl('/tasks', '?mode=timeline'), 'timeline');
  assert.equal(modeFromUrl('/tasks', '?mode=board'), 'board');
  assert.equal(modeFromUrl('/tasks', '?mode=nonsense'), null);
  assert.equal(modeFromUrl('/graph', '?mode=timeline'), null, 'the mode belongs to the Tasks view only');
});

test('the store default is the board, and setTasksMode switches it', () => {
  assert.equal(useStore.getState().tasksMode, 'board');
  useStore.getState().setTasksMode('timeline');
  assert.equal(useStore.getState().tasksMode, 'timeline');
  useStore.getState().setTasksMode('board');
});

// initUrlSync's store→URL sync compares window.location.pathname (no query
// string) against pathToUrl(activePath) (also just a pathname) and returns
// early when they already match — e.g. `/tasks?mode=board` navigating within
// the Tasks board shouldn't have its `?mode=board` query string clobbered by
// a redundant replaceState('/tasks'). A minimal window polyfill (no DOM) is
// enough to exercise this, since initUrlSync only touches window.location/history.
test('store→URL sync does not clobber an existing query string once the pathname already matches', () => {
  const win = {
    location: { pathname: '/tasks', search: '?mode=board',hash:'' },
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        const parsed=new URL(url,'http://fixture');win.location.pathname=parsed.pathname;win.location.search=parsed.search;win.location.hash=parsed.hash;
      },
      pushState: (_state: unknown, _title: string, url: string) => {
        const parsed=new URL(url,'http://fixture');win.location.pathname=parsed.pathname;win.location.search=parsed.search;win.location.hash=parsed.hash;
      },
    },
    addEventListener: () => {},
  };
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });

  useStore.setState({ activePath: null });
  initUrlSync();
  useStore.setState({ activePath: TASKS_PATH });

  assert.equal(win.location.pathname, '/tasks');
  assert.equal(win.location.search, '?mode=board'); // untouched by the early return
  useStore.setState({activePath:'Folder/report#one.pdf',tabs:[{path:'Folder/report#one.pdf',title:'PDF',pdfFragment:'page=2&annotation=8R'}]});
  assert.equal(win.location.pathname,'/note/Folder/report%23one.pdf');assert.equal(win.location.hash,'#page=2&annotation=8R');
  useStore.setState({tabs:[{path:'Folder/report#one.pdf',title:'PDF',pdfFragment:'page=1&selection=0,0,0,5'}]});assert.equal(win.location.hash,'#page=1&selection=0,0,0,5');
});
