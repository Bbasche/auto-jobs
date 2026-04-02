import { average, clampNumber } from './helpers.js';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'into',
  'what',
  'when',
  'will',
  'have',
  'they',
  'their',
  'them',
  'than',
  'then',
  'just',
  'http',
  'https',
  'www',
]);

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function collectMatches(html, regex, mapper = (match) => match[1]) {
  return [...html.matchAll(regex)].map(mapper).filter(Boolean);
}

function getAttribute(fragment, attribute) {
  const match = fragment.match(new RegExp(`${attribute}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match?.[2]?.trim() || '';
}

function extractTitle(html) {
  return collectMatches(html, /<title[^>]*>([\s\S]*?)<\/title>/i, (match) => stripHtml(match[1]))[0] || '';
}

function extractMetaDescription(html) {
  return (
    collectMatches(
      html,
      /<meta[^>]+name=(['"])description\1[^>]+content=(['"])([\s\S]*?)\2[^>]*>/i,
      (match) => decodeEntities(match[3].trim()),
    )[0] || ''
  );
}

function extractHeadings(html) {
  return collectMatches(html, /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match) => stripHtml(match[2]));
}

function extractButtons(html) {
  const buttonTags = collectMatches(html, /<button\b[^>]*>([\s\S]*?)<\/button>/gi, (match) => stripHtml(match[1]));
  const inputButtons = collectMatches(html, /<input\b[^>]*type=(['"])(submit|button)\1[^>]*>/gi, (match) =>
    getAttribute(match[0], 'value') || match[2],
  );

  return [...buttonTags, ...inputButtons].filter(Boolean);
}

function extractLinks(html, baseUrl) {
  return collectMatches(html, /<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi, (match) => {
    const href = match[3].trim();
    const text = stripHtml(match[5]);

    try {
      const url = new URL(href, baseUrl);
      return {
        href: url.toString(),
        text,
      };
    } catch {
      return null;
    }
  });
}

function extractImageStats(html) {
  const images = [...html.matchAll(/<img\b([^>]*?)>/gi)];
  const withAlt = images.filter((match) => Boolean(getAttribute(match[1], 'alt'))).length;

  return {
    count: images.length,
    withAlt,
  };
}

function tokenize(text) {
  return [...new Set(stripHtml(text).toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter(
    (token) => !STOP_WORDS.has(token),
  );
}

function normalizeInternalLinks(links, baseUrl) {
  const origin = new URL(baseUrl).origin;

  return [...new Map(
    links
      .filter((link) => {
        if (!link?.href) {
          return false;
        }

        try {
          const url = new URL(link.href);
          return url.origin === origin && !url.hash && !url.href.startsWith('mailto:');
        } catch {
          return false;
        }
      })
      .map((link) => [link.href, link]),
  ).values()];
}

export async function inspectPage(url, { timeoutMs = 10000 } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'auto-jobs/0.1.0 (+https://local.auto-jobs)',
      },
    });
    const html = await response.text();
    const loadMs = Date.now() - startedAt;
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const headings = extractHeadings(html);
    const buttons = extractButtons(html);
    const links = extractLinks(html, url);
    const internalLinks = normalizeInternalLinks(links, url);
    const text = stripHtml(html);
    const imageStats = extractImageStats(html);

    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      html,
      text,
      title,
      description,
      headings,
      buttons,
      links,
      internalLinks,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      hasNav: /<nav\b/i.test(html),
      hasMain: /<main\b/i.test(html),
      hasFooter: /<footer\b/i.test(html),
      hasForm: /<form\b/i.test(html),
      hasLang: /<html\b[^>]*lang=/i.test(html),
      labelCount: [...html.matchAll(/<label\b/gi)].length,
      inputCount: [...html.matchAll(/<input\b|<textarea\b|<select\b/gi)].length,
      imageCount: imageStats.count,
      imagesWithAlt: imageStats.withAlt,
      loadMs,
      tokens: tokenize([title, description, headings.join(' '), buttons.join(' '), text].join(' ')),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function prioritizeLinks(links, keywords, limit) {
  const keywordSet = new Set(keywords);

  return links
    .map((link) => {
      const haystack = `${link.text} ${link.href}`.toLowerCase();
      const score = [...keywordSet].reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);

      return {
        link,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.link);
}

export async function inspectScenarioSurface({ baseUrl, entryPath = '/', keywords = [], maxPages = 3 }) {
  const entryUrl = new URL(entryPath || '/', baseUrl).toString();
  const pages = [];
  const visited = new Set();
  const queue = [entryUrl];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();

    if (!url || visited.has(url)) {
      continue;
    }

    visited.add(url);

    try {
      const page = await inspectPage(url);
      pages.push(page);

      const prioritized = prioritizeLinks(page.internalLinks, keywords, maxPages * 2);
      prioritized.forEach((link) => {
        if (!visited.has(link.href) && queue.length + pages.length < maxPages * 3) {
          queue.push(link.href);
        }
      });
    } catch (error) {
      pages.push({
        url,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        html: '',
        text: '',
        title: '',
        description: '',
        headings: [],
        buttons: [],
        links: [],
        internalLinks: [],
        wordCount: 0,
        hasNav: false,
        hasMain: false,
        hasFooter: false,
        hasForm: false,
        hasLang: false,
        labelCount: 0,
        inputCount: 0,
        imageCount: 0,
        imagesWithAlt: 0,
        loadMs: timeoutMsFallback(),
        tokens: [],
      });
    }
  }

  const successfulPages = pages.filter((page) => page.ok);

  return {
    baseUrl,
    entryUrl,
    pages,
    summary: {
      crawledPages: pages.length,
      successfulPages: successfulPages.length,
      averageLoadMs: average(successfulPages.map((page) => page.loadMs), 0),
      averageWordCount: average(successfulPages.map((page) => page.wordCount), 0),
      totalButtons: successfulPages.reduce((sum, page) => sum + page.buttons.length, 0),
      totalForms: successfulPages.filter((page) => page.hasForm).length,
      totalInternalLinks: successfulPages.reduce((sum, page) => sum + page.internalLinks.length, 0),
    },
  };
}

function timeoutMsFallback() {
  return clampNumber(12000, 1000, 12000);
}

export function extractKeywords(...inputs) {
  return [...new Set(inputs.flatMap((input) => tokenize(Array.isArray(input) ? input.join(' ') : input)))];
}
