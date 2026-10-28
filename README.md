# Ears

Ear training for jazz musicians. A browser app, built phone-first for practising
on an iPhone, that trains chord quality, intervals, tonal centres, modes and
harmonic movement — and uses your practice history to decide what to ask next.

No account, no server, no network calls. Practice history lives in the browser.

---

## 1. Running it

   a. Install dependencies.

      i. `npm install`

   b. Start the development server.

      i. `npm run dev`

      ii. It prints a network URL as well as a localhost one. Open the network
      URL on a phone on the same Wi-Fi to practise on the device it was
      designed for.

   c. Build and preview a production bundle.

      i. `npm run build`

      ii. `npm run preview`

   d. Run the checks.

      i. `npm test` — unit tests for the music theory, the question
      generators, the audio gain staging and the learning model.

      ii. `npm run build` type-checks the whole project as part of the build.

   e. On iOS, Share → Add to Home Screen installs it as a standalone app.

## 2. Deploying

The repository publishes itself to GitHub Pages. `.github/workflows/deploy.yml`
builds the app and deploys it on every push to `main`.

   a. One-time setup, in the repository on GitHub.

      i. Settings → Pages → Build and deployment → Source → **GitHub Actions**.

      ii. That is the whole setup. Do not pick "Deploy from a branch": Pages
      would then serve the repository root, where `index.html` points at
      `/src/main.tsx` — a file that only exists before the build — and the page
      comes up blank.

   b. Publishing.

      i. Push to `main`. The Actions tab shows the run; it takes about a minute.

      ii. The site appears at `https://<user>.github.io/<repo>/`.

      iii. Actions → Deploy to GitHub Pages → Run workflow redeploys by hand
      without pushing anything.

   c. Any other static host works too. `npm run build` produces `dist/`, which
   uses relative asset paths and hash-based routing, so it needs no server
   configuration and can sit in a subdirectory.

## 3. What a session looks like

   a. Pick a length on the home screen and tap **Today's practice**. That is the
   whole setup for a daily session.

   b. Each question plays, you answer on a touch grid, and feedback appears
   immediately: right or wrong, what the answer was, and what actually sounded.

   c. Feedback stays up until you tap **Next**, whether you were right or
   wrong. It names the chord, spells it out and lists the notes that sounded,
   and the answer grid keeps its review colours, so there is time to replay it
   and hear what you missed. Settings → Display → *Advance automatically* makes
   correct answers move on by themselves instead.

   d. **The Daily** is ten questions with no clock, and it is the same ten for
   everyone who plays it that day.

      i. The questions come from the date and nothing else. The vocabulary,
      the difficulty ramp and the selection are fixed, and practice history is
      ignored, so two people comparing scores are comparing the same ten
      questions. Only presentation — instrument, note spelling, theme, whether
      hints are offered — follows the user.

      ii. The day rolls over at local midnight, so everyone gets their own
      day's puzzle rather than one pinned to a timezone on the other side of
      the world.

      iii. It scores once. Replaying is good practice and leaves the day's
      score alone.

      iv. A finished Daily can be shared as a grid — one square per question,
      green for right, amber for right after a hint, red for missed — with the
      score and a link, and nothing that gives the questions away. It goes to
      the system share sheet on a phone, and to the clipboard elsewhere.

   e. **Choose what to practise** opens the full settings: exercise types,
   duration, difficulty, keys, hints, and the chord, interval, mode and
   progression vocabulary in play.

   f. The answer options are held back for the first three seconds, because
   with them on screen you can narrow a question down by reading rather than by
   listening. Tap the panel to bring them up early, or change it under
   Settings → Display → *Show answers*: straight away, after three or five
   seconds, or when the question has finished sounding — which suits the longer
   exercises better than a fixed count.

   g. **The cheat sheet** (the book icon on the home screen) lists everything
   the exercises draw on — every progression, chord quality, interval and mode
   — in whichever of the twelve keys you choose, each with a play button. It
   shows the concrete chords or notes in that key alongside the roman numerals
   or degrees, so it works both for checking what something sounds like and for
   playing along with it.

   i. On the **Changes** tab each progression breaks out into one card per
   chord, showing the notes that are about to sound, highest first, with the
   bass underneath a rule. Tap a card to hear that chord on its own; tick
   *Roll a single chord from the bass* and it arpeggiates upward from the bass
   note before striking the chord, which is the only way to hear every voice
   in a five-note stack and still hear it as a chord.

   ii. The **Voicing** selector above the list decides how all of them are
   played: *Root position* (the default), *Voice led*, *Shell*, *Rootless* or
   *Drop 2*. Root position stacks every chord plainly from its root with the
   root doubled an octave below and nothing moving underneath, so you can learn
   the reference sound of a chord before meeting the ways a pianist disguises
   it. The choice is remembered.

   iii. The notes on screen and the notes that sound come from one function,
   `referenceVoicings` in `src/audio/reference.ts`. The display cannot drift
   from the audio, because there is nowhere for it to drift to.

   h. On a desktop keyboard, number keys answer, `R` replays, `H` plays the
   hint and `Enter` moves on. `S` shows held-back answers early.

