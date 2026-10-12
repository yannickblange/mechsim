// stiffness.hpp - how fast can the force elements make the system oscillate? (v0.4)
#pragma once

namespace ms {

class World;

// Estimate of the highest natural frequency (rad/s) of the force elements (springs, bars, beams) in
// the current pose: the largest eigenvalue of M^-1/2 K M^-1/2 (K = -d f / d q by central differences
// of the element forces, power iteration), square-rooted. Constraints are ignored: they can only
// lower the frequencies. 0 for a world without force elements. The world's state is unchanged.
double estimateMaxOmega(World& world);

}  // namespace ms
