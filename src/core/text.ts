// Study wording supports **bold** and nothing else. The UI renders runs as
// text nodes, so wording can never inject markup.

export interface Run {
  t: string;
  b?: true;
}

export function parseBold(s: string): Run[] {
  const runs: Run[] = [];
  s.split("**").forEach((t, i) => {
    if (!t) return;
    runs.push(i % 2 ? { t, b: true } : { t });
  });
  return runs;
}

export const plainText = (s: string) => s.split("**").join("");

export const hasMarkup = (s: string) => /<\/?[a-z][^>]*>/i.test(s);
