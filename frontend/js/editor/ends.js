// ends.js - which ends of a Stab are clamped (fest eingespannt) and which are pins. Pure; mirrors the engine
// (native/engine/constraints/link.cpp for a rigid Stab, io/beam_builder.cpp for an elastic one):
//   - an end on a block or a disc is clamped (the Stab is a rigid arm of the mass) unless params.hinged_a / hinged_b;
//   - an elastic Stab (a bar) is also clamped at a node that has an Einspannung (fixed_support);
//   - every other end (the ground, a Festlager, a node, a beam) is a pin.
export const MASS_TYPES = ['block', 'disc'];

export function stabClamps(scene, stab) {
  const elastic = stab.type === 'bar';
  return ['a', 'b'].map((side) => {
    const end = stab[side];
    const body = end && end.body !== null && (scene.bodies || []).find((b) => b.id === end.body);
    if (!body) return false;
    if (MASS_TYPES.includes(body.type)) return !(stab.params && stab.params[`hinged_${side}`]);
    return elastic && body.type === 'node' && (scene.constraints || []).some((c) => c.type === 'fixed_support' && c.body === body.id);
  });
}

// The ends of a Stab that sit on a block or a disc (the ones whose end condition can be chosen): ['a', 'b'].
export function massEnds(scene, stab) {
  return ['a', 'b'].filter((side) => {
    const end = stab[side];
    const body = end && end.body !== null && (scene.bodies || []).find((b) => b.id === end.body);
    return body && MASS_TYPES.includes(body.type);
  });
}
