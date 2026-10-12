// impulse_source.hpp - optional interface of elements that act as an impulse at t = 0 (v0.2).
//
// Kept separate from the frozen Element interface: solver/impulse.cpp finds implementers with
// dynamic_cast, so elements without impulses need no change.
#pragma once

#include <vector>

namespace ms {

class World;

class ImpulseSource {
public:
    virtual ~ImpulseSource() = default;

    // Add this element's generalised impulse [Jx, Jy, J_tau] (N s, N m s, about the centre of
    // mass) to J, laid out like the global vector (body i owns 3i, 3i+1, 3i+2). Evaluated in the
    // initial pose. Called at t = 0 and again after every World::reset().
    virtual void addImpulse(const World& world, std::vector<double>& J) const = 0;
};

}  // namespace ms
