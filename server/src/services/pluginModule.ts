import { Script } from 'node:vm';
import { pluginError } from './pluginStorage.js';
/** Parse only. Installed plugin code is never run in the server process. */
export async function compilePluginModule(source: string): Promise<string> {
    if (Buffer.byteLength(source) > 16 * 1024 * 1024)
        pluginError(413, 'Plugin JavaScript exceeds 16 MiB');
    const factory = 'function(module, exports, require) {\n' + source + '\n}';
    try {
        new Script('"use strict";(' + factory + ');', { filename: 'plugin-validation.js' });
        return 'export default ' + factory + ';\n';
    }
    catch {
        pluginError(422, 'PLUGIN_COMPILE_ERROR: invalid JavaScript');
    }
}