## 4. The exercises

   a. **Chord quality** — one chord sounds; name the quality.

   b. **Chord, root and quality** — name both. A reference pitch is available as
   a hint so the root can be found by ear rather than by absolute pitch.

   c. **Inversions** — a triad or seventh sounds with one of its notes in the
   bass. Name the inversion. The answer is written as a slash chord, and the
   chord exercises do the same whenever their voicing turned the chord over, so
   a reveal never reports less than the ear was given.

   d. **Intervals** — ascending, descending or harmonic, simple or compound.

   e. **Tonal centre** — music plays; find the note that feels like home. Up to
   level 3 a reference pitch sounds first; above that it is only available as a
   hint, which the model records.

   f. **Modes** — one or two chords establish a tonic, then a line is played
   over them. Generated lines are guaranteed to sound the degrees that
   distinguish the mode, because a Dorian phrase that never touches the natural
   6th is just an Aeolian phrase with no right answer. The feedback names the
   mode against the scale you already know — "minor with a natural 6th" — and
   points at the degree that gave it away.

   g. **Chord changes** — a progression plays; name the harmonic movement.
   Every option offered has the same number of chords as the answer: each one
   shows its roman numerals, so options of other lengths could be discarded by
   counting the changes rather than by listening to them. The library carries
   at least three progressions at every length so the match can always be made.

   h. **Chords in context** — a progression plays; name one chord from inside
   it.

### 4.1 Questions it will not ask

A multiple-choice question is only fair if exactly one of the options accounts
for what was heard. Two kinds of question fail that test no matter how well the
rest of the app works, so they are filtered out before the options are built.
Both filters are enforced by the sweep in `src/exercises/audit.test.ts`, which
generates several thousand questions and fails the build if either reappears.

   a. **Chords that sound the same whichever way up they are** are never used
   for inversion training.

   i. An augmented triad, a diminished seventh and a 7♭5 divide the octave
   evenly. C+, E+ and G♯+ are the same three notes; turn one over and nothing
   about the sound changes. There is no cue in the audio to say which note is
   the root, so "which inversion is this?" has no answer a listener could
   reach, and four of the options are as defensible as the one marked correct.

   ii. `isSymmetrical()` in `src/music/chords.ts` detects this by transposing
   the quality by each of its own intervals and checking whether the pitch
   classes come back unchanged; `invertibleQualities()` keeps those chords out
   of the pool. They remain available everywhere else — naming an augmented
   triad by ear is a perfectly good question, and still asked.

   b. **Wrong answers that are in fact right** are dropped from the options.

   i. Above level 3 the voicing may leave the root out, and a rootless chord
   can land exactly on a different chord: a rootless Em7♭5 is a G minor triad,
   note for note, and D sus2 and A sus4 are the same three notes read from
   different roots. Offering both leaves nothing to decide by ear, and the
   adaptive model would then record a defensible answer as a failure and keep
   drilling it.

   ii. Each chord question compares the pitch classes it is about to sound
   against every quality in the pool, rooted on all twelve degrees, and removes
   any that reproduces the set exactly. Only the quality that was actually
   played survives. The answer itself is never filtered out, and if the pool
   were ever reduced below two the unfiltered pool is used instead.

   c. **One ambiguity is deliberately kept.** Aeolian and Phrygian differ in a
   single note — the second degree — and a generated line that happens not to
   touch it fits both. Narrowing the phrase generator until every modal line
   always sounds its distinguishing degree would make the modal exercise
   predictable, and the pairing is one worth meeting. The audit test asserts
   that this remains the *only* pair of modes a phrase can fail to separate.

