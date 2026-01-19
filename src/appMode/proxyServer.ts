import * as http from 'http';
import * as net from 'net';
import type { AddressInfo } from 'net';
import httpProxy from 'http-proxy';
import * as zlib from 'zlib';

export type AppProxyServer = {
	proxyOrigin: string;
	close: () => Promise<void>;
};

function injectScriptsIntoHtml(html: string, scripts: { early?: string; late?: string }): string {
	let out = html;
	const early = scripts.early ? String(scripts.early) : '';
	const late = scripts.late ? String(scripts.late) : '';

	if (early) {
		const tag = `<script>${early}</script>`;
		const headOpen = out.match(/<head\b[^>]*>/i);
		if (headOpen && typeof headOpen.index === 'number') {
			const idx = headOpen.index + headOpen[0].length;
			out = out.slice(0, idx) + tag + out.slice(idx);
		} else {
			out = tag + out;
		}
	}

	if (late) {
		const tag = `<script>${late}</script>`;
		const headClose = out.toLowerCase().lastIndexOf('</head>');
		if (headClose !== -1) return out.slice(0, headClose) + tag + out.slice(headClose);
		const bodyClose = out.toLowerCase().lastIndexOf('</body>');
		if (bodyClose !== -1) return out.slice(0, bodyClose) + tag + out.slice(bodyClose);
		return out + tag;
	}

	return out;
}

async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address() as AddressInfo;
			const port = addr.port;
			srv.close(() => resolve(port));
		});
	});
}

function headerValue(h: unknown): string | undefined {
	if (typeof h === 'string') return h;
	if (Array.isArray(h)) return h.join(',');
	return undefined;
}

function decodeBody(body: Buffer, contentEncoding: string): Buffer {
	const enc = (contentEncoding || '').toLowerCase().trim();
	if (!enc || enc === 'identity') return body;

	try {
		if (enc.includes('gzip')) return zlib.gunzipSync(body);
		if (enc.includes('br')) return zlib.brotliDecompressSync(body);
		if (enc.includes('deflate')) return zlib.inflateSync(body);
	} catch {
		// If decoding fails, return original. Better to show something than hard-fail.
	}

	return body;
}

export async function startInjectedProxyServer(opts: {
	targetOrigin: string;
	getEarlyScript?: () => string | undefined;
	getInjectedScript: () => string;
	logger?: (line: string) => void;
}): Promise<AppProxyServer> {
	const { targetOrigin, getInjectedScript, getEarlyScript, logger } = opts;

	const proxy = httpProxy.createProxyServer({
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
		} catch {
			// ignore
		}
	});

	proxy.on('proxyRes', (proxyRes, req, res) => {
		const ct = headerValue(proxyRes.headers['content-type']) ?? '';
		const isHtml = ct.toLowerCase().includes('text/html');
		const contentEncoding = headerValue(proxyRes.headers['content-encoding']) ?? '';

		// Remove frame-busting headers so the app can render in an <iframe>.
		const headers: Record<string, string | string[]> = {};
		for (const [k, v] of Object.entries(proxyRes.headers)) {
			if (!k) continue;
			const key = k.toLowerCase();
			if (key === 'x-frame-options') continue;
			if (key === 'content-security-policy') continue;
			if (v === undefined) continue;
			headers[k] = v as any;
		}

		if (!isHtml) {
			res.writeHead(proxyRes.statusCode ?? 200, headers);
			proxyRes.pipe(res);
			return;
		}

		const chunks: Buffer[] = [];
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
			delete (headers as any)['content-length'];
			// We injected into the decoded HTML; don't lie about encoding.
			delete (headers as any)['content-encoding'];
			delete (headers as any)['transfer-encoding'];
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
		proxy.ws(req, socket as any, head);
	});

	const port = await getFreePort();
	await new Promise<void>((resolve, reject) => {
		server.on('error', reject);
		server.listen(port, '127.0.0.1', () => resolve());
	});

	const proxyOrigin = `http://127.0.0.1:${port}`;
	logger?.(`[proxy] ${proxyOrigin} -> ${targetOrigin}`);

	return {
		proxyOrigin,
		close: async () => {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		},
	};
}
