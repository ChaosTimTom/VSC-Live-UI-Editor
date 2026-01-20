import esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
	entryPoints: ['src/extension.ts'],
	outfile: 'dist/extension.js',
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node16',
	sourcemap: isWatch,
	minify: !isWatch,
	logLevel: 'info',
	legalComments: 'none',
	external: ['vscode'],
	define: {
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
	},
};

if (isWatch) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	console.log('[esbuild] watching…');
} else {
	await esbuild.build(options);
}
