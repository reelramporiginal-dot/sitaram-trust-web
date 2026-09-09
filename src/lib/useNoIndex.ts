import { useEffect } from 'react'

/**
 * Adds <meta name="robots" content="noindex, nofollow"> while a page is
 * mounted, and removes it again on unmount. Use this on any route that
 * should never appear in Google/Bing search results (admin panels,
 * login screens, thank-you pages, etc.) — keeping it out of the sitemap
 * is not enough on its own, since a page can still get crawled and
 * indexed if it's linked to from anywhere.
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const previousTitle = document.title
    return () => {
      document.head.removeChild(meta)
      document.title = previousTitle
    }
  }, [])
}

