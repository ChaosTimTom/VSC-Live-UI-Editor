import * as http from 'http';
import * as net from 'net';
import type { AddressInfo } from 'net';
import httpProxy from 'http-proxy';

export type AppProxyServer = {
	proxyOrigin: string;
	close: () => Promise<void>;
};

function injectScriptIntoHtml(html: string, scriptContents: string): string {
	const tag = `<script>${scriptContents}</script>`;
	const headClose = html.toLowerCase().lastIndexOf('</head>');
	if (headClose !== -1) return html.slice(0, headClose) + tag + html.slice(headClose);
	const bodyClose = html.toLowerCase().lastIndexOf('</body>');
	if (bodyClose !== -1) return html.slice(0, bodyClose) + tag + html.slice(bodyClose);
	return html + tag;
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

export async function startInjectedProxyServer(opts: {
	targetOrigin: string;
	injectedScript: string;
	logger?: (line: string) => void;
}): Promise<AppProxyServer> {
	const { targetOrigin, injectedScript, logger } = opts;

	const proxy = httpProxy.createProxyServer({
		target: targetOrigin,
		changeOrigin: true,
		ws: true,
		selfHandleResponse: true,
	});

	proxy.on('error', err => {
		logger?.(`[proxy:error] ${String(err)}`);
	});

	proxy.on('proxyRes', (proxyRes, req, res) => {
		const ct = headerValue(proxyRes.headers['content-type']) ?? '';
		const isHtml = ct.toLowerCase().includes('text/html');

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
			const raw = Buffer.concat(chunks).toString('utf8');
			const injected = injectScriptIntoHtml(raw, injectedScript);
			const body = Buffer.from(injected, 'utf8');

			// Ensure content-length is correct after injection.
			delete (headers as any)['content-length'];
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
