// unilateral.cpp - activation and release of ropes.
#include "unilateral.hpp"

#include <vector>

#include "../constraints/unilateral.hpp"
#include "../core/world.hpp"
#include "impulse.hpp"

namespace ms {

void updateUnilateral(World& world, double dt) {
    bool engaged = false;
    for (auto& c : world.constraints) {
        if (auto* u = dynamic_cast<Unilateral*>(c.get())) engaged = u->updateActive(world, dt) || engaged;
    }
    if (engaged) projectVelocities(world, std::vector<double>(3 * world.bodies.size(), 0.0));
}

bool releaseViolated(World& world, const std::vector<double>& lambda) {
    // Find the violators first: releasing changes dim() and with it the row offsets.
    std::vector<Unilateral*> violators;
    int row = 0;
    for (auto& c : world.constraints) {
        if (auto* u = dynamic_cast<Unilateral*>(c.get())) {
            if (c->dim() > 0 && u->shouldRelease(lambda.data() + row)) violators.push_back(u);
        }
        row += c->dim();
    }
    for (Unilateral* u : violators) u->release();
    return !violators.empty();
}

}  // namespace ms
