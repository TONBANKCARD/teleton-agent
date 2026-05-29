# SEO assets

Search-engine discoverability baseline for Teleton Agent, delivered for
[issue #487](https://github.com/xlabtg/teleton-agent/issues/487).

| File | Purpose |
| ---- | ------- |
| [`sitemap.xml`](./sitemap.xml) | XML sitemap for the public website, docs, GitHub project, and the TON/crypto ecosystem the agent integrates with (TON, STON.fi, DeDust, TON DNS, NFT marketplaces). |
| [`robots.txt`](./robots.txt) | Crawl policy — allow public surfaces, disallow the private operator console, declare the sitemap. |

## Canonical host

All URLs assume the canonical public host **`https://teletonagent.dev`**. If the
host changes, update it in `sitemap.xml`, `robots.txt`, and the meta tags in
[`web/index.html`](../web/index.html).

## Deployment

These files describe the **public** site, which is hosted separately from this
repository. To deploy:

1. Copy `sitemap.xml` and `robots.txt` to the web root of the public host so
   they resolve at:
   - `https://teletonagent.dev/sitemap.xml`
   - `https://teletonagent.dev/robots.txt`
2. Submit the sitemap in [Google Search Console](https://search.google.com/search-console)
   and [Bing Webmaster Tools](https://www.bing.com/webmasters).
3. Verify with `curl -s https://teletonagent.dev/robots.txt`.

## What is intentionally NOT indexed

The Teleton Agent **operator WebUI** is a private, authenticated console. It is
served from this repository's [`web/`](../web/) app and:

- carries `<meta name="robots" content="noindex, nofollow">` in
  [`web/index.html`](../web/index.html), and
- has its `/api/`, `/setup`, and `/login` paths disallowed in `robots.txt`.

Indexing a private control plane would be a security and quality regression, so
SEO here means: **make the public site and docs discoverable, keep the private
console out of the index.**

## Maintenance

- Regenerate `sitemap.xml` whenever public website or documentation routes
  change, and bump the `<lastmod>` dates.
- Keep the TON/crypto ecosystem links current with the integrations advertised
  in the [README](../README.md).
- Consider automating sitemap generation in the public site's build pipeline
  (tracked as part of the SEO readiness issue).
