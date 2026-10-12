// unilateral.hpp - active-set handling of ropes (v0.3).
#pragma once

#include <vector>

namespace ms {

class World;

// Start of a step: let every Unilateral constraint decide whether it is active and project the
// velocities onto the constraints that just engaged (inelastic snap of a rope).
void updateUnilateral(World& world, double dt);

// After a solve with multipliers `lambda` (rows in constraint order): release the active
// Unilateral constraints whose multiplier has the wrong sign. Returns true if any was released,
// i.e. the system must be assembled and solved again.
bool releaseViolated(World& world, const std::vector<double>& lambda);

}  // namespace ms
