import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

for (const directory of ['release', 'dist', 'dist-electron']) {
  rmSync(resolve(process.cwd(), directory), { recursive: true, force: true })
}
