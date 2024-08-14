import { defineConfig } from 'astro/config';
import mdx from "@astrojs/mdx";
import yaml from '@rollup/plugin-yaml';

//import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  //output: 'hybrid',
  //integrations: [mdx(), preact()]
  integrations: [mdx()],
  outDir: './dist/bioimage-archive',
  vite: {
    plugins: [yaml()]
  },
  base: "/bioimage-archive",
  redirects: {
    '/ai': '/bioimage-archive//galleries/ai',
    '/cryoet': '/bioimage-archive/galleries/cryoet',
    '/vem': '/bioimage-archive/galleries/vem',
    '/vis': '/bioimage-archive/galleries/vis',
    '/ai-glossary': '/bioimage-archive/help/ai-glossary',
    '/help-download': '/bioimage-archive/help/downloading-data',
    '/faq': '/bioimage-archive/help/faq',
    '/help-file-list': '/bioimage-archive/help/file-list',
    '/galleries-contribute': '/bioimage-archive/help/galleries-contribute',
    '/linking-archives': '/bioimage-archive/help/linking-archives',
    '/mifa-model-reference': '/bioimage-archive/help/mifa-model-reference',
    '/mifa-help-overview': '/bioimage-archive/help/mifa-overview',
    '/rembi-help-examples': '/bioimage-archive/help/rembi-examples',
    '/rembi-help-lab': '/bioimage-archive/help/rembi-lab-guide',
    '/rembi-model-reference': '/bioimage-archive/help/rembi-model-reference',
    '/rembi-help-overview': '/bioimage-archive/help/rembi-overview',
    '/help-search': '/bioimage-archive/help/search',
    '/submit-annotations': '/bioimage-archive/help/submit-annotations',
    '/help-tools': '/bioimage-archive/help/supporting-tools',
    '/helpimagesatebi': '/bioimage-archive/policiies/imagesatebi',
  }
});
