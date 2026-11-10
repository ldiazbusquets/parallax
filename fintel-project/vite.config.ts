import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Sources that don't allow browser requests (no CORS) are fetched through the dev/preview server.
// The browser calls /px/<name>/..., the server forwards it to the real host. Nothing here is a secret:
// API keys stay in the browser (Settings) and are sent per request.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function relay(target: string, prefix: string, headers: Record<string, string> = {}): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(new RegExp('^' + prefix), ''),
    headers,
    configure: (proxy) => {
      proxy.on('proxyReq', (req) => { req.removeHeader('cookie'); req.removeHeader('origin'); req.removeHeader('referer'); });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // SEC asks automated clients to identify themselves with a contact address.
  const secUA = env.SEC_USER_AGENT || 'Parallax research terminal (set SEC_USER_AGENT in .env)';
  const proxy: Record<string, ProxyOptions> = {
    '/px/yahoo': relay('https://query1.finance.yahoo.com', '/px/yahoo', { 'User-Agent': BROWSER_UA }),
    '/px/fred': relay('https://fred.stlouisfed.org', '/px/fred', { 'User-Agent': BROWSER_UA }),
    '/px/sec': relay('https://www.sec.gov', '/px/sec', { 'User-Agent': secUA, Accept: 'application/atom+xml,application/xml,text/xml,*/*' }),
    '/px/fed': relay('https://www.federalreserve.gov', '/px/fed', { 'User-Agent': BROWSER_UA }),
    '/px/cnbc': relay('https://search.cnbc.com', '/px/cnbc', { 'User-Agent': BROWSER_UA }),
    '/px/mw': relay('https://feeds.content.dowjones.io', '/px/mw', { 'User-Agent': BROWSER_UA }),
    '/px/xbrl': relay('https://data.sec.gov', '/px/xbrl', { 'User-Agent': secUA }),
    '/px/imf': relay('https://www.imf.org', '/px/imf', { 'User-Agent': BROWSER_UA }),
    '/px/bis': relay('https://stats.bis.org', '/px/bis', { 'User-Agent': BROWSER_UA }),
    '/px/ff': relay('https://nfs.faireconomy.media', '/px/ff', { 'User-Agent': BROWSER_UA }),
    '/px/boe': relay('https://www.bankofengland.co.uk', '/px/boe', { 'User-Agent': BROWSER_UA }),
    '/px/mof': relay('https://www.mof.go.jp', '/px/mof', { 'User-Agent': BROWSER_UA }),
    '/px/rba': relay('https://www.rba.gov.au', '/px/rba', { 'User-Agent': BROWSER_UA }),
    '/px/nasdaq': relay('https://api.nasdaq.com', '/px/nasdaq', { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/plain, */*' }),
    '/px/finra': relay('https://api.finra.org', '/px/finra', { 'User-Agent': BROWSER_UA, Accept: 'application/json' }),
    '/px/adsb': relay('https://api.adsb.lol', '/px/adsb', { 'User-Agent': BROWSER_UA, Accept: 'application/json' }),
  };
  return {
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: { proxy },
    preview: { proxy },
    build: {
      target: 'es2021',
      chunkSizeWarningLimit: 1200,
      rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], maplibre: ['maplibre-gl'] } } },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  } as any;
});
