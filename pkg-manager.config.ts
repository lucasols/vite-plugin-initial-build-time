import { defineConfig } from '@ls-stack/pkg-manager'

export default defineConfig({
  requireMajorConfirmation: true,
  prePublish: [
    { command: 'pnpm lint', label: 'Linting' },
    { command: 'pnpm test', label: 'Testing' },
    { command: 'pnpm build', label: 'Building' },
  ],
})
