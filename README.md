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
   degree each one is playing beside it — *E4 9*, *C4 ♭7*, *A3 5*, *F3 ♭3* —
   and the bass underneath a rule. The degrees line up into a column of their
   own, so a card can be read either as notes to play or as the shape of the
   voicing. Tap a card to hear that chord on its own; tick *Roll a single chord
   from the bass* and it arpeggiates upward from the bass note before striking
   the chord, which is the only way to hear every voice in a five-note stack
   and still hear it as a chord.

   ii. The **Voicing** selector above the list decides how all of them are
   played: *Root position* (the default), *Voice led*, *Shell*, *Rootless*,
   *Drop 2*, *Quartal* or *Upper structure*. Root position stacks every chord plainly from its root with the
   root doubled underneath and nothing moving down there, so you can learn
   the reference sound of a chord before meeting the ways a pianist disguises
   it. The choice is remembered.

   iii. Each set of changes carries the voicing a player would reach for, named
   and then shown rather than explained: *Rootless · ♭3 5 ♭7 9 · ♭7 9 3 5 ·
   3 5 7 9* says what a sentence about why would not. Tapping it plays the
   changes that way.

   iv. Beside the roman numerals is what the bass does — *Bass falls a fifth,
   then rises a fourth* — read off the notes that are about to be scheduled
   rather than off the numerals, so it describes the register they are played
   in rather than the one they are written in.

   v. The **Voicings** tab takes them one at a time, under three headings:
   *What it is* (the shape, in degrees), *When to use it* (the setting a player
   actually reaches for it in) and *Worth knowing* (the thing the shape alone
   does not tell you — why there are two rootless forms, why a quartal voicing
   refuses to commit to major or minor, why an upper-structure triad is always
   rooted on a tension). Under them are the degrees it sounds over a set of
   changes that shows it off, and a *Compare with root position* button that
   plays those changes plainly and then in the voicing, back to back.

   vi. The notes on screen and the notes that sound come from one function,
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

   i. **Name the voicing** — one chord sounds; say how it is arranged, not what
   it is. The chord symbol is printed in the prompt, because the question is
   about the shape. Only chords whose shapes come out audibly different are
   used: on a plain seventh a spread voicing and a drop 2 can land on the same
   four notes, and then there are two right answers.

   j. **Guide tones** — a progression plays; follow the line the 3rds and 7ths
   make through it. The reveal of a changes question also names the root
   motion — *Bass falls a fifth, then rises a fourth* — taken from the bass
   notes that were scheduled, so it cannot describe something other than what
   played. The wrong answers are the same line with one or two notes
   moved to the other guide tone of that chord, so the only way to reject one
   is to have followed the voice the whole way.

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
   anywhere — you hear the chord rather than the stack. Chord questions and
   changes questions draw on the same curve, in `src/exercises/voicing-plan.ts`,
   so the two move together. Settings → Display → *Voicings* overrides it:
   *Plain* is root position whatever the level, *Realistic* is rootless and
   drop 2 from the start, and *Mixed* is the curve.

   d. **More in the bass.** Levels 1 and 2 play one held root per chord, so
   the root motion is all there is to hear. Level 3 adds the fifth. Levels 4
   and 5 walk, by which point telling a passing note from a change is part of
   the skill being tested. There is no setting for it — the level decides, as
   it decides the voicing.

   e. **Fewer reference cues.** Reference pitches and stated keys disappear at
   the higher levels.

   f. **Harder harmony.** Sustained block chords give way to comping with a
   walking bass; progressions get longer, faster and more substituted.

   g. In adaptive mode every concept carries its own level, so you can be
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


