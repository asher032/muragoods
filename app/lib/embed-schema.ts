// ── Discord embed schema ────────────────────────────────────────────────
//
// Discord rejects an over-long embed with a 400 whose body names the offending
// field — after the operator has typed it, chosen a channel and pressed Send.
// Worse, the dashboard used to `.slice()` the values down to the limit silently:
// the message was posted, the UI said "sent", and the tail of the operator's
// paragraph was gone.
//
// So the limits live here, once, and are applied in three places with the SAME
// rules: as you type (inline), before saving a draft, and again in the send
// route — because the route is the untrusted boundary and a forged POST must
// not be able to hand Discord an invalid embed.
//
// Every failure names the field, the limit and what was supplied.

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields: DiscordEmbedField[];
}

/** Discord's documented per-field limits (api docs: "Embed Limits"). */
export const EMBED_LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELDS: 25,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER_TEXT: 2048,
  AUTHOR_NAME: 256,
  /** title + description + all field names and values + footer + author. */
  TOTAL: 6000,
  URL: 2048,
  /** Embeds per message. */
  PER_MESSAGE: 10,
  CONTENT: 2000,
} as const;

export const EMBED_ERROR_CODES = {
  REQUIRED: 'REQUIRED',
  TOO_LONG: 'TOO_LONG',
  TOO_MANY_FIELDS: 'TOO_MANY_FIELDS',
  TOTAL_TOO_LONG: 'TOTAL_TOO_LONG',
  INVALID_URL: 'INVALID_URL',
  INVALID_COLOR: 'INVALID_COLOR',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  EMPTY_EMBED: 'EMPTY_EMBED',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

export type EmbedErrorCode = (typeof EMBED_ERROR_CODES)[keyof typeof EMBED_ERROR_CODES];

export interface EmbedFieldError {
  /** Dotted path into the embed, e.g. `fields.2.name`. */
  field: string;
  label: string;
  code: EmbedErrorCode;
  message: string;
  limit?: number;
  current?: number;
}

export const EMBED_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  url: 'Title URL',
  color: 'Color',
  timestamp: 'Timestamp',
  'footer.text': 'Footer text',
  'footer.icon_url': 'Footer icon URL',
  'author.name': 'Author name',
  'author.url': 'Author URL',
  'author.icon_url': 'Author icon URL',
  'image.url': 'Image URL',
  'thumbnail.url': 'Thumbnail URL',
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The characters Discord counts against the 6000 limit. */
export function embedTotalChars(embed: DiscordEmbed): number {
  let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
  total += embed.footer?.text.length ?? 0;
  total += embed.author?.name.length ?? 0;
  for (const f of embed.fields) total += f.name.length + f.value.length;
  return total;
}

/** Discord rejects an embed that carries no content at all. */
export function isEmptyEmbed(embed: DiscordEmbed): boolean {
  return !embed.title && !embed.description && !embed.author?.name && embed.fields.length === 0;
}

export const EMPTY_EMBED: DiscordEmbed = { fields: [], color: 0 };

/**
 * Validate one embed. Returns every problem at once, never a truncated embed —
 * silently shortening the operator's text is the bug this replaces.
 */
export function validateEmbed(
  input: unknown,
  opts: { label?: string } = {},
): { ok: true; embed: DiscordEmbed } | { ok: false; errors: EmbedFieldError[] } {
  const prefix = opts.label ? `${opts.label}: ` : '';
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{
        field: 'embed', label: prefix ? prefix.trim() : 'Embed',
        code: EMBED_ERROR_CODES.INVALID_INPUT, message: 'An embed object is required.',
      }],
    };
  }
  const raw = input as Record<string, unknown>;
  const errors: EmbedFieldError[] = [];

  // Every label carries the embed it belongs to, so a multi-embed message says
  // WHICH embed failed — "Title is too long" is ambiguous across ten of them.
  const label = (key: string) => `${prefix}${EMBED_FIELD_LABELS[key] ?? key}`;

  const tooLong = (key: string, value: string, limit: number) => {
    if (value.length > limit) {
      errors.push({
        field: key, label: label(key), code: EMBED_ERROR_CODES.TOO_LONG,
        message: `${EMBED_FIELD_LABELS[key] ?? key} is ${value.length} characters — the limit is ${limit}.`,
        limit, current: value.length,
      });
    }
  };

  const title = text(raw.title);
  tooLong('title', title, EMBED_LIMITS.TITLE);
  const description = text(raw.description);
  tooLong('description', description, EMBED_LIMITS.DESCRIPTION);

  const url = text(raw.url);
  if (url) {
    if (!isHttpUrl(url)) {
      errors.push({
        field: 'url', label: label('url'), code: EMBED_ERROR_CODES.INVALID_URL,
        message: 'Title URL must start with http:// or https://.',
      });
    } else {
      tooLong('url', url, EMBED_LIMITS.URL);
    }
  }

  // ── Color ──
  let color = 0;
  if (raw.color !== undefined && raw.color !== null && raw.color !== '') {
    const parsed = typeof raw.color === 'number' ? raw.color : Number(String(raw.color).replace(/^#/, '0x'));
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffff) {
      errors.push({
        field: 'color', label: label('color'), code: EMBED_ERROR_CODES.INVALID_COLOR,
        message: 'Color must be a hex value between #000000 and #FFFFFF.',
      });
    } else {
      color = parsed;
    }
  }

  // ── Timestamp ──
  let timestamp: string | undefined;
  const rawTimestamp = text(raw.timestamp);
  if (rawTimestamp) {
    const parsed = new Date(rawTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      errors.push({
        field: 'timestamp', label: label('timestamp'), code: EMBED_ERROR_CODES.INVALID_TIMESTAMP,
        message: 'Timestamp must be a valid date.',
      });
    } else {
      timestamp = parsed.toISOString();
    }
  }

  // ── Footer / author ──
  const footerRaw = (raw.footer && typeof raw.footer === 'object' ? raw.footer : {}) as Record<string, unknown>;
  const footerText = text(footerRaw.text);
  tooLong('footer.text', footerText, EMBED_LIMITS.FOOTER_TEXT);
  const footerIcon = text(footerRaw.icon_url);
  if (footerIcon && !isHttpUrl(footerIcon)) {
    errors.push({
      field: 'footer.icon_url', label: label('footer.icon_url'),
      code: EMBED_ERROR_CODES.INVALID_URL,
      message: 'Footer icon URL must start with http:// or https://.',
    });
  }

  const authorRaw = (raw.author && typeof raw.author === 'object' ? raw.author : {}) as Record<string, unknown>;
  const authorName = text(authorRaw.name);
  tooLong('author.name', authorName, EMBED_LIMITS.AUTHOR_NAME);
  const authorUrl = text(authorRaw.url);
  if (authorUrl && !isHttpUrl(authorUrl)) {
    errors.push({
      field: 'author.url', label: label('author.url'), code: EMBED_ERROR_CODES.INVALID_URL,
      message: 'Author URL must start with http:// or https://.',
    });
  }
  const authorIcon = text(authorRaw.icon_url);
  if (authorIcon && !isHttpUrl(authorIcon)) {
    errors.push({
      field: 'author.icon_url', label: label('author.icon_url'),
      code: EMBED_ERROR_CODES.INVALID_URL,
      message: 'Author icon URL must start with http:// or https://.',
    });
  }

  // ── Images ──
  for (const key of ['image', 'thumbnail'] as const) {
    const block = (raw[key] && typeof raw[key] === 'object' ? raw[key] : {}) as Record<string, unknown>;
    const imageUrl = text(block.url);
    if (!imageUrl) continue;
    if (!isHttpUrl(imageUrl)) {
      errors.push({
        field: `${key}.url`, label: label(`${key}.url`), code: EMBED_ERROR_CODES.INVALID_URL,
        message: `${EMBED_FIELD_LABELS[`${key}.url`]} must start with http:// or https://.`,
      });
      continue;
    }
    tooLong(`${key}.url`, imageUrl, EMBED_LIMITS.URL);
  }

  // ── Fields ──
  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
  const fields: DiscordEmbedField[] = [];
  if (rawFields.length > EMBED_LIMITS.FIELDS) {
    errors.push({
      field: 'fields', label: `${prefix}Fields`, code: EMBED_ERROR_CODES.TOO_MANY_FIELDS,
      message: `${rawFields.length} fields — a Discord embed allows at most ${EMBED_LIMITS.FIELDS}.`,
      limit: EMBED_LIMITS.FIELDS, current: rawFields.length,
    });
  }
  rawFields.forEach((entry, index) => {
    const f = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const name = text(f.name);
    const value = String(f.value ?? '').trim();
    // A row that is entirely blank is a half-filled form line, not a field to
    // send; Discord would reject an embed containing it.
    if (!name && !value) return;
    if (!name) {
      errors.push({
        field: `fields.${index}.name`, label: `${prefix}Field ${index + 1} name`,
        code: EMBED_ERROR_CODES.REQUIRED, message: `Field ${index + 1} needs a name.`,
      });
    } else if (name.length > EMBED_LIMITS.FIELD_NAME) {
      errors.push({
        field: `fields.${index}.name`, label: `${prefix}Field ${index + 1} name`,
        code: EMBED_ERROR_CODES.TOO_LONG,
        message: `Field ${index + 1} name is ${name.length} characters — the limit is ${EMBED_LIMITS.FIELD_NAME}.`,
        limit: EMBED_LIMITS.FIELD_NAME, current: name.length,
      });
    }
    if (!value) {
      errors.push({
        field: `fields.${index}.value`, label: `${prefix}Field ${index + 1} value`,
        code: EMBED_ERROR_CODES.REQUIRED, message: `Field ${index + 1} needs a value.`,
      });
    } else if (value.length > EMBED_LIMITS.FIELD_VALUE) {
      errors.push({
        field: `fields.${index}.value`, label: `${prefix}Field ${index + 1} value`,
        code: EMBED_ERROR_CODES.TOO_LONG,
        message: `Field ${index + 1} value is ${value.length} characters — the limit is ${EMBED_LIMITS.FIELD_VALUE}.`,
        limit: EMBED_LIMITS.FIELD_VALUE, current: value.length,
      });
    }
    fields.push({ name, value, inline: Boolean(f.inline) });
  });

  const embed: DiscordEmbed = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    color,
    ...(timestamp ? { timestamp } : {}),
    ...(footerText || footerIcon
      ? { footer: { text: footerText, ...(footerIcon ? { icon_url: footerIcon } : {}) } }
      : {}),
    ...(authorName
      ? {
        author: {
          name: authorName,
          ...(authorUrl ? { url: authorUrl } : {}),
          ...(authorIcon ? { icon_url: authorIcon } : {}),
        },
      }
      : {}),
    ...(text((raw.image as Record<string, unknown>)?.url)
      ? { image: { url: text((raw.image as Record<string, unknown>).url) } } : {}),
    ...(text((raw.thumbnail as Record<string, unknown>)?.url)
      ? { thumbnail: { url: text((raw.thumbnail as Record<string, unknown>).url) } } : {}),
    fields,
  };

  if (isEmptyEmbed(embed)) {
    errors.push({
      field: 'embed', label: prefix ? prefix.trim() : 'Embed', code: EMBED_ERROR_CODES.EMPTY_EMBED,
      message: 'An embed needs a title, a description, an author or at least one field.',
    });
  }

  const total = embedTotalChars(embed);
  if (total > EMBED_LIMITS.TOTAL) {
    errors.push({
      field: 'total', label: `${prefix}Embed size`, code: EMBED_ERROR_CODES.TOTAL_TOO_LONG,
      message: `The embed's text totals ${total} characters — Discord's limit across all parts is ${EMBED_LIMITS.TOTAL}.`,
      limit: EMBED_LIMITS.TOTAL, current: total,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, embed };
}

/** Validate up to `EMBED_LIMITS.PER_MESSAGE` embeds for one message. */
export function validateEmbeds(
  input: unknown,
): { ok: true; embeds: DiscordEmbed[] } | { ok: false; errors: EmbedFieldError[] } {
  const list = Array.isArray(input) ? input : [];
  if (list.length > EMBED_LIMITS.PER_MESSAGE) {
    return {
      ok: false,
      errors: [{
        field: 'embeds', label: 'Embeds', code: EMBED_ERROR_CODES.TOO_MANY_FIELDS,
        message: `${list.length} embeds — a message carries at most ${EMBED_LIMITS.PER_MESSAGE}.`,
        limit: EMBED_LIMITS.PER_MESSAGE, current: list.length,
      }],
    };
  }
  const embeds: DiscordEmbed[] = [];
  const errors: EmbedFieldError[] = [];
  list.forEach((entry, index) => {
    const result = validateEmbed(entry, { label: `Embed ${index + 1}` });
    if (result.ok) embeds.push(result.embed);
    else errors.push(...result.errors);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, embeds };
}
