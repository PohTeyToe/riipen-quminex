// Outbound links in one place.
// The code link shows only once the repo is public: set VITE_REPO_URL at build time (in Vercel, an
// environment variable) after pushing. Until then the site doesn't link to it.
export const LINKS = {
  repo: (import.meta.env.VITE_REPO_URL as string | undefined) || null,
  github: 'https://github.com/PohTeyToe',
  linkedin: 'https://www.linkedin.com/in/abdallah-safi',
}
