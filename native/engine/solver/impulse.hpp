// impulse.hpp - impulsive loads at t = 0 (v0.2).
#pragma once

namespace ms {

class World;

// Collects the impulse of every ImpulseSource element and applies the resulting velocity jump to
// the bodies. The jump respects the constraints: with generalised impulse J and constraint
// impulse Lambda (G^T Lambda acts on the bodies),
//     M dv = J + G^T Lambda,    G (v + dv) = 0
// is solved with the same Schur complement as the accelerations. Does nothing (and leaves the
// velocities untouched) if no element carries an impulse. Throws std::runtime_error if the
// constraint system is singular.
void applyInitialImpulses(World& world);

}  // namespace ms
