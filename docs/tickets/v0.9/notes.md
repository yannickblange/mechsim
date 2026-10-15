# v0.9 notes: vibration analysis window

Branch `v0.9/vibration-analysis` (from `main`), not merged.

## What was asked

Look closely at critical cases of spring-mass-damper systems: Dämpfungsgrad, Eigenwerte, Eigenfrequenz, how close the system is to critical damping; diagrams with more options;
values of the example editable in the diagram window (name a mass and a spring, change their values on the fly) to see how the vibration changes.

Decisions with the user: every change **restarts the run and keeps the previous run as a faded overlay** (the analytic prediction updates at once); scope is
**translations, any number of masses**; systems that cannot be linearised honestly say so with a reason.

## What was added

| Layer | Content |
|-------|---------|
| Backend | `python/mechsim/analysis/vibration.py` (`analyse`), `POST /api/analysis` (`server/routes.py`), scene `label` (body, element, constraint; `contracts/scene.schema.json`) |
| Frontend (pure, Node-tested) | `js/analysis/params.js` (values, sliders, names, excitation, start), `describe.js` (zones, gauge, German texts), `models.js` (chart models) |
| Frontend (DOM) | `js/analysis/chart.js` (canvas charts), `js/analysis/panel.js` (the window), `Api.analyse`, the **Analyse** button, CSS `.ana*` |
| Tests | `tests/validation/test_v09_vibration.py`, `tests/frontend/analysis.test.mjs` (fixtures `tests/frontend/fixtures/analysis.json`), API tests in `tests/python/test_editor_api.py` |

## Decisions worth knowing

- **The window works on a copy of the scene**; *Übernehmen* hands it to the app (into the editor model while editing, otherwise `apply` as a draft).
- **The start follows the rest position.** After the first answer the start is stored as offsets from the rest position (`initialOffsets`), so a stiffer spring does not start the mass
  at the old absolute position but the same distance from its new rest position. `offsets` in the request do this on the server (a pin keeps its world point).
- **Out-of-order answers are dropped** (request token), changes are debounced by 70 ms. A request takes 30 ms with the engine run.
- The first run is the reference until *Referenz = jetzt* sets another; the checkbox hides it.
- A critical-damping mode is reported with `omega_d = 0`; the D gauge runs 0 to 2 so that D = 1 is in the middle; the damper slider runs from 0 to 2.5 `c_crit`.

## Regenerating the frontend fixtures

`tests/frontend/fixtures/analysis.json` holds real answers of `/api/analysis` (free vibration with u0 = 0.04 m, forced vibration, the chain, a truss, and
free vibration with c = 1.5 c_crit). After a change of the answer format start the server and rebuild it with the same scenes and requests (see the commit
`[V0.9-3]`), then run `node --test tests/frontend`.
