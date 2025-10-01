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
        default: "https://alpha.bioimagearchive.org/search"
      }),
      PUBLIC_MONGO_API: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "https://wwwdev.ebi.ac.uk/bioimage-archive/api/v2"
      }),
      PUBLIC_ON_DEMAND_TUTORIAL: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "https://www.ebi.ac.uk/ebisearch/ws/rest/ebiweb_training_online?format=json&query=domain_source:ebiweb_training_online&start=0&size=2&fields=title,subtitle,description,type,url&sort=title&facets=resource_training_page:BioImage%20Archive"
      }),
      PUBLIC_LIVE_TUTORIAL: envField.string({
        type: "string",
        required: true,
        access: "public",
        context: "client",
        default: "https://www.ebi.ac.uk/ebisearch/ws/rest/ebiweb_training_events?format=json&query=domain_source:ebiweb_training_events%20AND%20timeframe:upcoming&start=0&size=2&fieldurl=true&fields=title,description,start_date,end_date,date_time_clean,resource_training_page,type,training_type,url,venue,materials,status,timeframe,resource_training_page,course_image&facetcount=50&sort=start_date&facets=resource_training_page:BioImage%20Archive"
      })
    }
  },

  adapter
});