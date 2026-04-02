export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function slugifyKebab(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleCase(value) {
  return String(value ?? '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

export function parseCommaSeparated(value) {
  if (!value) {
    return [];
  }

  return uniqueStrings(
    String(value)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function chunk(values, size) {
  const output = [];

  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }

  return output;
}

export function createRunId(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hour}${minute}`;
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function renderBullets(values, fallback = 'None') {
  if (!values?.length) {
    return `- ${fallback}`;
  }

  return values.map((value) => `- ${value}`).join('\n');
}

export function renderTable(headers, rows) {
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const headerRow = `| ${headers.join(' | ')} |`;

  if (!rows.length) {
    return `${headerRow}\n${divider}\n| ${headers.map(() => 'n/a').join(' | ')} |`;
  }

  return [headerRow, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

export function interpolateTemplate(template, values) {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function asciiSparkline(values) {
  if (!values.length) {
    return '';
  }

  const palette = '._:=+*#%@';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values
    .map((value) => {
      const normalized = (value - min) / range;
      const index = Math.min(palette.length - 1, Math.round(normalized * (palette.length - 1)));
      return palette[index];
    })
    .join('');
}

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function average(values, fallback = 0) {
  if (!values?.length) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function roundNumber(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
