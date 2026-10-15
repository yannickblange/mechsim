# v1.0 notes: release

Release of the v0.9 vibration-analysis window (see `docs/tickets/v0.9/notes.md`) with these changes after the first version of the window:

- The **Analyse** button is a large floating button at the bottom right of the stage (next to the dark-mode button), no longer in the top bar.
- The window has three charts: Verlauf (deflection with the faded reference), Geschwindigkeit and Frequenzgang. Energy, phase plane and pole charts were removed from the window
  (the chart models stay in `frontend/js/analysis/models.js`).
- **In die Simulation übernehmen** is a large button at the bottom of the value column. It says whether the simulation still has the old values and is only enabled when something
  changed. It hands over the changed values and names and the **start pose** of the window's run (a start deflection or a rest position that moved with a mass or spring).
