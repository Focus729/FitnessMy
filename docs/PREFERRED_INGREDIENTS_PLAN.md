# Preferred ingredients and dish details

Proposed on 2026-11-15. Pavel subsequently approved architecture A and the picker above the menu comparison. The release follows the existing Cloudflare procedure.

FitnessMy already creates and compares up to three catalog-based menus. Candidates contain ingredient identities, and saved recipes can store preparation steps. The current portion sheet shows nutrition and lets the user log a portion. The recipe editor does not expose the existing steps field. The separate weekly planner already has shopping-list logic that can inform a later daily shopping view.

## Architecture choices

| Option | Behavior | Trade-off |
| --- | --- | --- |
| A. Profile preferences and catalog recipes (recommended) | Store a set of canonical ingredient IDs in the profile. Rank Menus 1 and 2 with a bounded preference bonus. Rank Menu 3 with the existing nutrition and diversity logic, ignoring the preference bonus. Add authored steps for built-in dishes and optional editable steps for personal recipes. | Predictable calculations, works when Hermes is unavailable, fits the existing React/IndexedDB/Cloudflare setup. Novel dishes come from the eligible catalog. |
| B. Profile preferences plus ingredients for a date | Add a separate dated list for what the user especially wants to use today, with the profile list as a starting point and a reset action. Use the same catalog search and recipe sheet. | Better for leftover ingredients. Adds decisions about date, cross-device conflicts and retention. Quantities and pantry depletion are a separate feature. |
| C. Catalog suggestions plus Hermes recipe drafts | Keep A as the source of record. Let the user request a new recipe draft for Menu 3. Resolve ingredients against the catalog, validate units and amounts, compute nutrition locally and require explicit approval before saving it as a recipe. | More variety and more validation and failure states. The model can suggest unavailable foods or unreliable instructions. Agree on the new request data and Hermes availability before enabling drafts. |

Use A for the initial release. Preserve an upgrade path to B if a permanent favorites list and ingredients available today prove to be different needs. Model-generated recipes remain a separate decision.

## Recommended behavior

- Edit **Preferred ingredients** beside the existing day summary. Search the food catalog, select entries and show removable chips with localized labels. Use stable IDs and existing catalog normalization for known equivalent forms such as baked and boiled chicken breast. Keep unknown custom foods distinct. Display a saved preference even when the corresponding food disappears, with a way to remove it. An empty list uses ordinary menu ranking.
- For the first two menus, reward meaningful use of a preferred ingredient, especially the main ingredient. Cap the bonus so small amounts, repeated ingredients and added portions cannot dominate nutrition fit or variety. Existing exclusions filter every menu before ranking. Retain the light-meal rule when the calorie target is reached. Replan only open meal slots when the diary changes.
- Rank **Try something new** without the preference bonus and favor a different combination from Menus 1 and 2. It may include ingredients from the preferred list. A different dish can come from the existing catalog or the user's saved recipes. Use stable numbering and keep the diversity checks. When the catalog cannot supply three distinct menus, show the available menus and explain the limit. If the day has no preferred matches, provide valid alternatives and say that no preferred ingredients fit.
- Store the optional preference list in existing profile settings so phone and PC share it. Review settings sync validation, backup validation, conflict handling and compatibility with an older client before enabling the field on production. Keep separate ingredient exclusions consistent with their current behavior. Hermes continues ranking qualified menu IDs as an optional signal. It cannot move a menu into another category, change recipes or calculate diary values.
- Tapping a dish title or **Ingredients and recipe** opens a bottom sheet on phone and the existing wider sheet on desktop. Show the proposed portion, nutrition, ingredients with quantities for that portion and numbered preparation steps. Reuse the existing portion preview and confirmation. For built-in dishes, author and review the steps in Russian and English, with the same raw/cooked basis as the catalog. For a custom recipe, display its saved steps and offer an edit action. If steps are missing, show the ingredients and say that instructions have not been added.
- For saved recipes, distinguish ingredient weights from the finished serving weight. Scale source ingredient quantities by the selected share of the recipe yield, and reuse existing nutrition logic for the diary. Preparation steps may reference raw ingredients only if the catalog and measured portion make that distinction explicit.

## Interface choices

| Option | Phone and desktop behavior |
| --- | --- |
| A. Controls above the menus (recommended) | Show **Preferred ingredients · 4** above the cards. Open the product search in a sheet. Show a compact match indicator on the first two menus and label the third **Try something new**. The dish opens a detail sheet on both layouts. |
| B. Separate preferences screen | Put management in **Food → Preferences**, with an edit link and match count above the cards. Keep the dish sheet in the daily menu. This provides more room for a large list or dated overrides, at the cost of an extra navigation step. |

Use the [interactive interface preview](audit/preferred-ingredients-preview.html) to compare the two placements. The preview uses sample data and demonstrates navigation, dish details and the preferred ingredient selector.

## Implementation and acceptance

| Requirement | Work and expected result | Verification | State |
| --- | --- | --- | --- |
| P1. Select and retain preferred ingredients | Add a searchable selector and optional syncable profile setting. Empty preferences restore normal ranking. | Select and remove products in Russian and English. Reload, open the profile on a second device, and verify restore from a backup without the new field. Test concurrent settings edits and missing ingredient references. | Released |
| P2. Soft ranking for Menus 1 and 2 | Add a bounded preference score within the existing menu search, after eligibility checks. | With suitable chicken and rice dishes, mark those ingredients and verify both menus favor matches. A poor match for the remaining macros yields to a viable alternative. Excluded foods never appear and a logged breakfast stays closed. | Released |
| P3. Independent Menu 3 | Use the nutrition and diversity scorer for a dedicated discovery slot. | A recipe with a new ingredient can appear. A preferred ingredient can still be present. Portion-only changes never count as three distinct menus. Verify small pools and single remaining slots. | Released |
| P4. Ingredients and preparation | Add a shared sheet and curated built-in steps. Extend the recipe editor to save optional user steps. | Open a dish on desktop and phone. Verify scaling for 75%, a recipe with different raw and finished weights, missing steps and keyboard focus return. Confirm that viewing a recipe leaves the diary untouched. | Released |
| P5. Release | Verify fallback with Hermes unavailable, nested sheets, Russian/English and phone/desktop layouts. Run the Cloudflare release gate on the committed source and verify staging and production. | Use the established public `Focus729/FitnessMy` repository, `master`, staging Worker and production Worker. GitHub pushes do not publish the Worker. See [RELEASE.md](../RELEASE.md). | Released |

Product counts, expiry dates, prices, pantry depletion, daily shopping export and generated recipe drafts are deferred. The first release uses the existing deployment and local menu computation without a new service or dependency.

The profile field is optional. The updated sync client advertises support with a request header. Older builds can continue syncing profiles without the field. Once a profile saves preferences, the Worker rejects legacy requests that would read the new settings payload or overwrite it. Installing the in-app update resumes synchronization with the existing cursor. A deliberate reset saves an empty list.
