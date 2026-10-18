// Diagnostic-only loader: actual repository source, without Next's bundler marker.
// This does not replace authentication, transaction checks or database queries.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export function createSourceLoader(root) {
  const modules = new Map()
  const require = createRequire(path.join(root, 'package.json'))
  async function actualSource(file) {
    const absolute = path.resolve(root, file)
    if (modules.has(absolute)) return modules.get(absolute)
    let code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    code = code.replace(/^import ['"]server-only['"];?\s*$/gm, '')
    // Literal lazy imports also need absolute URLs when loaded from a data URL.
    const specifiers = [...code.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1])
    for (const name of new Set(specifiers)) {
      if (name.startsWith('node:')) continue
      const dependency = name.startsWith('.')
        ? await actualSource(path.resolve(path.dirname(absolute), name + '.ts'))
        : name.startsWith('@/') ? await actualSource(path.resolve(root, name.slice(2) + '.ts'))
          : pathToFileURL(require.resolve(name)).href
      code = code.replaceAll(`'${name}'`, JSON.stringify(dependency)).replaceAll(`"${name}"`, JSON.stringify(dependency))
    }
    const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
    modules.set(absolute, url)
    return url
  }
  return actualSource
}
