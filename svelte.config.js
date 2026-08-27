import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// vitePreprocess habilita TypeScript, PostCSS, etc. dentro de los .svelte
	preprocess: vitePreprocess(),

	kit: {
		// adapter-node: despliegue como servidor Node 24 (necesario para firebase-admin y cookies de sesión SSR)
		adapter: adapter(),
		alias: {
			$components: 'src/lib/components',
			$server: 'src/lib/server'
		}
	}
};

export default config;
