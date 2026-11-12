# Redesign direction — B selected

On 2026-10-29 Pavel selected **B — Training companion** and requested the implementation plan. B applies across the application, with training receiving the strongest action hierarchy; food, body, habits, and progress remain first-class modules. This selection supersedes the earlier recommendation for A. The full implementation scope in [PLAN.md](PLAN.md) was approved on 2026-10-29 and is being implemented.

Baseline and findings: [REDESIGN_AUDIT.md](docs/REDESIGN_AUDIT.md). No external design references were supplied. Existing Manrope/IBM Plex Mono typography, calm surfaces, restrained accents, and local-first behavior are the starting point.

Open [the static concept preview](docs/audit/design-directions.html) to compare two directions. These are illustrative layouts with synthetic data, not working app screens, approved designs, or replacement code. English is used in this design artifact; implementation must include Russian and English.

## A — Daily journal (historical alternative, not selected)

Prioritize today's balance, a clear Add food action, and a compact next-workout card. Put water, weight, sleep, and habits in labelled quick actions. Use sentence-case headings, generous spacing, and a quiet blue accent. Preserve the brand's calm character while reducing unexplained abbreviations and visual ambiguity.

Phone: profile/settings header; today/date; calories and nutrients; primary action; next workout; optional wellbeing/habits; five bottom tabs. Desktop: a 216 px navigation rail, a 1080–1200 px workspace, two columns for overview, a full week grid for planning, and bounded editors. Keep all primary actions aligned with content.

Proposed tokens: existing light/dark surfaces and text palette initially; 8 px spacing scale; 14–16 px corner radii; 16 px body text, 24–32 px page headings, 40–48 px main metric. Use tabular numbers for metrics rather than all supporting prose. Preserve contrast; validate both profile accents separately.

Best fit: balanced nutrition, training, body, and habit use by the existing two-person audience. Lower visual migration cost; supports both frequent phone tasks and desktop analysis.

## B — Training companion (selected)

Lead with the active/next workout, large exercise/set input, previous-session context, and a persistent rest timer. Use a darker, higher-density exercise surface and a restrained teal accent. Nutrition and body logging remain available, but workout execution receives the strongest visual hierarchy.

Phone: session progress; current exercise; large weight/repetition inputs and Complete set; next exercise; timer. Desktop: program/calendar rail plus session or exercise detail pane. Do not make dark mode mandatory; light mode remains required.

Best fit: users whose main activity is recording workouts. Tradeoff: this gives less immediate emphasis to nutrition and may require more reorganization of Today.

## Selected application and layout rules

B is the visual and interaction direction for the entire shell and active workout. Do not silently substitute the previous A/B hybrid recommendation. Today prioritizes active workout, then the next actual plan, then an explicit start/program action when neither exists. Nutrition balance and direct food/water/body actions remain visible. The plan explicitly replaces the old rigid five-block rule and universal bottom-sheet geometry while preserving their clarity and safe-close intent.

Use existing locally bundled Manrope for text and IBM Plex Mono for important metrics; tabular numbers must remain readable. Proposed B tokens: dark background `#10171E`, raised surface `#1C2730`, primary text `#F4F6F9`, secondary text `#AEBCC8`, teal accent `#80E2CD` with dark text on accent buttons. Light mode uses light neutral surfaces, dark text, and a darker teal accent (starting candidate `#0F6B61`). These are implementation candidates to validate for actual contrast, both profile accents, and all states; they are not a completed contrast certification. Preserve existing theme preference and support system/light/dark.

Use an 8 px spacing scale, 14–18 px panel radii, approximately 16 px body text and 40–48 px key metrics, with at least 44 px touch targets. Phone layouts use bottom navigation and bounded contextual actions. At desktop widths use a roughly 216 px navigation rail and a flexible 1080–1200 px workspace, calendar/session or chart/detail panes, and constrained dialogs. At narrow tablet widths collapse to a single content column rather than squeezing two unreadable panes. Prioritize content fit over rigid breakpoint labels.

The static preview is a selected direction reference, not a pixel-perfect specification. Its controls and data are illustrative; the older A desktop example remains an alternative, not the approved final desktop screen. The B desktop workspace must be rendered and checked during M2/M3 of the plan.

