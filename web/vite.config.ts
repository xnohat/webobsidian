import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pdfAssetBase} from './src/lib/pdfAssets';
import {scopePdfStyles} from './scripts/pdfStyles';
const require=createRequire(import.meta.url);
const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfAssetSource=(name:string)=>{
  if(name==='pdf.worker.min.mjs')return 'build/'+name;
  if(name==='pdf_viewer.css')return 'web/'+name;
  if(/^images\//.test(name))return 'web/'+name;
  if(/^(cmaps|standard_fonts|wasm)\//.test(name))return name;
  return null;
};

// Web build outputs to ../server/public so the server can serve the SPA.
export default defineConfig({
  plugins: [react(),{name:'pdf-viewer-assets',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const url=(req.url||'').split('?')[0];if(!url.startsWith(pdfAssetBase))return next();
      let name:string;try{name=decodeURIComponent(url.slice(pdfAssetBase.length))}catch{return next()}
      if(name.split(/[\\/]/).some(p=>p==='..'||p==='.')||name.includes('\\'))return next();
      const source=pdfAssetSource(name);if(!source)return next();
      try{let data=readFileSync(path.join(pdfRoot,source));if(name==='pdf_viewer.css')data=Buffer.from(scopePdfStyles(data.toString()));res.setHeader('Content-Type',/\.(mjs|js)$/.test(name)?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(data)}catch{next()}
    });
  },generateBundle(){
    const root=pdfRoot;
    const emit=(source:string,name:string)=>{const data=readFileSync(path.join(root,source));this.emitFile({type:'asset',fileName:pdfAssetBase.slice(1)+name,source:name==='pdf_viewer.css'?scopePdfStyles(data.toString()):data})};
    emit('build/pdf.worker.min.mjs','pdf.worker.min.mjs');emit('web/pdf_viewer.css','pdf_viewer.css');
    const copy=(dir:string,target=dir)=>{for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){
      if(entry.isDirectory())copy(dir+'/'+entry.name,target+'/'+entry.name);else emit(dir+'/'+entry.name,target+'/'+entry.name);
    }};
    for(const dir of ['cmaps','standard_fonts','wasm','web/images'])copy(dir,dir==='web/images'?'images':dir);
  }}],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input:{index:path.resolve(import.meta.dirname,'index.html'),'public-embeds':path.resolve(import.meta.dirname,'src/publicEmbeds.ts')},
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lang-markdown',
            '@codemirror/theme-one-dark',
          ],
          markdown: [
            'unified',
            'remark-parse',
            'remark-gfm',
            'remark-rehype',
            'rehype-raw',
            'rehype-sanitize',
            'rehype-stringify',
          ],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
      '/public': 'http://localhost:8787',
      '/share': 'http://localhost:8787', // SSR share page is server-rendered even in dev
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
