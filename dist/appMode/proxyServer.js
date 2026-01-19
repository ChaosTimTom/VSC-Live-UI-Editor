"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startInjectedProxyServer = startInjectedProxyServer;
const http = __importStar(require("http"));
const net = __importStar(require("net"));
const http_proxy_1 = __importDefault(require("http-proxy"));
const zlib = __importStar(require("zlib"));
function injectScriptsIntoHtml(html, scripts) {
    let out = html;
    const early = scripts.early ? String(scripts.early) : '';
    const late = scripts.late ? String(scripts.late) : '';
    if (early) {
        const tag = `<script>${early}</script>`;
        const headOpen = out.match(/<head\b[^>]*>/i);
        if (headOpen && typeof headOpen.index === 'number') {
            const idx = headOpen.index + headOpen[0].length;
            out = out.slice(0, idx) + tag + out.slice(idx);
        }
        else {
            out = tag + out;
        }
    }
    if (late) {
        const tag = `<script>${late}</script>`;
        const headClose = out.toLowerCase().lastIndexOf('</head>');
        if (headClose !== -1)
            return out.slice(0, headClose) + tag + out.slice(headClose);
        const bodyClose = out.toLowerCase().lastIndexOf('</body>');
        if (bodyClose !== -1)
            return out.slice(0, bodyClose) + tag + out.slice(bodyClose);
        return out + tag;
    }
    return out;
}
async function getFreePort() {
    return await new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = addr.port;
            srv.close(() => resolve(port));
        });
    });
}
function headerValue(h) {
    if (typeof h === 'string')
        return h;
    if (Array.isArray(h))
        return h.join(',');
    return undefined;
}
function decodeBody(body, contentEncoding) {
    const enc = (contentEncoding || '').toLowerCase().trim();
    if (!enc || enc === 'identity')
        return body;
    try {
        if (enc.includes('gzip'))
            return zlib.gunzipSync(body);
        if (enc.includes('br'))
            return zlib.brotliDecompressSync(body);
        if (enc.includes('deflate'))
            return zlib.inflateSync(body);
    }
    catch {
        // If decoding fails, return original. Better to show something than hard-fail.
    }
    return body;
}
async function startInjectedProxyServer(opts) {
    const { targetOrigin, getInjectedScript, getEarlyScript, logger } = opts;
    const proxy = http_proxy_1.default.createProxyServer({
        target: targetOrigin,
        changeOrigin: true,
        ws: true,
        selfHandleResponse: true,
    });
    proxy.on('error', err => {
        logger?.(`[proxy:error] ${String(err)}`);
    });
    proxy.on('proxyReq', (proxyReq) => {
        // Avoid compressed HTML where possible (Next.js often serves gzip/br).
        // If the upstream still returns compressed content, we decode it in proxyRes.
        try {
            proxyReq.setHeader('accept-encoding', 'identity');
        }
        catch {
            // ignore
        }
    });
    proxy.on('proxyRes', (proxyRes, req, res) => {
        const ct = headerValue(proxyRes.headers['content-type']) ?? '';
        const isHtml = ct.toLowerCase().includes('text/html');
        const contentEncoding = headerValue(proxyRes.headers['content-encoding']) ?? '';
        // Remove frame-busting headers so the app can render in an <iframe>.
        const headers = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (!k)
                continue;
            const key = k.toLowerCase();
            if (key === 'x-frame-options')
                continue;
            if (key === 'content-security-policy')
                continue;
            if (v === undefined)
                continue;
            headers[k] = v;
        }
        if (!isHtml) {
            res.writeHead(proxyRes.statusCode ?? 200, headers);
            proxyRes.pipe(res);
            return;
        }
        const chunks = [];
        proxyRes.on('data', d => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        proxyRes.on('end', () => {
            const rawBytes = Buffer.concat(chunks);
            const decoded = decodeBody(rawBytes, contentEncoding);
            const raw = decoded.toString('utf8');
            const injected = injectScriptsIntoHtml(raw, {
                early: getEarlyScript ? (getEarlyScript() || '') : '',
                late: getInjectedScript(),
            });
            const body = Buffer.from(injected, 'utf8');
            // Ensure content-length is correct after injection.
            delete headers['content-length'];
            // We injected into the decoded HTML; don't lie about encoding.
            delete headers['content-encoding'];
            delete headers['transfer-encoding'];
            res.writeHead(proxyRes.statusCode ?? 200, {
                ...headers,
                'content-length': String(body.byteLength),
            });
            res.end(body);
        });
    });
    const server = http.createServer((req, res) => {
        proxy.web(req, res);
    });
    server.on('upgrade', (req, socket, head) => {
        proxy.ws(req, socket, head);
    });
    const port = await getFreePort();
    await new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve());
    });
    const proxyOrigin = `http://127.0.0.1:${port}`;
    logger?.(`[proxy] ${proxyOrigin} -> ${targetOrigin}`);
    return {
        proxyOrigin,
        close: async () => {
            await new Promise((resolve) => {
                server.close(() => resolve());
            });
        },
    };
}
//# sourceMappingURL=proxyServer.js.map