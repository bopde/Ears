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

   e. **Choose what to practise** opens the full settings: exercise types,
   duration, difficulty, keys, hints, and the chord, interval, mode and
   progression vocabulary in play.

   f. On a desktop keyboard, number keys answer, `R` replays, `H` plays the
   hint and `Enter` moves on.

## 4. The exercises

   a. **Chord quality** — one chord sounds; name the quality.

   b. **Chord, root and quality** — name both. A reference pitch is available as
   a hint so the root can be found by ear rather than by absolute pitch.

   c. **Intervals** — ascending, descending or harmonic, simple or compound.

   d. **Tonal centre** — music plays; find the note that feels like home. Up to
   level 3 a reference pitch sounds first; above that it is only available as a
   hint, which the model records.

   e. **Modes** — a vamp establishes a tonic, then a line is played over it.
   Generated lines are guaranteed to sound the degrees that distinguish the
   mode, because a Dorian phrase that never touches the natural 6th is just an
   Aeolian phrase with no right answer.

   f. **Chord changes** — a progression plays; name the harmonic movement.

   g. **Chords in context** — a progression plays; name one chord from inside it.

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
   scales, progressions, voicing and phrase generation. No audio, no UI, no
   React.

   b. `src/music/concept.ts` — the seam the brief asks for. A **Concept** is one
   trainable idea with a stable id. Exercises declare which concepts a question
   exercises; the learning model tracks mastery per concept id. Neither knows
   anything about the other.

   c. `src/audio/` — `engine.ts` owns the context, the reverb and the master
   chain; `instruments.ts` holds the synthesis; `performer.ts` turns musical
   intentions into scheduled notes, including swing, comping and walking bass.

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

## 10. Your data

   a. Practice history is written to `localStorage` on this device and nowhere
   else.

   b. Settings → Practice history exports it as JSON, imports it back, or erases
   it.

   c. If the browser blocks local storage — private browsing is the usual cause
   — the app says so and still works; the session just is not remembered.