## 5. How difficulty works

Difficulty is not playback speed. Each level changes what the ear actually has
to do:

   a. **Closer wrong answers.** At level 1 the alternatives are spread across
   the whole vocabulary; at level 5 they are the genuine near misses, chosen
   from pitch-class overlap plus hand-listed traps (°7 against 7♭9, 6 against
   m7, m7♭5 against m6).

   b. **More alternatives.** Four choices at level 1, eight at level 5.

   c. **Thinner voicings.** Level 1 is a rolled, root-position close voicing
   with a bass note underneath. Level 5 is a rootless inversion with no root
   anywhere — you hear the chord rather than the stack.

   d. **Fewer reference cues.** Reference pitches and stated keys disappear at
   the higher levels.

   e. **Harder harmony.** Sustained block chords give way to comping with a
   walking bass; progressions get longer, faster and more substituted.

   f. In adaptive mode every concept carries its own level, so you can be
   working at level 5 on major 7ths and level 2 on altered dominants in the same
   session.

## 6. The adaptive model

Each concept — a chord quality, an interval, a mode, a progression, a key —
carries one record in `src/learning/model.ts`:

   a. **Strength**, a smoothed estimate of how reliably you hear it. A right
   answer counts 1, a right answer after a hint counts 0.6, a wrong answer
   counts about 0.

   b. **A review interval.** Getting something right stretches the gap before it
   returns; getting it wrong collapses it. The gap is capped at about a month,
   so mastered material always comes back for a retention check instead of
   disappearing.

   c. **A difficulty level**, promoted when the current level is solid over its
   last few attempts and demoted when it is not. Improvement raises the bar
   rather than removing the concept.

Choosing the next question (`src/learning/selector.ts`) scores every eligible
concept:

   a. Weakness and overdue-ness push a concept up.

   b. Having just been asked pushes it down, so one weak chord is not drilled to
   death inside a single session.

   c. Mastered material keeps a small standing claim and jumps up when it falls
   due.

   d. New material is introduced roughly in order of difficulty rather than all
   at once, so a first session does not open with 13♭9.

   e. A little noise keeps two sessions in a row from feeling identical.

The exercise type is then chosen by how much of that wish list it can actually
serve — if the weak material is all altered dominants, the session leans toward
chord questions without being told to.

## 7. Architecture

   a. `src/music/` — pure theory. Note spelling, intervals, chord qualities,
   inversions, scales, progressions, voicing and phrase generation. No audio,
   no UI, no React. Roman numerals are derived from the chord quality rather
   than written out by hand, so a progression that plays a ninth is written as
   V9 and cannot drift back to V7.

   b. `src/music/concept.ts` — the seam the brief asks for. A **Concept** is one
   trainable idea with a stable id. Exercises declare which concepts a question
   exercises; the learning model tracks mastery per concept id. Neither knows
   anything about the other.

   c. `src/audio/` — `engine.ts` owns the context, the reverb and the master
   chain; `instruments.ts` holds the synthesis; `performer.ts` turns musical
   intentions into scheduled notes, including swing, comping and walking bass.
   `reference.ts` describes a progression as the cheat sheet both shows it and
   plays it, so the two always agree; `demo.ts` is the single-item playback the
   other cheat-sheet tabs use.

   d. `src/exercises/` — one module per exercise type, each implementing the
   `ExerciseType` interface. A question carries its own audio, its own hint and
   its own reveal, so the session engine never special-cases a type.

   e. `src/learning/` — the skill model, the adaptive selector, local
   persistence and the statistics behind the progress screen.

   f. `src/session/` — the session state machine. Questions are generated one at
   a time, not queued up front, so the model reacts to answers *within* a
   session. `daily.ts` is the exception: it builds all ten up front from a
   date-derived seed, and the engine plays that script instead of selecting
   anything, which is what makes the Daily shared.

   g. `src/ui/` — React screens and components, plus one stylesheet holding the
   design tokens.

## 8. Extending it

