# Prep dictation — plan (not built)

Status: BUILDING, 11 Oct 2026. Steve gave the go ("just make it work").

Steve's choices (11 Oct 2026):
- Use the Gemini key the app already has (`VITE_GEMINI_API_KEY`). No new key. Use is low.
- The mic button is small and quiet: an icon next to the "Vehicle Prep" heading, not a big floating button.
- Flow: tap, talk while walking round the cars, tap stop, check the list, add to prep.

Build decision: the browser converts the recording to 16 kHz mono WAV before sending it. Gemini always accepts WAV, so iPhone (mp4) and Chrome (webm) recordings both work.

## What Steve wants

Steve walks round the forecourt with his phone. He taps one mic button and talks:
"The black Porsche needs a valet, a new nearside tyre and the scuff on the bumper done."

The app:
1. Works out which car he means.
2. If more than one car fits ("which black Porsche?"), it asks, with buttons to pick.
3. If only one car fits, it does not ask.
4. Shows a short job list per car for him to check.
5. Saves the jobs to the prep work on the front page (Dashboard).

## What already exists (use it, do not rebuild it)

- Prep jobs are ordinary to-dos: `ToDoItem` with `type: 'prep'`, `vehicleId`, `vehicleReg` (`types.ts:453`).
- The Dashboard already has a "Vehicle Prep" panel. It groups open prep to-dos by car, ticks them off and has a + per car (`pages/DashboardPage.tsx:184`, `VehiclePrepView`).
- Done prep goes to the Work Prep ledger (`components/work-prep/WorkPrepLedger.tsx`).
- Save call: `addToDo` from `useData()` (`contexts/DataContext.tsx:329`).
- Gemini calls live in `utils/ai.ts` (gemini-2.5-flash, JSON schema output). Same pattern for this.
- Car colour is `Vehicle.color?` (optional, so some cars have no colour).
- No mic code exists in the app today. `firebase.json` has no Permissions-Policy, so the mic is not blocked.

So the feature is only: a mic button, one Gemini call, a check screen, and a car picker. The jobs land in the panel that is already there.

## How it works

### 1. Record
- Big mic button in the header of the Dashboard "Vehicle Prep" panel. (In the paused redesign it also goes in the phone "Add" sheet.)
- Tap to start, tap to stop. Not hold-to-talk: Steve's hands are busy round the cars.
- Uses `MediaRecorder` (records the voice as a sound file). Works in iPhone Safari and Chrome.
- One recording can cover many cars: "Black Porsche: valet, tyre. Silver Golf: MOT, wipers."
- Max length 3 minutes. Show a timer and a red dot while recording.

### 2. Hear + understand (one Gemini call)
- New `parsePrepDictation(audio, stock)` in `utils/ai.ts`.
- Send the sound file plus a short list of cars IN STOCK only (not sold): id, reg, stock no., make, model, colour, year.
- Gemini returns JSON:
  ```
  { transcript: string,
    cars: [{ spokenAs: "the black Porsche",
             candidateIds: string[],      // every stock car that fits
             jobs: string[] }] }          // one short line per job
  ```
- Why audio to Gemini, not the browser's own speech-to-text: the browser one is patchy on iPhone (worst as a home-screen app) and mishears car names. Gemini gets the stock list, so it hears "Cayenne", "Macan" and plate letters right. Cost: about 2,000 tokens a minute, well under 1p per recording.

### 3. Pick the car (code, not Gemini, decides)
Rule from the Agent Inbox work: right car or no car. Never guess.
- `candidateIds` has exactly 1 → use it. No question.
- 2 or more → ask "Which black Porsche?" with one button per car (reg, model, colour, stock no.).
- 0 → ask "Which car?" with a search box over stock, or "Skip".
- Code checks every id Gemini returns is a real in-stock car. Unknown ids are dropped.
- Pure function `resolvePrepCars()` in new `utils/prepDictation.ts`, so it can be unit-tested.

### 4. Check screen
- One card per car: reg plate, model, and the job lines.
- Each line: tick box (on by default), tap to edit text, bin to delete.
- "+ add line" per car, and "Record more" to add another recording to the same list.
- The transcript shows small and greyed at the bottom, so Steve can see what was heard.
- Nothing saves until Steve taps "Add to prep".

### 5. Save
- Each ticked line → one `addToDo({ type: 'prep', description, vehicleId, vehicleReg, priority: 'normal', isComplete: false })`.
- If Steve says "urgent" or "first" on a job, Gemini flags it and it saves as `priority: 'high'`.
- Skip a job that is already an open prep to-do on that car (same text, ignoring case).
- Saves to the ledger that is open (Steve's or Chris's). Code works the same for both.

## Files

| File | Change |
|---|---|
| `utils/ai.ts` | add `parsePrepDictation()` |
| `utils/prepDictation.ts` | new: stock-list builder, `resolvePrepCars()`, duplicate check, to-do mapper |
| `components/work-prep/PrepDictation.tsx` | new: mic button, recorder, check screen, car picker |
| `pages/DashboardPage.tsx` | put the mic button in the Vehicle Prep panel header |
| `tests/prepDictation.test.ts` | new: matcher + mapper tests (Gemini mocked) |

## Tests (must pass before "done")

- `npx vitest run tests/prepDictation.test.ts`
- `npx vitest run` (whole suite still passes)
- `npx tsc --noEmit`
- Cases: one black Porsche → no question; two black Porsches → picker with both; colour missing on a car → still a candidate on make/model; sold car never offered; unknown id from Gemini dropped; duplicate job not saved twice; "urgent" → high.
- Real phone check: record on Steve's phone, at least one car with two matches.

## Risks / notes

- Gemini key is still in the browser (known security follow-up). This adds one more call of the same kind. Move all Gemini calls to a Cloud Function later, together.
- Many cars may have no colour. "The black Porsche" then matches every Porsche, so Steve gets the picker. Fix later: fill colour from the DVLA lookup.
- Noise on the forecourt (wind, traffic). Gemini copes well. The check screen catches the rest.
- No deploy without Steve's OK.

## Build order (when Steve says go)

1. gaffer-builder: `utils/prepDictation.ts` + tests + `parsePrepDictation()`.
2. gaffer-builder (or designer if the look matters): `PrepDictation.tsx` + Dashboard button.
3. gaffer-refuter: re-run the tests, read the diff.
4. Steve tries it on his phone on a local/preview build. Then deploy hosting with his OK.

Size: about 2–3 hours of agent time. Client only, no functions deploy.
