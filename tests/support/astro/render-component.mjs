import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';
import { createServer } from 'vite';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

// Compile real components through Astro's Vite plugins without building routes.
export async function createComponentRenderer(astroConfig = {}) {
    const config = await getViteConfig({
        configFile: false,
        envFile: false,
        logLevel: 'error',
        cacheDir: repository + 'artifacts/component-rendering/vite',
        server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    }, {
        ...astroConfig,
        root: repository,
        // Component tests do not discover the website's routes.
        srcDir: fileURLToPath(new URL('./', import.meta.url)),
        logLevel: 'error',
        devToolbar: { enabled: false },
        configFile: false,
        // Astro loads environment files separately from Vite's envFile setting.
        vite: { ...astroConfig.vite, envDir: repository + 'artifacts/component-rendering/env' },
        cacheDir: repository + 'artifacts/component-rendering/astro',
    })({ mode: 'test', command: 'serve' });
    const server = await createServer(config);
    try {
        const { experimental_AstroContainer } = await server.ssrLoadModule('astro/container');
        const container = await experimental_AstroContainer.create();
        return {
            async render(path, props) {
                const { default: component } = await server.ssrLoadModule(repository + path);
                return container.renderToString(component, { props });
            },
            close: () => server.close(),
        };
    } catch (error) {
        await server.close();
        throw error;
    }
}
