# What things are called

Every name a learner reads comes from one of the rules below. They live in
`src/music/degrees.ts` (what a note is called), `src/music/chords.ts` (how it
is spelled) and `src/music/catalog.ts` (what a voicing is called), and the
tests in `src/music/degrees.test.ts` and `src/music/naming.test.ts` hold the
app to them.

The point of writing them down is that a name is a claim. "♭5" beside a note
printed F♯ has told the reader two different things, and a learner who cannot
trust the labels has to check every one against the sound.

## 1. Degrees

1. A chord's own members are named by member number.

   a. 1, 3, 5 and 7, with ♭, ♯ or 𝄫 as needed.

   b. 2 and 4 in sus chords: a sus2 is 1 2 5, not 1 9 5.

   c. 6 in sixth chords.

   d. A quality may declare its members' names. Three do — the diminished
      seventh, whose top note is a 𝄫7; the six-nine; and the dominant 11th.
      The rest fall back to a shared table.

2. Above a seventh the stack keeps going: 9, 11 or 13 with alterations,
   never 2, 4 or 6.

3. With no seventh under it, nine semitones is a plain 6th. A C with an A on
   top is a C6, not most of a C13.

4. No name may reuse a member number the chord is already sounding.

   a. Not "♭5" beside a natural 5; it is a ♯11.

   b. Not "♭3" beside a major 3rd; it is a ♯9.

   c. The one exception is the diminished seventh, whose scale has eight
      notes to spread over seven letters: C°7 is C E♭ G♭ B𝄫 and the seventh
      that scale adds above it is a B.

5. A ♭5 or a ♯5 is always a member, never a colour.

   a. Six semitones above the root is the chord's own ♭5 where the chord
      declares one, and a ♯11 where it does not. Eight is its ♯5, or a ♭13.

   b. So a 7♭5 and a 7 played with a ♯11 are told apart by the chord, which
      is the only thing that can tell them apart: they are the same notes.

## 2. Spelling

1. The letter follows the name: root letter plus the number, less one. The ♭9
   of G is the letter a ninth above G, flattened, which is A♭ — not the G♯ a
   pitch-class table would reach for.

2. Four names are never printed: F♭, C♭, E♯, B♯. Each is a letter away from
   where a reader expects it, and each is the only place an octave number
   stops agreeing with the pitch. Nor is any double accidental. Where a
   degree asks for one, the plain enharmonic is used instead.

3. A chord in a key is spelled from the key.

4. A chord in no key — a chord-quality question, a colour question — chooses
   between the two names for its root.

   a. Fewest degrees it cannot print, then fewest accidentals, then the
      family: flats for the major side, sharps for the minor and diminished.

   b. An alteration the chord's own name warns you about gets no vote. A ♭9
      wants an awkward letter whichever root it is written from.

## 3. Chords

1. A chord's identity is its stack up to the 7th: root, third or sus, fifth
   with any alteration, and seventh or sixth.

2. Everything above the 7th is colour. A ∆9 is a ∆7 that was played with its
   9th, so the answer is ∆7 and the 9 is named in the reveal.

3. Each basic chord has one colour table, from the scale it comes from, and
   the voicing engine, the filter that drops ambiguous answers and the colour
   exercise all read it.

   a. ∆7 and 6: 9, ♯11, 13.

   b. m7, m6 and m∆7: 9, 11, 13.

   c. 7, 7sus4 and 7♭5: 9, 13 — and ♭9, ♯9, ♯11, ♭13 when altered.

   d. ø7: 9, 11, ♭13. A natural 13 would sit a semitone above its own ♭5.

   e. °7: 9, 11, ♭13, 7. The last is the natural seventh its scale puts
      above the chord's own 𝄫7.

   f. 7♯5 and ∆7♯5: 9, ♯11.

   g. A triad takes its seventh chord's, less whatever needs a seventh
      underneath it to be heard as an extension at all.

## 4. Voicings

1. A voicing's name says which notes are in it, how they are spaced, and —
   only where that is the difference — what the hands have at the bottom.

   a. **Close, root on the bottom.** Every chord stacked plainly from its
      root. Short form: *Root on bottom*.

   b. **Close, voice-led.** The same notes, each chord taking whichever
      position sits nearest the one before. Short form: *Voice-led*. In the
      voicing quiz, where there is no chord before it, the answer reads
      *Close, another tone on the bottom*.

   c. **Shell**, **Rootless**, **Drop 2**, **Quartal**, **Upper-structure
      triad.**

   d. A rootless voicing is **A** or **B** — the 3rd, 5th, 7th and 9th,
      starting from the 3rd or from the 7th. The two alternate down a chain
      of fourths, which is why a ii–V–I can be played with the hand barely
      moving.

2. A voicing's name never says "root position" or "inversion".

   a. Those describe the bass and nothing else. With the root underneath, a
      chord is in root position however the hands are stacked above it.

   b. An inversion appears as a slash chord — C/E — and in a numeral as I/3.

   c. The hands are described by voicing type plus the tone at the bottom,
      and only where that tone is not the root: *Close · 3rd on the bottom*.

3. A bottom-tone note keeps its alteration where the alteration is news.

   a. *♭13 on the bottom*, *♯5 on the bottom*, *♭5 on the bottom*.

   b. Not on the third or the seventh, where every minor chord has a ♭3 and
      every dominant a ♭7: *3rd on the bottom*, *7th on the bottom*.

4. The **basic chord** is the plain version: close, root on the bottom, no
   tensions, over a root bass.

   a. It is what *Hear the basic chord* plays, what *Compare with the basic
      chords* compares against, and what the *Basic chords only* setting
      holds everything to.

   b. It is not called "root position", because the chord a learner has just
      heard is usually in root position already. What the plain version takes
      away is the voicing and whatever the voicing added.
