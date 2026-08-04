import { describe, expect, it } from 'vitest';
import { scanForPii } from '../../src/composer/pii-guard';

const kinds = (text: string) => scanForPii(text).findings.map((f) => f.kind);

describe('structured identifiers block', () => {
  const cases: [string, string, string][] = [
    ['email', 'contact j.smith@example.com for detail', 'email'],
    ['phone', 'reached on 555-123-4567 afterwards', 'phone'],
    ['ssn', 'reference 123-45-6789 on file', 'ssn'],
    ['badge number', 'badge 448192 was scanned', 'labelled_id'],
    ['SSO', 'SSO 8837261 recorded the case', 'labelled_id'],
    ['employee id', 'employee id 55123 attended', 'labelled_id'],
    ['date of birth', 'DOB 04/11/1985 on the record', 'dob'],
    ['bare date', 'the record shows 04/11/1985', 'bare_dob'],
    ['honorific', 'seen by Dr. Reynolds at the clinic', 'honorific'],
  ];

  for (const [label, text, expectedKind] of cases) {
    it(`blocks on ${label}`, () => {
      const report = scanForPii(text);
      expect(report.hasBlocking, `no blocking finding in: ${text}`).toBe(true);
      expect(kinds(text)).toContain(expectedKind);
    });
  }
});

describe('probable names advise rather than block', () => {
  it('flags a common given name mid sentence', () => {
    const report = scanForPii('the load was steadied by Michael at the far end');
    expect(report.hasBlocking).toBe(false);
    expect(kinds('the load was steadied by Michael at the far end')).toContain('probable_name');
  });

  it('flags a name it does not recognize when it appears as a capitalized pair', () => {
    // "Alan" is not in the name lexicon, so this is caught by the weaker signal:
    // two capitalized words in a row mid-sentence.
    expect(kinds('reported to Alan Whitfield at the end of shift')).toContain('capitalized_pair');
  });

  it('does not flag equipment, sites and standards from the allowlist', () => {
    const text =
      'The Maintenance team isolated Conveyor CV-04 in Building North per the OSHA and ANSI requirements on Monday';
    const report = scanForPii(text);
    expect(report.findings.filter((f) => f.kind !== 'pronoun')).toEqual([]);
  });

  it('does not flag an ordinary capitalized sentence opening', () => {
    const report = scanForPii('Approximately 40 pounds. Roughly 6 feet from the rack.');
    expect(report.findings).toEqual([]);
  });
});

describe('residual pronouns advise', () => {
  it('catches a gendered pronoun reintroduced by hand editing', () => {
    expect(kinds('he reached into the guard opening')).toContain('pronoun');
    expect(kinds('the guard caught her hand')).toContain('pronoun');
  });

  it('does not flag collective pronouns', () => {
    expect(kinds('we stopped the line immediately')).not.toContain('pronoun');
  });
});

describe('guard behaviour', () => {
  it('never mutates the text it scans', () => {
    const text = 'badge 448192 and Michael were involved';
    const before = text;
    scanForPii(text);
    expect(text).toBe(before);
  });

  it('reports an offset for every finding so the UI can point at it', () => {
    const text = 'reported by Michael on badge 448192';
    for (const finding of scanForPii(text).findings) {
      expect(finding.index).toBeGreaterThanOrEqual(0);
      expect(text.slice(finding.index).startsWith(finding.match)).toBe(true);
    }
  });

  it('handles empty and adversarial input without throwing', () => {
    for (const input of ['', '   ', '@@@@', '🙂', 'a'.repeat(20_000)]) {
      expect(() => scanForPii(input)).not.toThrow();
    }
  });
});
