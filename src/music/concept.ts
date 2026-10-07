/**
 * A Concept is a single musical idea the application can train and track:
 * a chord quality, an interval, a mode, a harmonic device.
 *
 * Concepts are deliberately independent of the exercises that test them and
 * of the audio that renders them. An exercise declares which concepts a
 * question exercises; the learning model tracks mastery per concept id.
 *
 * This is the extension seam for later versions: a jazz-standard reference
 * library, theory notes, or transcription examples attach to a concept id
 * without the practice engine knowing anything about them.
 */
export type ConceptKind = 'chord' | 'interval' | 'mode' | 'progression' | 'key';

export interface Concept {
  /** Namespaced and stable — it is the key for stored practice history. */
  id: string;
  kind: ConceptKind;
  /** Full display name, e.g. "Half-diminished (m7♭5)". */
  name: string;
  /** Compact label for answer buttons, e.g. "m7♭5". */
  short: string;
  /** Intrinsic difficulty, 1 (foundational) … 5 (advanced). */
  tier: number;
  /** Free-form classification. Reference material will be matched on these. */
  tags: readonly string[];
  /** One-line explanation shown in feedback and the progress screen. */
  blurb?: string;
}

export function conceptId(kind: ConceptKind, key: string): string {
  return `${kind}:${key}`;
}

/** Lookup across every registered concept, built once in catalog.ts. */
export class ConceptRegistry {
  private readonly map = new Map<string, Concept>();

  constructor(concepts: readonly Concept[] = []) {
    for (const c of concepts) this.add(c);
  }

  add(concept: Concept): void {
    this.map.set(concept.id, concept);
  }

  get(id: string): Concept | undefined {
    return this.map.get(id);
  }

  /** Falls back to a synthetic concept so an unknown id can never crash a screen. */
  resolve(id: string): Concept {
    return (
      this.map.get(id) ?? {
        id,
        kind: 'chord',
        name: id,
        short: id.split(':').pop() ?? id,
        tier: 3,
        tags: [],
      }
    );
  }

  all(): Concept[] {
    return Array.from(this.map.values());
  }

  byKind(kind: ConceptKind): Concept[] {
    return this.all().filter((c) => c.kind === kind);
  }

  withTag(tag: string): Concept[] {
    return this.all().filter((c) => c.tags.includes(tag));
  }
}
