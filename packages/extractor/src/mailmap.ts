export interface MailmapEntry {
  properName?: string;
  properEmail?: string;
  commitName?: string;
  commitEmail: string;
}

export interface MailmapTable {
  byEmailAndName: Map<string, MailmapEntry>;
  byEmail: Map<string, MailmapEntry>;
}

const ANGLE_EMAIL_RE = /<([^>]+)>/g;

/**
 * Parses a Git `.mailmap` file into lookup tables (`FR-7`).
 * Supports all 4 standard gitmailmap formats.
 */
export function parseMailmap(content: string): MailmapTable {
  const byEmailAndName = new Map<string, MailmapEntry>();
  const byEmail = new Map<string, MailmapEntry>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line.length === 0) continue;

    const matches = [...line.matchAll(ANGLE_EMAIL_RE)];
    if (matches.length === 0) continue;

    if (matches.length === 1) {
      const m0 = matches[0]!;
      const email = m0[1]!.trim();
      const properName = line.slice(0, m0.index).trim();
      if (properName.length > 0) {
        byEmail.set(email.toLowerCase(), {
          properName,
          properEmail: email,
          commitEmail: email,
        });
      }
    } else {
      const m0 = matches[0]!;
      const m1 = matches[1]!;
      const properName = line.slice(0, m0.index).trim();
      const properEmail = m0[1]!.trim();
      const commitName = line.slice((m0.index ?? 0) + m0[0].length, m1.index).trim();
      const commitEmail = m1[1]!.trim();

      const entry: MailmapEntry = {
        ...(properName.length > 0 ? { properName } : {}),
        properEmail,
        ...(commitName.length > 0 ? { commitName } : {}),
        commitEmail,
      };

      if (commitName.length > 0) {
        byEmailAndName.set(`${commitEmail.toLowerCase()}\0${commitName.toLowerCase()}`, entry);
      } else {
        byEmail.set(commitEmail.toLowerCase(), entry);
      }
      if (properName.length > 0 && !byEmail.has(properEmail.toLowerCase())) {
        byEmail.set(properEmail.toLowerCase(), {
          properName,
          properEmail,
          commitEmail: properEmail,
        });
      }
    }
  }

  return { byEmailAndName, byEmail };
}

/**
 * Resolves a raw commit author name/email through a parsed `.mailmap` table.
 */
export function resolveAuthorWithMailmap(
  name: string,
  email: string,
  table?: MailmapTable,
): { name: string; email: string } {
  if (!table) return { name, email };
  const emailKey = email.toLowerCase();
  const specific = table.byEmailAndName.get(`${emailKey}\0${name.toLowerCase()}`);
  const entry = specific ?? table.byEmail.get(emailKey);
  if (!entry) return { name, email };
  return {
    name: entry.properName ?? name,
    email: entry.properEmail ?? email,
  };
}
