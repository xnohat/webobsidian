import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import * as plugins from '../services/plugins.js';
import { readPluginData, writePluginData } from '../services/pluginData.js';
export const pluginsRouter = Router();
pluginsRouter.use(requireAuth);
pluginsRouter.get('/', asyncHandler(async (_req, res) => { const context = await plugins.pluginContext(); res.setHeader('Cache-Control', 'private, no-store'); res.json({ plugins: await plugins.listInstalled(context), vaultIdentity: context.vaultIdentity }); }));
pluginsRouter.post('/install', asyncHandler(async (req, res) => {
    const repo = String(req.body?.repo ?? '');
    if (!repo) {
        res.status(400).json({ error: 'repo required (owner/name)' });
        return;
    }
    res.json({ plugin: await plugins.installFromGithub(repo) });
}));
pluginsRouter.patch('/:id/enabled', asyncHandler(async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be boolean' });
        return;
    }
    await plugins.setEnabled(req.params.id, req.body.enabled);
    res.json({ ok: true });
}));
pluginsRouter.get('/:id/data', asyncHandler(async (req, res) => { res.setHeader('Cache-Control', 'private, no-store'); res.json({ data: await readPluginData(req.params.id, req.get('X-Plugin-Vault')) }); }));
pluginsRouter.put('/:id/data', asyncHandler(async (req, res) => {
    if (!req.body || !Object.hasOwn(req.body, 'data')) {
        res.status(400).json({ error: 'data is required' });
        return;
    }
    await writePluginData(req.params.id, req.body.data, req.get('X-Plugin-Vault'));
    res.json({ ok: true });
}));
pluginsRouter.get('/:id/runtime.mjs', asyncHandler(async (req, res) => { res.setHeader('Cache-Control', 'private, no-store'); const body = await plugins.getRuntimeModule(req.params.id, String(req.query.version ?? '')); res.type('application/javascript').send(body); }));
pluginsRouter.get('/:id/:asset', asyncHandler(async (req, res) => {
    const asset = req.params.asset;
    if (!['main.js', 'styles.css', 'manifest.json'].includes(asset)) {
        res.status(400).json({ error: 'invalid asset' });
        return;
    }
    const body = await plugins.getPluginAsset(req.params.id, asset as 'main.js' | 'styles.css' | 'manifest.json', req.query.version ? String(req.query.version) : undefined);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(asset === 'styles.css' ? 'text/css' : asset === 'manifest.json' ? 'application/json' : 'application/javascript').send(body);
}));
// Filesystem exceptions can contain private host paths; only explicit public errors escape.
pluginsRouter.use((error: any, _req: any, res: any, _next: any) => {
    const status = typeof error.status === 'number' ? error.status : error.code === 'ENOENT' ? 404 : 503;
    res.status(status).json({ error: typeof error.status === 'number' ? error.message : status === 404 ? 'PLUGIN_NOT_FOUND' : 'PLUGIN_ASSET_UNAVAILABLE' });
});
