import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: {
    tailwindcss: {
      // Percorso esplicito al config, funziona qualunque sia la CWD
      config: resolve(__dirname, './tailwind.config.ts'),
    },
    autoprefixer: {},
  },
}
