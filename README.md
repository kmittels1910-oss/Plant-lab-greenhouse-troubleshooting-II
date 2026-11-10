# Plant Growth Investigation (Brassica rapa x fertilizer)

A static, no-login virtual lab for a 100-level organismal biology course. The page is the **experimental environment only**: students observe plants, measure, and collect data. All means, variances, SDs, t-tests, graphs, hypotheses and written answers are done in the instructor's Excel workbook and lab document. The page never analyzes the student's data.

Files: `index.html`, `styles.css`, `app.js`, `README.md`. No dependencies, no server, no database.

## How the experiment works
- 4 treatments (Control 0, Low 0.75, Medium 1.25, High 2.0 g/L) x 4 pots x 4 plants = 64 plants with permanent IDs (e.g. `L2-3`).
- Day 0, 7, 14, 21 = Weeks 1-3 (Day 0 is collected in Week 1). The same plants persist all three weeks.
- Each week: observe plants, measure 4 representative plants with the ruler, then release the full dataset (copy to clipboard or CSV). A "STOP HERE AND OPEN YOUR EXCEL WORKBOOK" step lists the Excel tasks.
- Realistic messiness (all generated from the code): at most one documented failed germination (height 0, labelled "Documented failure" in Lab notes), one Week 2 complication (a much smaller plant, a strongly leaning plant, or a damaged leaf; these are plain observations, not documented failures), one unusually tall plant, one curved-stem plant at Day 21, and higher variability in HIGH. Students are taught to keep unusual values unless a documented failure is identified.

## Treating the pots (Week 1, Step 4)
After randomizing the bench, students treat each of the 16 pots. Each pot gets 400 mL of solution. Tools: a dropper bottle (50 g/L stock, one squeeze = 1 mL = 0.05 g) and a dry scoop (one level scoop = 0.10 g); either or both may be used. Students work out the amount for each treatment (a worked example for a non-experiment concentration is provided), tip out or pour the beaker, and confirm the pour, which cannot be undone. A treatment log shows what each pot actually received.
- The plants respond to the amount **actually applied**, not the intended treatment. Interpolating between the four treatment means: under-dosing a Medium pot gives Low-like growth, over-dosing a Low pot gives High-like growth, fertilizer added to a Control pot is contamination, and very high doses (above 2.8 g/L) reduce growth further and scorch leaves.
- An off-target pot (2 or more units, i.e. 0.10 g or more) is written into every plant's **Lab notes** as a "Documented dosing error", so students can discuss whether to exclude it. Smaller slips are not flagged.
- If every pot is on target, results are identical to the version without this step.
- The treatment step is the only change to Week 1's flow; later steps are renumbered 5-9.

## Experiment Codes
- Format `BR-` + 5 characters (new codes avoid 0, O, 1, I, L). The code is the random seed: the same code always rebuilds identical plants, measurements, events and bench layout on any computer.
- Progress (current step, completed weeks, released days) is also saved in the browser's local storage. On a new computer, students choose "Return to my experiment", enter the code, pick the week, and confirm they finished earlier weeks (honor system).
- **Extended codes:** if any pot is dosed off-target, the code gets a short suffix that records each pot's dose, e.g. `BR-7K4Q9-JJJP-ZJJJ-JEJJ-JJT`. Students must record and re-enter the FULL code in Weeks 2-3, because it rebuilds the same dosing outcomes on any computer. Perfect dosing leaves the code as `BR-7K4Q9`.
- Future-week data is never generated into the page until that week is opened.

## Hosting
Put the four files in the root of a GitHub repo (file must be named exactly `index.html`), then Settings > Pages > deploy from `main` / root. Embed in Canvas:
`<iframe src="https://USER.github.io/REPO/" title="Plant growth investigation" width="100%" height="1000" style="border:0;" allowfullscreen></iframe>`

## Opening weeks gradually
In `app.js`, `CONFIG.availableWeeks` (1, 2 or 3) controls which weeks students can open. Change it and re-upload at the start of each lab week. The week buttons show Not started / Current / Completed / Locked / Not yet available.

## Instructor mode
Add `?instructor=true` to the URL. A panel shows the seed, generated events, true heights, treatment assignment, current week and step, plus a test-code box and a week/step jump. Instructor mode also ignores locks. Student mode shows none of this.

## Changing the model (all in `CONFIG`, top of `app.js`)
- Concentrations: edit `treatments[].gl` (labels only; the response is set by `mean`).
- Expected treatment effects: `mean` = expected height (mm) at Day 0, 7, 14, 21 for each treatment. Make HIGH equal to or below MEDIUM for "more is not better".
- Biological variation: `cv` (plant-to-plant, as a fraction of the mean; HIGH is larger), `potCv` (pot effect), `noiseCv` (week-to-week), `day0Sd`.
- Dosing: `CONFIG.dosing` (pot volume, grams per dropper unit, scoop size, stock strength, overflow limit, how large an error is documented, how strongly overdoses cut growth).
- Rounding of recorded heights: `roundTo`. Ruler lengths: `dayMax`.
- Events are created in `generate()` (section 3 of `app.js`).

## Testing Weeks 1-3
Open `index.html?instructor=true`, load a code (e.g. `BR-TEST1`) in the instructor box, then use the jump control for any week and step. Try the same code twice to confirm identical data. To test as a student, open the page without the parameter. In instructor mode the full code and every dosing error appear in the panel.

## Accessibility
Semantic headings, skip link, native buttons/inputs/tables with captions and scoped headers, visible 4px focus outlines, high-contrast palette, status messages through live regions, and no color-only meaning. The ruler works by dragging, slider, number box and nudge buttons, plus a "Describe where the plant tip is" text alternative. Every plant and pot image has a text description. Animations stop under `prefers-reduced-motion` or the "Reduce motion" option. Accessibility options also offer larger text and high contrast. Please also test with your own screen reader and with your campus accessibility office before launch.
