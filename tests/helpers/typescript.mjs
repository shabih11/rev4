import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Shared loader for pure library tests. Browser tests use Vite's real module graph.
const modules = new Map();
export function moduleUrl(name) {
  const file = new URL(`../../src/lib/${name}`, import.meta.url);
  if (!file.pathname.endsWith('.ts') && !file.pathname.endsWith('.mjs')) file.pathname += '.ts';
  if (!existsSync(file)) throw new Error(`Test module not found: ${name}`);
  if (modules.has(file.href)) return modules.get(file.href);
  const source = readFileSync(file, 'utf8');
  let code = file.pathname.endsWith('.ts') ? ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText : source;
  code = code.replace(/from\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => {
    const dependency = specifier.startsWith('.')
      ? moduleUrl(fileURLToPath(new URL(specifier, file)).slice(fileURLToPath(new URL('../../src/lib/', import.meta.url)).length))
      : import.meta.resolve(specifier);
    return `from ${quote}${dependency}${quote}`;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(file.href, url);
  return url;
}
