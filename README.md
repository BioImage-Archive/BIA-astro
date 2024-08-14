# BIA Astro prototype implementation

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Run linkchecker locally

Please note that some links / images that would work on your local version, won't work when deployed. For instance, relative links (e.g. '../contact-us') will work on the local dev website, pass linkchecker run locally, but will not work once deployed (astro links should be relative to the root of the website, ingnoring base settings: https://docs.astro.build/en/basics/astro-pages/#link-between-pages)

* install linkchecker: https://linkchecker.github.io/linkchecker/install.html
* start local dev server: ```npm run dev```
* run ```linkchecker http://localhost:4321/bioimage-archive/ -o failures --no-warnings --ignore-url '.*\/vis\/?.*' --ignore-url '.*\/dataset\/?.*' --ignore-url '.*\/sodataset\/?.*' --ignore-url '.*\/aidataset\/?.*'``` *

\* Note that on mac you may have to modify permissions of the /Users/$USER/.config/linkchecker to get this command to work.
