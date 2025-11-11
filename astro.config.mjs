import { defineConfig, envField } from 'astro/config';
import mdx from "@astrojs/mdx";
import yaml from '@rollup/plugin-yaml';

import netlify from '@astrojs/netlify';
import node from '@astrojs/node';

function isNetlify() {
  return process.env.NETLIFY === 'true' || 
         process.env.NETLIFY_DEV === 'true' ||
         !!process.env.AWS_LAMBDA_FUNCTION_NAME
}

const adapter = isNetlify() 
  ? netlify() 
  : node({ mode: 'standalone' });

export default defineConfig({
  //output: 'server',
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
    '/helpimagesatebi': '/bioimage-archive/policies/imagesatebi',
  },
  env: {
    schema: {
      PUBLIC_SEARCH_API: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "http://search:8080"
      }),
      PUBLIC_MONGO_API: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "http://api:8080/v2"
      })
    }
  },

  adapter
});