## Shared behavior and architecture

- Preserve React/TypeScript, repository interfaces, Dexie profile isolation, HashRouter compatibility, centralized i18n, existing dark/light support, and service-worker behavior unless targeted evidence justifies a change.
- Do not adopt new major dependencies during discovery. Check official current compatibility when an implementation plan proposes an upgrade.
- Encode subview/date in navigation state; direct links must select the intended record/action.
- Use a text draft for numeric inputs and canonical values in storage. Keep formatting/conversion in shared utilities.
- Add an explicit draft → validating → saving → saved/error lifecycle. Close editors only after success; retain drafts on error.
- Phone editors may remain bottom sheets; desktop editors use bounded dialogs/side panes. Share logic and validation, not forced identical geometry.
- Group settings into Profile, Appearance, Targets, Data, and Integrations, with persistent access.
- Provide skeleton/loading, useful empty state, inline retry, offline capability explanation, and saved feedback for each accepted flow. Missing values must not look like zero.
- Dialogs require meaningful names, focus trapping/restoration, topmost-only Esc, visible close, and keyboard paths. Controls target at least 44×44 px where practical.
- RU/EN use one translation source and persisted preference; reserve space for longer labels and locale-specific numbers/dates. User-entered names must not be overwritten by translated defaults.
- No backend or new ongoing operating cost is proposed. Cross-device synchronization remains a separate decision.

## Design acceptance before release

Review 320/390/768/1440 widths, both languages, both themes, both profile accents, and realistic empty/loading/error/populated states. Test keyboard focus, mobile keyboard overlap, long food/exercise names, large numbers, offline resume, and navigation back to edited records. Static concept previews do not satisfy these release checks.

## Cyberpunk-inspired redesign

Pavel requested stronger panel separation, more feedback on actions, and a Cyberpunk 2077 visual direction. Use the game's high-contrast HUD palette and angular panel geometry as reference for an original FitnessMy theme. [CD PROJEKT RED reference](https://www.cyberpunk.net/ch/en/cyberpunk-2077).

Two alternatives are available in the [interactive comparison](docs/audit/cyberpunk-menu-preview.html). Pavel approved A, Yellow HUD, on 2026-11-12.

- **A. Yellow HUD, selected.** Graphite base `#090D17` with cyan and violet ambient gradients. Raised panels run from `#142431` to `#10121F`. Primary and selected controls run from acid yellow `#FFF268` to amber `#FFB43E`. Cyan `#62E2EC` marks metrics and focus.
- **B. Magenta HUD.** Violet base `#110C19` with magenta and blue ambient gradients. Panels run from `#32192F` to `#13172C`. Selection runs from magenta `#FF80BE` to coral `#FFB083`. Turquoise `#75F4E4` marks metrics and inner panel edges.

Use Unbounded 700 for page titles, menu headings and the FitnessMy wordmark. Use bundled Manrope for labels and body text, and IBM Plex Mono for numbers and short meal labels. The app and prototype share local Cyrillic and Latin WOFF2 subsets and the OFL license. Keep sentence case in longer labels, an 8 px spacing scale and at least 44 px touch targets. Verify contrast at both ends of gradients in dark and light variants. [Unbounded font metadata](https://github.com/google/fonts/blob/main/ofl/unbounded/METADATA.pb).

On desktop, the left rail anchors navigation. Show the three menu frames side by side below one shared nutrition summary. On phone, use a three-button selector above one menu frame. Keep the surrounding navigation accessible, preserve scroll and keyboard focus on updates, and show selection by border, control state and text. Use a compact meal summary on Today and the full comparison in Food. Respect existing light and system preferences.

Use short, user-triggered motion. Proposed timings are 90–120 ms for button press, 160–220 ms for view and menu selection, and 180–240 ms for sheets and save feedback. Use opacity and small transforms with stable space for content. Animate changed meal rows when recomputation finishes. Provide static equivalents for reduced motion and keep feedback visible without animation.

See the [implementation plan](docs/CYBERPUNK_REDESIGN_PLAN.md) for the sequence and acceptance checks. The existing training-first layout continues to govern Today.
