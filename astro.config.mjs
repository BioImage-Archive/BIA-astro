import { defineConfig } from 'astro/config';
import mdx from "@astrojs/mdx";
import yaml from '@rollup/plugin-yaml';

//import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  //output: 'hybrid',
  //integrations: [mdx(), preact()]
  integrations: [mdx()],
  vite: {
    plugins: [yaml()]
  },
  base: "/bioimage-archive"
});
