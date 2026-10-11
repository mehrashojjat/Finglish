# Search and AI discoverability

How the website is set up so people — and AI assistants — can find it, in Persian first and in English.

## What comparable tools do (surveyed 2026-10-11)

| tool | what its page carries |
|---|---|
| Google Input Tools (try page) | a plain title («ابزار ورودی Google را به صورت آنلاین امتحان کنید»), a slogan as description, a `canonical` per language path, `itemtype=Product`. It leans on the brand; there is almost no SEO text. |
| Lexilogos Persian keyboard | keyword title («Persian Keyboard Online (Farsi)»), a one-line description, `hreflang` to its other language, an Open Graph image, and **`WebApplication` JSON-LD** (`applicationCategory`, `operatingSystem`, `inLanguage`). |
| Yamli (Arabic) | title + description + a long `keywords` meta list; the message is "type it the way you say it". |
| Persian WordPress sites (Rank Math) | `canonical`, `og:*`, `twitter:*`, `robots` with `max-snippet:-1, max-image-preview:large`, JSON-LD `@graph`. |

What people in Persian actually call it: **فینگلیش، پینگلیش، پنگلیش** (Finglish / Pinglish / Penglish — Abadis defines the word), «تایپ فارسی با حروف انگلیسی (لاتین)», «تبدیل فینگلیش به فارسی», «مبدل فینگلیش», «تایپ فارسی آنلاین». In English: *Finglish to Persian*, *Pinglish converter*, *type Persian with English letters*, *Persian transliteration keyboard*. Few pages rank for these as a **working** tool (most results are blog posts or a Telegram bot), so the page is first of all the tool itself, with the explanation below it.

## What is in place

* **Two pages, one tool.** `/` is Persian (`lang="fa" dir="rtl"`, the default), `/en/` is English; each has its own title, description, one H1, headings, text, FAQ and examples, and they link to each other (a visible language switch, plus `hreflang` once the address is known).
* **Content that answers the questions people (and assistants) ask:** a definition, a three-step "how it works", a table of examples that a test checks against the engine, eleven FAQ entries (the same ones in Persian and English; a test keeps the two lists the same length), About and data credits.
* **Head:** title and description (length-checked), `robots` with `max-snippet:-1, max-image-preview:large`, Open Graph and Twitter card tags, icons (`favicon.ico`, SVG, `apple-touch-icon.png`), `theme-color`.
* **Structured data (JSON-LD):** `WebApplication` (free, `UtilitiesApplication`, features, licence, author) and `FAQPage` on both pages; `WebSite` + `WebPage` once the address is known. The FAQ markup is generated from the visible FAQ, so they cannot differ.
* **Speed:** scripts are `defer`red, so the text paints before the 11 MB of word lists arrive; the logo has fixed dimensions; fonts use `font-display: swap`.
* **For crawlers:** `robots.txt` (everyone allowed, with the AI crawlers and assistants named explicitly: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot…), `sitemap.xml`, `404.html` (`noindex`).
* **For AI assistants:** `llms.txt` — a plain-text briefing (what it is, key facts, pages, the FAQ, the licence) in the llmstxt.org format; clear, quotable statements in the page text; semantic HTML (`main`, `nav`, `footer`, one `h1`, `alt` texts, `<noscript>` text).

## Things that need the site's address — `npm run seo`

`canonical`, `hreflang`, `og:url`, `og:image`, the URLs inside the structured data, `sitemap.xml`, the `Sitemap:` line, the links in `llms.txt` and the `<base>` of `404.html` all need an absolute address, which exists only once the site is published. Nothing is invented before that: without an address those parts are simply absent (and `npm test` checks that they are all present or all absent).

```bash
npm run seo -- https://your-site.example/      # writes them all and remembers the address as "homepage" in package.json
npm run seo                                    # rewrites them (e.g. to refresh the dates)
```

## After publishing

1. `npm run seo -- <the address>`, commit, publish. (Done for **https://finglish.mehrashojjat.com/**; run it again only if the address changes.)
2. Add the site to **Google Search Console** and **Bing Webmaster Tools**, and submit `sitemap.xml` (Bing can also pass it on to other engines through IndexNow). Check both pages with Google's *Rich Results Test* and the URL Inspection tool.
3. On GitHub: set the repository's *About* description, website and topics (`persian`, `farsi`, `finglish`, `pinglish`, `transliteration`, `input-method`, `keyboard`, `macos`) — repository pages are also what assistants cite.
4. Links help more than markup: a short post where Persian typists gather (Virgool, Telegram channels, Reddit r/farsi) pointing at the tool.

## Honest limits

* **FAQ rich results** are shown by Google only for a small set of authoritative sites; the FAQ is there for readers and for assistants, not as a promise of a rich result.
* The `WebApplication` rich result needs a rating or review; there are none, and none are invented, so Google will understand the page better but will not show stars.
* `llms.txt` is a community proposal; no search engine has said it ranks anything because of it. It costs nothing and gives assistants a clean summary.
* `robots.txt` is a request, not access control; it states that crawling is welcome.
* The `keywords` meta tag is left out on purpose (ignored by Google, and a spam signal for some engines).
* Rankings cannot be promised; new sites take weeks to be indexed.

## Maintaining it

* Edit the **visible** FAQ in `index.html` / `en/index.html`, then `npm run seo` (it rebuilds the FAQ's JSON-LD). `npm test` fails if they differ, if the examples table is not what the engine gives, or if the quoted accuracy no longer matches `docs/RESULTS.md`.
* Logo or tagline changed: `npm run seo:images` redraws `og.png`, `icon-512.png`, `apple-touch-icon.png` and `favicon.ico` (needs Chrome and Pillow).