### 6.1 Voicing, as a modifier rather than a concept

   a. A chord heard in close position and the same chord heard rootless are two
   different listening problems, and a learner can have one and not the other.
   That is worth knowing, and it is recorded.

   b. It is not recorded as a concept of its own. Giving every chord quality an
   entry per voicing would multiply the material by five and spread practice
   across cells that mostly agree with each other. What is worth knowing is
   narrower — that a learner who has a ii–V–I in close position loses it
   rootless — and that is a correction to one number, not five more things to
   schedule.

   c. So each skill record carries a small per-voicing breakdown inside it. A
   voicing only counts as weak once it has been seen a few times and trails the
   concept's own strength, and then it tilts which of the voicings the level
   already allows comes up next. It never widens what is on offer, and a
   learner who is equally good at all of them is steered nowhere.

   d. The one exercise that asks about voicings by name is the exception: there
   the shape is the answer, so it has concepts of its own and the chord it was
   played on is not marked either way.

## 7. Architecture

   a. `src/music/` — pure theory. Note spelling, intervals, chord qualities,
   inversions, scales, progressions, voicing and phrase generation. No audio,
   no UI, no React. Roman numerals are derived from the chord quality rather
   than written out by hand, so a blues IV13 is written as IV13 and cannot
   drift back to IV7. What a chord *is* and what a voicing *sounds* are kept
   apart: the ii–V–I is written Dm7 · G7 · C∆7 even though every voicing on
   the cheat sheet sounds a 9th over all three, because the 9th belongs to the
   voicing and the symbol names the chord.

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

   d. The bass has three styles and no setting, in `src/audio/performer.ts`.
   **Root only** is one held root per chord. **Root and fifth** adds the fifth
   halfway through a long chord. **Walking** is quarter notes — root, fifth,
   seventh, then a step into the next root. Which one plays is never asked:
   the cheat sheet takes it from the voicing already chosen (root position
   gets roots alone, everything else gets the root and its fifth, and it never
   walks), and a session takes it from the level, as part of the same curve
   the voicings follow. Root motion is one of the main things a learner is
   trying to hear, and anything the bass plays between the roots is in the way
   of hearing it, so the early levels have nothing between them.

   e. A walking line will not approach a root from a half step above while
   tritone-substitution questions are still being asked, because that approach
   is note for note the bass of one. It comes from a half step below or the
   tone above instead. The point at which the rule lifts is read from the
   progression library — the highest tier among enabled progressions whose
   roots slide down a half step — rather than named in code, so it moves if
   the library does.

   f. Every bass note carries what it is doing: root, fifth, passing or
   approach. Nothing in the audio says which is which, so the line says it and
   the cheat sheet shows it — roots at full weight, everything between them
   lighter and labelled.

   g. Seven voicing styles live in `src/music/voicing.ts`. Four are searched —
   candidate stacks scored for spacing and voice leading. Three are fixed
   shapes, because the order of the notes is what makes them that voicing:
   rootless (3–5–♭7–9, or ♭7–9–3–5, alternating down a chain of fourths),
   quartal (three perfect fourths and a major third, the "So What" shape), and
   upper structure (guide tones underneath, a plain triad on the chord's
   tensions above). A shape is only used when it still states every tone the
   chord is named for; where it cannot, the engine falls back rather than play
   something else under the name.

   h. The 9th a pianist adds to every rootless voicing is off by default. It is
   right at a piano and wrong in a question — a rootless Dm7 voiced F A C E
   sounds a 9th, and "m7" stops being the only defensible answer — so the
   cheat sheet asks for it and the exercises do not.

   i. `src/exercises/` — one module per exercise type, each implementing the
   `ExerciseType` interface. A question carries its own audio, its own hint and
   its own reveal, so the session engine never special-cases a type.

   j. `src/learning/` — the skill model, the adaptive selector, local
   persistence and the statistics behind the progress screen.

   k. `src/session/` — the session state machine. Questions are generated one at
   a time, not queued up front, so the model reacts to answers *within* a
   session. `daily.ts` is the exception: it builds all ten up front from a
   date-derived seed, and the engine plays that script instead of selecting
   anything, which is what makes the Daily shared.

   l. `src/ui/` — React screens and components, plus one stylesheet holding the
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
   without being made duller, and a soft limiter sits near the end of the
   chain: a straight wire below about 0.78 of full scale, a gentle knee above
   it, and a ceiling just under 1.

   i. **The volume control is after the limiter**, and it used to be before.
   That one position was the whole fault: the volume *was* the pre-limiter
   gain, so turning the app up did not make it louder so much as drive it
   further into the clipper — and a bass and a chord soft-clipped together
   intermodulate, which puts a buzz at the bass's frequency on everything
   above it. The chain's headroom is now a fixed `MASTER_TRIM` instead, and
   volume only scales what has already been limited. It can make the output
   quieter; it can no longer make it dirtier. The default moved to the top of
   the slider for the same reason.

   ii. That trim is 0.6, which is a measurement rather than a taste. Rendered
   through the real chain, the loudest thing in the catalogue is a rolled
   quartal voicing of A♭m7 off the cheat sheet; at 0.6 it peaks 2.0 dB under
   the limiter's knee, where at 0.7 the margin is 0.7 dB and at 1.0 it clips.
   The whole app is about 3 dB quieter at the same volume setting than it was,
   and clean where it was not.

   iii. The compressor attacks in 26 ms rather than 6. One cycle of the lowest
   note the app plays is 18 ms, and a compressor faster than that moves its
   gain *within* a bass cycle — which is distortion rather than levelling.

   iv. The limiter's WaveShaper is no longer oversampled, which is the
   opposite of the usual advice and is right here. Oversampling means
   upsample, shape, filter back down, and that last filter rings: measured
   through this curve, a sawtooth driven into the knee came out at **1.16** of
   full scale, in Chromium and in the offline renderer alike. A limiter that
   can exceed its own ceiling is not a limiter, and the pad voice is three
   sawtooths. Below the knee all three settings are bit-identical, and above
   it the curve is a gentle tanh whose harmonics are low-order, so the
   aliasing this gives up costs less than the ceiling it was breaking.

   v. All four are held by renders in `src/audio/mix.test.ts`, not by
   reasoning about the curve. The old test asserted that no point of the
   *curve* exceeded full scale, which was true and was not the question.

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

   g. Being in the right register is not the same as being audible from it.
   The bass register is 55 Hz to 147 Hz; a phone radiates almost nothing below
   about 500 Hz and a modest laptop gives up around 200, so on the devices
   this app is used on, none of these fundamentals reach the listener at all.
   Rendered through speaker models, the bass used to sit **34 dB** under the
   chord on a phone — not quiet, absent. Turning it up would not have helped:
   the speaker cannot move air down there at any level.

   i. The fix is the missing fundamental. The ear reconstructs a root from its
   harmonics, which is why a bass guitar is audible through a laptop at all,
   so the voice is one periodic wave of 24 partials. The series runs to a
   *frequency*, not to a harmonic number: counting harmonics instead leaves
   the bottom octave as inaudible as it was, because six harmonics of 55 Hz
   still only reach 330 Hz.

   ii. The lowpass over that series moves, and that is what makes it a string
   rather than a saw. Hold a cutoff still and every harmonic sustains in fixed
   proportion, which is the definition of a sawtooth and is what this sounded
   like. It now opens bright under the fingers — 1.2 to 2.2 kHz across the
   register, which is what puts the note on a phone — and closes to four times
   the fundamental, between 220 and 500 Hz, with a time constant of 120 ms.
   Key-tracked rather than fixed, so the same handful of harmonics survives on
   every note instead of the top of the register going dull and the bottom
   still buzzing. The trade is deliberate: the sustain is well under what a
   phone can radiate, so a phone listener places the note on its attack, which
   stays above that speaker's corner for at least a tenth of a second.

   iii. There are three dials, and they are independent. `BASS_TILT` sets the
   tone — harmonic *h* has amplitude h^-tilt — the pair of sustain bounds set
   how far the filter closes, and `BASS_LEVEL` sets how far under the comping
   it sits: 2 to 4 dB in the comping textures, about 10 in the cheat sheet's
   held chords. Turning it down cannot make it smoother, and brightening it
   cannot make it louder.

   iv. That level is measured **K-weighted** (ITU-R BS.1770), and the switch
   from A-weighting is why it moved so far. A-weighting is a 40-phon curve —
   the ear at a whisper — and discounts 55 Hz by nearly 29 dB. A bass set
   through it to measure 13 dB under the comping was in fact sitting 5 to 7 dB
   *over* it, which is what people heard on headphones. K-weighting discounts
   the same note by 3.4 dB and is what broadcast loudness is measured with.
   `src/audio/mix.test.ts` holds the balance by rendering the real chain
   offline, because what the voices do to each other is the one thing no
   single-voice measurement can see.

   v. The tilt matters more than it looks, because partials a fundamental
   apart sit well inside one critical band up at 500 Hz and beat against each
   other. Measured as sensory roughness on the lowest note: the sine this
   replaced scores 0.006, a first attempt at a tilt of 0.8 scored 0.088 and
   buzzed audibly on headphones, and the 1.8 shipped here scores 0.027, which
   is plucked-string territory. Past about 2 the harmonics get too weak to
   carry the note on a phone, which is what they are for.

   vi. The partials are in plain sine phase. An earlier version spread them
   quadratically to flatten the waveform — a standard trick for test signals,
   and the wrong one here. It bought a single dB of crest factor, and at
   55 Hz a period is 18 ms, long enough for that dispersion to be heard as a
   chirp within every cycle. A tilt steep enough to sound like an instrument
   flattens the waveform anyway: 2.8 dB of crest against 8.5 for the bright
   wave the trick was propping up.

   vii. What that costs, stated plainly, because it is a trade and not a free
   win. At equal level the new tone delivers over 20 dB more to a phone than
   the old one did, on the quietest note of the register. But the level came
   down 9.5 dB, and the sustain a phone would have radiated is now below what
   it can radiate, so in the mix the bass sits further under the comping on a
   small speaker than on headphones — about 12 dB further, where the old
   design was about 9 dB further. A phone listener places each note on its
   attack and then loses it, which is what the closing filter is for.

   viii. Raising the settle to buy that back does not work, and the figure is
   worth recording so nobody tries it twice. Taking the sustain from four
   times the fundamental to eight moves the phone balance by 1.9 dB and drops
   the upper-partial loss that makes it sound plucked from 12 dB to 2.7 — it
   buys almost nothing and spends the whole tone. The dial that controls
   presence on a phone is `BASS_LEVEL`, and that one is set by the headphone
   balance.

   ix. `src/audio/audibility.test.ts` guards all three failure modes:
   inaudible, unpleasant, and static. It models a speaker as a cascaded
   high-pass and the ear as K-weighting, and asserts how much of each note
   actually reaches a listener — against the old design, so it cannot pass by
   asserting something any design would meet — that the tone stays under the
   roughness that made the first attempt buzz, and that the filter really does
   close, by a measured 12 dB of upper partials, while the fundamental rings
   on. An earlier version of that file measured the *fraction* of the voice's
   energy that survived instead, which sounds equivalent and is not: the
   denominator is dominated by a fundamental nobody can hear, so it rewarded
   brightness for its own sake and passed the design that buzzed.

   x. Four ways of breaking it were checked against that file and each one
   fails it: cutting the series to six partials, steepening the tilt to 3,
   dulling the attack, and closing the filter four times faster.

## 10. Your data

   a. Practice history is written to `localStorage` on this device and nowhere
   else.

   b. Settings → Practice history exports it as JSON, imports it back, or erases
   it.

   c. If the browser blocks local storage — private browsing is the usual cause
   — the app says so and still works; the session just is not remembered.
