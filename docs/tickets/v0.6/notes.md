# v0.6 notes: German UI and dimensioned cross sections

Branch `v0.6/german-dimensions` (from `main` at v0.5), not merged. A local agent had created `v0.6/ui-german` (worktree `mechsim-agentB`) but
made no commits and no changes there, so this branch was started from scratch next to it.

## What was asked

1. Everything visible in the frontend in German.
2. In the cross-section form, the fields that change the dimensions sit on the drawing itself, like on an architectural drawing.

## What was added

| Layer | Content |
|-------|---------|
| Frontend text | `index.html` (`lang="de"`), `main.js`, tools (hints, errors, previews, tool names), property forms (titles, info texts, labels, validation messages), graph panels, symbol labels on the canvas, section names and messages |
| Format | `js/format.js`: `decimal(x, digits)` / `comma(x)`, decimal comma in all displayed numbers and in the input fields; typed numbers still accept a dot |
| Scene names | `js/scene-names.js` (dropdown), the `"name"` of every example scene is German (shown as the layout name when editing) |
| Layout names | `slugify` turns ä ö ü ß into ae oe ue ss instead of dropping them |
| Cross section | `js/editor/sectiondim.js` replaces `sectionview.js`: outline, extension lines, dimension lines with arrows, neutral axis, centroid; returns the positions of the fields, `editor.js` places the real inputs there (same names as before, so the form, FormData and `applyProperties` are unchanged) |
| Tests | `tests/frontend/*` expect the German texts; `sectiondim.test.mjs` (every dimension has one field, fields stay inside the drawing, off the section and off each other, also for thin and wide sections) |

## Decisions worth knowing

- **Terms**: Festlager, Loslager, Einspannung (was "Lager (fixed)"), Gelenk, starre Verbindung, Stab, Seil, Feder, Dämpfer, Knoten, Balken, Fläche (surface), Aufbau (layout),
  Flansch / Steg (flange / web and stem), Querschnitt, Knicklast, "entspannte Länge" with the "Schattenfeder" (ghost).
- **Dimension fields by kind**: a long dimension (b, h) has its field centred on the dimension line, a short one (tf, tw, t) has the arrows outside and the field next to it;
  the I's web thickness tw has a leader to the right of the section, the H's tw a field above the web. The L's t and the square's a are drawn twice (both thicknesses / both sides),
  the second one only names the letter. The drawing does not redraw while typing (the fields would move under the cursor); it is rebuilt when the type changes or the popup is opened again.
- **Not translated**: server messages (HTTP errors such as a scene that fails validation), the descriptions inside the scene files, ids, CSV column names, console warnings,
  and the Python docs. They are not visible in normal use, apart from the error banner when the server rejects a scene.
