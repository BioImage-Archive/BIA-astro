## old-website-ai-galleries 
These files are used to generate the pages for the AI Playground in the old website. Follow the steps below to do so (e.g. after updating data for the models)

1. in data/ai-dataset-benchmarking, copy content from model-metadata.json and model-dataset-table.json into their respective *-old-website.json files. Then find & replace 'ai-galleries'  to 'galleries/assets' - this makes sure all the image paths will be correct.
2. run `npm run build` in this astro package to generate the pages under `<astro BIA package>/dist/bioimage-archive/galleries/old-website-ai-galleries/`
Note, for the following setps, its easier to delete the original files first if copy-pasting in vscode
3. copy everything under `<astro BIA package>/public/ai-galleries/` in to `<BIOMAGE-ARCHIVE jeckyl site>/src/galleries/assets/` (keep folder structure)
4. copy everything (except this README.md) under `<astro BIA package>/dist/bioimage-archive/galleries/old-website-ai-galleries/` to `<BIOMAGE-ARCHIVE jeckyl site>/src/galleries/` (keep folder structure)