import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const repository = new URL('../../', import.meta.url);

test('Knip discovers optional workers, copied metadata fixtures and ESLint configs', async () => {
  const output = new URL('artifacts/knip-integration/', repository);
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(new URL('application-', output).pathname);
  try {
    const original = JSON.parse(await readFile(new URL('configs/quality/knip.json', repository)));
    // Use the repository's actual optional entry/config patterns, with a minimal
    // import graph that exposes omissions as unreachable files/dependencies.
    const config = { project: ['scripts/**/*.mjs', 'configs/**/*.mjs', 'tests/**/*.mjs'], entry: original.entry.filter(entry => entry.includes('scripts/markup/') || entry.includes('tests/metadata/fixtures/')), eslint: original.eslint };
    for (const dir of ['scripts/markup', 'configs/quality', 'tests/metadata/fixtures']) await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'audit:markup': 'node scripts/markup/audit.mjs' }, devDependencies: { eslint: '9.39.5', 'eslint-plugin-astro': '1.3.1' } }));
    await writeFile(path.join(root, 'knip.json'), JSON.stringify(config));
    await writeFile(path.join(root, 'scripts/markup/audit.mjs'), "import { spawn } from 'node:child_process'; spawn(process.execPath, [new URL('./worker.mjs', import.meta.url).pathname]);\n");
    await writeFile(path.join(root, 'scripts/markup/worker.mjs'), "import './worker-helper.mjs';\n");
    await writeFile(path.join(root, 'scripts/markup/worker-helper.mjs'), 'console.log("worker dependency");\n');
    await writeFile(path.join(root, 'configs/quality/eslint.markup.config.mjs'), "import astro from 'eslint-plugin-astro'; export default [...astro.configs['flat/base']];\n");
    await writeFile(path.join(root, 'tests/metadata/fixtures/dataset-metadata.mjs'), "import './record-helper.mjs';\n");
    await writeFile(path.join(root, 'tests/metadata/fixtures/record-helper.mjs'), 'console.log("compiled fixture dependency");\n');
    const packageFile = require.resolve('knip/package.json');
    const info = JSON.parse(await readFile(packageFile));
    const cli = path.join(path.dirname(packageFile), info.bin.knip);
    const result = await promisify(execFile)(process.execPath, [cli, '--config', 'knip.json', '--reporter', 'json'], { cwd: root, timeout: 30000 }).catch(error => {
      if (error.code !== 1) throw error;
      return error;
    });
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.files, [], result.stdout);
    assert(!report.issues?.some(issue => [...(issue.dependencies ?? []), ...(issue.devDependencies ?? [])].some(item => item.name === 'eslint-plugin-astro')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