Everything the brief lists as future work attaches at an existing seam.

   a. **A new chord quality** — add an entry to `CHORD_QUALITIES` in
   `src/music/chords.ts`, or call `registerChordQuality` at runtime. It
   immediately becomes practisable, trackable, selectable in settings and
   available as a distractor; similarity to other qualities is computed, not
   tabulated, so it gets sensible wrong answers for free. The same applies to
   `registerInterval`, `registerScale` and `registerProgression`.

   b. **A new exercise type** — implement `ExerciseType` and add it to
   `EXERCISE_TYPES` in `src/exercises/registry.ts`. Session planning, adaptive
   selection, the answer UI and the statistics all work off that interface.
   Transcription, guide-tone recognition, melodic dictation and rhythm all fit
   this shape.

   c. **A better instrument** — implement the `Instrument` interface and call
   `registerInstrument`. Sampled instruments drop in without touching the
   routing; the synthesised voices exist so that version 1 ships with no audio
   assets.

   d. **A jazz-standard reference library** — this is why concepts are separate
   from the exercises that test them. Every concept has a stable id and a tag
   list (`device:tritone-sub`, `melodic-minor`, `blues`), so a library of
   standards can be matched to concepts and surfaced from feedback or the
   progress screen without the practice engine knowing it exists.

## 9. Audio

   a. The instruments are synthesised, so the app ships with no samples and
   works offline. The default voice is a two-operator FM electric piano: a 1:1
   pair for the body and a 14:1 pair with a very short decay for the tine.
   Harder notes get a brighter, longer modulation index, so it responds to touch
   rather than just getting louder.

   b. The reverb is a procedurally generated impulse response — decaying noise
   with a few early reflections — rather than a shipped file.

   c. Gain staging is explicit, because a six-note voicing plus a bass note sums
   well past full scale and digital clipping is the quickest way to make a
   synthesised piano sound cheap. Chords are trimmed by the square root of the
   voice count, loudness is kept separate from velocity so a chord is balanced
   without being made duller, and a soft limiter sits last in the chain: a
   straight wire below about 0.78 of full scale, a gentle knee above it, and a
   ceiling just under 1.

   d. Safari needs a user gesture before audio will start, so the unlock happens
   on the tap that begins a session. iOS also needs a silent media element
   playing, or the hardware mute switch silences Web Audio; both are handled in
   `src/audio/engine.ts`.

   e. The accompaniment takes its notes from the harmony rather than assuming
   them. Both cases matter because the bass and the drone sit underneath
   everything, which is exactly where a wrong note is least forgivable.

   i. The bass line plays the fifth the chord actually holds — diminished
   under a half-diminished chord, augmented under an altered dominant — and
   holds the root through the bar when the chord has no fifth at all. Walking
   it a perfect fifth under a m7♭5 would put a semitone against the ♭5 the
   chord is named for.

   ii. The modal drone sounds the tonic alone when the mode has no perfect
   fifth. A drone is a held note, so a natural 5 under a Locrian line would
   contradict its ♭5 for the whole phrase — and that ♭5 is the answer.

   f. The bass also has to be *heard* as the bass, which is a question of
   register rather than of pitch class. Two rules in `bassLine`
   (`src/audio/performer.ts`) settle it, and both are swept over every
   progression, every key, both bass styles and every voicing mode in
   `src/audio/reference.test.ts`.

   i. Every bass note stays inside the bass register. The sustained fifth used
   to be placed above the root without that check, and from B♭2 it landed on
   F3 — above the register and in unison with the bottom of the right hand.
   The ear takes the more recently struck of two identical notes as the bass,
   so the root decayed and a root-position B♭7 came to sound like B♭7/F. It is
   now played a fourth down instead whenever the fifth above will not fit.

   ii. No bass note comes within a whole step of the lowest note of the
   voicing, and the root's octave is chosen to sit about an octave below it
   where the register allows. Across all progressions in all twelve keys that
   collision happened in 33 of 1,872 chords; it now happens in none. Voicings
   are held to the matching half of the bargain: nothing, not even a dropped
   voice in a drop-2 chord, reaches below `VOICING_FLOOR` into the bass's half
   of the keyboard.

## 10. Your data

   a. Practice history is written to `localStorage` on this device and nowhere
   else.

   b. Settings → Practice history exports it as JSON, imports it back, or erases
   it.

   c. If the browser blocks local storage — private browsing is the usual cause
   — the app says so and still works; the session just is not remembered.
