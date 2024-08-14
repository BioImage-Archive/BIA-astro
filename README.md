# BIA Astro prototype implementation

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run local`           | Equivalent to build && preview                   |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

Note that:
`npm run dev` will update as you change things but may give a false impression of the final result, whereas running `npm run build` and then `npm run preview` will recreate what netlify runs, and will provide an accurate display of the website.


## Run linkchecker locally

Prerequisites
* install linkchecker: https://linkchecker.github.io/linkchecker/install.html

To test:
* build and preview locally: `npm run local`
* run: `linkchecker http://localhost:4321/bioimage-archive/ -o failures --no-warnings --ignore-url '.*\/vis\/?.*' --ignore-url '.*\/dataset\/?.*' --ignore-url '.*\/sodataset\/?.*' --ignore-url '.*\/aidataset\/?.*'` *

\* Note that on mac you may have to modify permissions of the /Users/$USER/.config/linkchecker to get this command to work.

You can also run this on the files genated by the build by runnign `npm run build` and then `linkchecker dist/bioimage-archive/ ...`