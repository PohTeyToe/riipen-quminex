// Outbound links in one place. VITE_REPO_URL overrides the code link at build time.
export const LINKS = {
  repo: (import.meta.env.VITE_REPO_URL as string | undefined) || 'https://github.com/PohTeyToe/riipen-quminex',
}
