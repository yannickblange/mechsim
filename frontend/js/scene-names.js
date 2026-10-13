// scene-names.js - German display names of the example scenes (the file stems are the identifiers).
// Saved layouts show the name the user chose.
export const SCENE_NAMES = {
  beam_i_section: 'I-Träger (Balken, gedämpft)',
  buckling_columns: 'Knickstützen',
  cantilever_beam: 'Kragträger',
  cantilever_clamp: 'Eingespannter Block',
  disc_spring_moment: 'Scheibe mit Feder und Moment',
  double_pendulum: 'Doppelpendel',
  forced_vibration: 'Erzwungene Schwingung',
  free_vibration: 'Freie Schwingung (gedämpft)',
  harmonic_oscillation: 'Harmonische Schwingung',
  impulse_pendulum: 'Pendel mit Kraftstoß',
  incline_roller: 'Schiefe Ebene (Loslager)',
  physical_pendulum: 'Physikalisches Pendel',
  pinned_block_spring: 'Gelagerter Block mit Feder',
  resonance: 'Resonanz',
  rod_truss: 'Block an zwei Stäben',
  rope_catch: 'Seilfang',
  single_mass_spring: 'Masse-Feder-System',
  spring_damper: 'Feder und Dämpfer',
  truss_bridge: 'Fachwerkbrücke',
  truss_elastic: 'Elastisches Fachwerk',
  two_mass_chain: 'Zwei-Massen-Kette',
  welded_pendulum: 'Starrer Winkel am Festlager',
};

export const sceneLabel = (stem) => SCENE_NAMES[stem] ?? String(stem).replaceAll('_', ' ');
