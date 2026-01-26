import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';

type HelpPage = {
	id: string;
	title: string;
	sourceLabel: string;
	markdown: string;
	html: string;
	text: string;
};

let currentPanel: vscode.WebviewPanel | undefined;

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) nonce += possible.charAt(Math.floor(Math.random() * possible.length));
	return nonce;
}

function stripHtmlToText(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

async function readUtf8(uri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	return Buffer.from(bytes).toString('utf8');
}

function getMarkdownRenderer(): MarkdownIt {
	const md = new MarkdownIt({
		html: false,
		linkify: true,
		typographer: true,
	});

	md.use(markdownItAnchor, {
		permalink: false,
		level: [1, 2, 3, 4],
	});

	// Force external links to open in the user's browser.
	const defaultLinkOpen = md.renderer.rules.link_open;
	md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		const aIndex = token.attrIndex('target');
		if (aIndex < 0) token.attrPush(['target', '_blank']);
		const relIndex = token.attrIndex('rel');
		if (relIndex < 0) token.attrPush(['rel', 'noopener noreferrer']);
		return defaultLinkOpen ? defaultLinkOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
	};

	return md;
}

async function loadHelpPages(extensionUri: vscode.Uri): Promise<HelpPage[]> {
	const md = getMarkdownRenderer();

	const docsRoot = vscode.Uri.joinPath(extensionUri, 'docs', 'help');
	const pageDefs: Array<{ id: string; title: string; uri: vscode.Uri; sourceLabel: string }> = [
		{ id: 'getting-started', title: 'Getting Started', uri: vscode.Uri.joinPath(docsRoot, 'getting-started.md'), sourceLabel: 'docs/help/getting-started.md' },
		{ id: 'static-html-mode', title: 'Static HTML Mode', uri: vscode.Uri.joinPath(docsRoot, 'static-html-mode.md'), sourceLabel: 'docs/help/static-html-mode.md' },
		{ id: 'app-mode', title: 'App Mode', uri: vscode.Uri.joinPath(docsRoot, 'app-mode.md'), sourceLabel: 'docs/help/app-mode.md' },
		{ id: 'troubleshooting', title: 'Troubleshooting', uri: vscode.Uri.joinPath(docsRoot, 'troubleshooting.md'), sourceLabel: 'docs/help/troubleshooting.md' },
		{ id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', uri: vscode.Uri.joinPath(docsRoot, 'keyboard-shortcuts.md'), sourceLabel: 'docs/help/keyboard-shortcuts.md' },
	];

	const pages: HelpPage[] = [];
	for (const p of pageDefs) {
		const markdown = await readUtf8(p.uri);
		const html = md.render(markdown);
		pages.push({
			id: p.id,
			title: p.title,
			sourceLabel: p.sourceLabel,
			markdown,
			html,
			text: stripHtmlToText(html),
		});
	}

	// Patch notes are sourced dynamically from CHANGELOG.md (so it always stays current).
	try {
		const changelogUri = vscode.Uri.joinPath(extensionUri, 'CHANGELOG.md');
		const markdown = await readUtf8(changelogUri);
		const html = md.render(markdown);
		pages.push({
			id: 'patch-notes',
			title: 'Patch Notes',
			sourceLabel: 'CHANGELOG.md',
			markdown,
			html,
			text: stripHtmlToText(html),
		});
	} catch {
		// Optional; don’t fail the panel if changelog isn’t accessible.
	}

	return pages;
}

function buildHelpHtml(webview: vscode.Webview, pages: HelpPage[]): string {
	const nonce = getNonce();
	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} https: data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src ${webview.cspSource} 'nonce-${nonce}'`,
	].join('; ');

	const pagesPayload = pages.map(p => ({
		id: p.id,
		title: p.title,
		sourceLabel: p.sourceLabel,
		html: p.html,
		text: p.text,
	}));

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<title>Live UI Editor — Help</title>
	<style>
		:root{
			--bg0:#070914;
			--bg1:#0b1024;
			--card:rgba(255,255,255,.06);
			--card2:rgba(255,255,255,.09);
			--border:rgba(61, 225, 255, .28);
			--border2:rgba(255, 117, 217, .25);
			--text:rgba(255,255,255,.92);
			--muted:rgba(255,255,255,.70);
			--muted2:rgba(255,255,255,.55);
			--teal:#3DE1FF;
			--pink:#FF75D9;
			--violet:#8A5CFF;
			--shadow: 0 14px 48px rgba(0,0,0,.48);
			--radius:16px;
			--radius2:12px;
			--mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		}
		*{box-sizing:border-box}
		html,body{height:100%}
		body{
			margin:0;
			color:var(--text);
			font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji", "Segoe UI Emoji";
			background:
				radial-gradient(1100px 720px at 18% 14%, rgba(61,225,255,.16), transparent 60%),
				radial-gradient(900px 640px at 84% 20%, rgba(255,117,217,.12), transparent 62%),
				radial-gradient(920px 740px at 60% 90%, rgba(138,92,255,.12), transparent 58%),
				linear-gradient(180deg, var(--bg0), var(--bg1));
			overflow:hidden;
		}
		#root{height:100%; display:grid; grid-template-columns: 320px 1fr; gap:14px; padding:14px;}
		.sidebar{
			border:1px solid var(--border);
			border-radius: var(--radius);
			background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.05));
			backdrop-filter: blur(12px);
			box-shadow: var(--shadow);
			overflow:hidden;
			display:flex;
			flex-direction:column;
		}
		.sidebarHeader{padding:14px 14px 10px 14px; border-bottom:1px solid rgba(61,225,255,.18);}
		.title{font-weight:800; letter-spacing:.2px; font-size:14px;}
		.subtitle{margin-top:6px; color:var(--muted2); font-size:12px; line-height:1.3;}
		.searchRow{display:flex; gap:8px; margin-top:10px;}
		.searchInput{
			width:100%;
			padding:10px 10px;
			border-radius: 12px;
			border:1px solid rgba(61,225,255,.22);
			background: rgba(0,0,0,.22);
			color: var(--text);
			outline:none;
		}
		.searchInput:focus{border-color: rgba(61,225,255,.55); box-shadow: 0 0 0 3px rgba(61,225,255,.10)}
		.nav{padding:10px; overflow:auto;}
		.navItem{margin-bottom:8px;}
		.navBtn{
			width:100%;
			text-align:left;
			border:1px solid transparent;
			background: transparent;
			color: var(--text);
			padding:10px 10px;
			border-radius: 12px;
			cursor:pointer;
			transition: background .12s ease, border-color .12s ease;
		}
		.navBtn:hover{background: rgba(255,255,255,.06); border-color: rgba(61,225,255,.18)}
		.navBtn.active{background: rgba(61,225,255,.10); border-color: rgba(61,225,255,.32)}
		.navLabel{font-weight:700; font-size:13px;}
		.navMeta{color: var(--muted2); font-size:11px; margin-top:3px;}
		.navToc{margin-top:8px; padding:10px 10px 8px 10px; border-radius: 12px; border:1px solid rgba(255,117,217,.18); background: rgba(0,0,0,.14); display:none;}
		.navToc.visible{display:block;}
		.navTocTitle{font-weight:900; font-size:11px; color: var(--muted); letter-spacing:.25px; margin-bottom:8px;}
		.navTocLink{display:block; width:100%; text-align:left; padding:6px 8px; border-radius: 10px; border:1px solid transparent; background: transparent; color: var(--muted); cursor:pointer; font-size:12px;}
		.navTocLink:hover{background: rgba(255,255,255,.06); border-color: rgba(255,117,217,.18); color: var(--text)}
		.navTocLink.indent{padding-left:16px;}
		.results{padding:0 10px 10px 10px; display:none;}
		.results.visible{display:block;}
		.resultItem{border:1px solid rgba(255,117,217,.22); background: rgba(255,117,217,.06); border-radius: 12px; padding:10px; cursor:pointer; margin-top:8px;}
		.resultItem:hover{border-color: rgba(255,117,217,.38)}
		.resultTitle{font-weight:800; font-size:12px;}
		.resultMeta{color: var(--muted2); font-size:11px; margin-top:4px;}

		.main{
			border:1px solid var(--border2);
			border-radius: var(--radius);
			background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.04));
			backdrop-filter: blur(12px);
			box-shadow: var(--shadow);
			overflow:hidden;
			display:flex;
			flex-direction:column;
		}
		.topbar{padding:12px 14px; border-bottom:1px solid rgba(255,117,217,.18); display:flex; align-items:center; gap:10px;}
		.pageTitle{font-weight:900; font-size:14px; letter-spacing:.2px;}
		.sourceTag{margin-left:auto; color: var(--muted2); font-size:11px; padding:4px 8px; border:1px solid rgba(255,255,255,.14); border-radius:999px; background: rgba(0,0,0,.18)}
		.contentWrap{padding:14px; overflow:auto;}
		.content{min-width:0; padding:14px; border-radius: var(--radius); border:1px solid rgba(61,225,255,.18); background: rgba(0,0,0,.16)}

		/* Markdown content styling */
		.content h1{margin:0 0 12px 0; font-size:22px;}
		.content h2{margin:18px 0 10px 0; font-size:16px;}
		.content h3{margin:16px 0 8px 0; font-size:14px; color: var(--muted);}
		.content p, .content li{color: var(--muted); line-height:1.55;}
		.content a{color: var(--teal); text-decoration: none;}
		.content a:hover{text-decoration: underline;}
		.content code{font-family: var(--mono); font-size: 12px; padding:.12em .35em; border-radius:8px; background: rgba(61,225,255,.10); border:1px solid rgba(61,225,255,.18); color: rgba(255,255,255,.92)}
		.content pre{background: rgba(0,0,0,.26); border:1px solid rgba(255,255,255,.12); border-radius: 14px; padding:12px; overflow:auto;}
		.content pre code{background: transparent; border:none; padding:0;}
		.content hr{border:none; border-top:1px solid rgba(255,255,255,.10); margin:16px 0;}
		.content blockquote{margin:12px 0; padding:10px 12px; border-left:3px solid rgba(138,92,255,.65); background: rgba(138,92,255,.08); border-radius: 12px;}

		@media (max-width: 980px){
			#root{grid-template-columns: 1fr;}
		}
	</style>
</head>
<body>
	<div id="root">
		<div class="sidebar">
			<div class="sidebarHeader">
				<div class="title">Live UI Editor — Help</div>
				<div class="subtitle">Interactive docs, troubleshooting, and patch notes.</div>
				<div class="searchRow">
					<input id="search" class="searchInput" placeholder="Search docs…" />
				</div>
			</div>
			<div id="results" class="results"></div>
			<div id="nav" class="nav"></div>
		</div>
		<div class="main">
			<div class="topbar">
				<div id="pageTitle" class="pageTitle">Help</div>
				<div id="sourceTag" class="sourceTag"></div>
			</div>
			<div id="contentWrap" class="contentWrap">
				<div id="content" class="content"></div>
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		const PAGES = ${JSON.stringify(pagesPayload)};
		const state = {
			activeId: PAGES[0]?.id || '',
			query: '',
		};

		const navEl = document.getElementById('nav');
		const contentWrapEl = document.getElementById('contentWrap');
		const contentEl = document.getElementById('content');
		const titleEl = document.getElementById('pageTitle');
		const sourceTagEl = document.getElementById('sourceTag');
		const searchEl = document.getElementById('search');
		const resultsEl = document.getElementById('results');

		function setActive(id){
			const page = PAGES.find(p => p.id === id);
			if(!page) return;
			state.activeId = id;
			titleEl.textContent = page.title;
			sourceTagEl.textContent = page.sourceLabel;
			contentEl.innerHTML = page.html;
			renderNav();
			renderActiveNavToc();
			if (contentWrapEl) contentWrapEl.scrollTop = 0;
		}

		function getTocItems(){
			const headings = contentEl.querySelectorAll('h2, h3');
			const items = [];
			headings.forEach(h => {
				const id = h.id;
				if(!id) return;
				items.push({ id, text: h.textContent || '', level: h.tagName === 'H3' ? 3 : 2 });
			});
			return items;
		}

		function renderActiveNavToc(){
			// Hide TOC while searching (keeps the sidebar clean).
			if (state.query && state.query.trim()){
				for (const el of navEl.querySelectorAll('.navToc')){
					el.classList.remove('visible');
					el.innerHTML = '';
				}
				return;
			}

			for (const el of navEl.querySelectorAll('.navToc')){
				el.classList.remove('visible');
				el.innerHTML = '';
			}

			const active = navEl.querySelector('.navItem[data-id="' + state.activeId + '"]');
			if(!active) return;
			const toc = active.querySelector('.navToc');
			if(!toc) return;

			const items = getTocItems();
			if(!items.length) return;
			toc.classList.add('visible');

			const t = document.createElement('div');
			t.className = 'navTocTitle';
			t.textContent = 'On this page';
			toc.appendChild(t);

			for (const item of items){
				const btn = document.createElement('button');
				btn.className = 'navTocLink' + (item.level === 3 ? ' indent' : '');
				btn.type = 'button';
				btn.textContent = item.text;
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					const target = document.getElementById(item.id);
					if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
					history.replaceState(null, '', '#' + item.id);
				});
				toc.appendChild(btn);
			}
		}

		function renderNav(){
			navEl.innerHTML = '';
			for(const p of PAGES){
				const item = document.createElement('div');
				item.className = 'navItem';
				item.dataset.id = p.id;

				const btn = document.createElement('button');
				btn.className = 'navBtn' + (p.id === state.activeId ? ' active' : '');
				btn.dataset.id = p.id;
				const label = document.createElement('div');
				label.className = 'navLabel';
				label.textContent = p.title;
				const meta = document.createElement('div');
				meta.className = 'navMeta';
				meta.textContent = p.sourceLabel;
				btn.appendChild(label);
				btn.appendChild(meta);
				btn.addEventListener('click', () => setActive(p.id));

				const toc = document.createElement('div');
				toc.className = 'navToc';

				item.appendChild(btn);
				item.appendChild(toc);
				navEl.appendChild(item);
			}
		}

		function renderSearchResults(){
			const q = state.query.trim().toLowerCase();
			resultsEl.innerHTML = '';
			if(!q){
				resultsEl.classList.remove('visible');
				return;
			}
			const hits = PAGES
				.map(p => {
					const t = (p.text || '').toLowerCase();
					let count = 0;
					let idx = t.indexOf(q);
					while(idx !== -1){
						count++;
						idx = t.indexOf(q, idx + q.length);
						if(count > 20) break;
					}
					return { p, count };
				})
				.filter(h => h.count > 0)
				.sort((a,b) => b.count - a.count);

			resultsEl.classList.add('visible');
			if(!hits.length){
				const empty = document.createElement('div');
				empty.style.color = 'rgba(255,255,255,.55)';
				empty.style.fontSize = '12px';
				empty.style.padding = '10px';
				empty.textContent = 'No matches';
				resultsEl.appendChild(empty);
				return;
			}

			for(const h of hits.slice(0, 8)){
				const div = document.createElement('div');
				div.className = 'resultItem';
				const t = document.createElement('div');
				t.className = 'resultTitle';
				t.textContent = h.p.title;
				const m = document.createElement('div');
				m.className = 'resultMeta';
				m.textContent = String(h.count) + ' match(es)';
				div.appendChild(t);
				div.appendChild(m);
				div.addEventListener('click', () => {
					setActive(h.p.id);
					setTimeout(() => {
						try { window.find(state.query); } catch {}
					}, 50);
				});
				resultsEl.appendChild(div);
			}
		}

		searchEl.addEventListener('input', (e) => {
			state.query = e.target.value || '';
			renderSearchResults();
			renderActiveNavToc();
		});

		renderNav();
		setActive(state.activeId);
	</script>
</body>
</html>`;
}

export class HelpPanel {
	static async show(context: vscode.ExtensionContext): Promise<void> {
		if (currentPanel) {
			currentPanel.reveal();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'liveUI.help',
			'Live UI Editor — Help',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'docs'), context.extensionUri],
			}
		);

		currentPanel = panel;
		panel.onDidDispose(() => {
			currentPanel = undefined;
		});

		const pages = await loadHelpPages(context.extensionUri);
		panel.webview.html = buildHelpHtml(panel.webview, pages);
	}
}
