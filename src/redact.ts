/** PII / secret redaction: known patterns + Shannon-entropy fallback. */
// [label, regex, keepPrefix]  keepPrefix=true keeps capture group 1
const RULES: [string, RegExp, boolean][] = [
  ["PRIVATE_KEY", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, false],
  ["AWS_KEY", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, false],
  ["GITHUB_TOKEN", /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, false],
  ["ANTHROPIC_KEY", /\bsk-ant-[A-Za-z0-9_-]{20,}/g, false],
  ["API_KEY", /\bsk-[A-Za-z0-9_-]{20,}/g, false],
  ["SLACK_TOKEN", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, false],
  ["GOOGLE_KEY", /\bAIza[0-9A-Za-z_-]{35}\b/g, false],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, false],
  ["URL_PASSWORD", /([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(?=@)/gi, true],
  ["SECRET_ASSIGN", /(\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey)\s*[:=]\s*)(?:"[^"]+"|'[^']+'|[^\s"',;]{4,})/gi, true],
  ["EMAIL", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, false],
];

const entropy = (s: string) => {
  const f = new Map<string, number>();
  for (const ch of s) f.set(ch, (f.get(ch) ?? 0) + 1);
  return -[...f.values()].reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0);
};

const luhn = (d: string) => {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i]; if (alt && (n *= 2) > 9) n -= 9;
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};

export function redact(input: string): { text: string; findings: string[] } {
  let text = input;
  const findings: string[] = [];
  for (const [label, re, keep] of RULES)
    text = text.replace(re, (...m) => { findings.push(label); return (keep ? m[1] : "") + `[REDACTED:${label}]`; });
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const d = m.replace(/\D/g, "");
    if (d.length >= 13 && luhn(d)) { findings.push("CREDIT_CARD"); return "[REDACTED:CREDIT_CARD]"; }
    return m;
  });
  text = text.replace(/[A-Za-z0-9_+=-]{24,}/g, (m) => {
    if (/[A-Za-z]/.test(m) && /\d/.test(m) && entropy(m) > 4.0) { findings.push("HIGH_ENTROPY"); return "[REDACTED:HIGH_ENTROPY]"; }
    return m;
  });
  return { text, findings };
}
