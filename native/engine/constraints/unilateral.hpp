// unilateral.hpp - optional interface of constraints that can switch on and off (v0.3: ropes).
//
// Kept separate from the frozen Constraint interface: solver/unilateral.cpp finds implementers
// with dynamic_cast. An implementer's dim() may change between steps (0 while inactive, but it
// must not change while a system is being assembled and solved).
#pragma once

namespace ms {

class World;

class Unilateral {
public:
    virtual ~Unilateral() = default;

    // Start of a step: decide whether the constraint is active for this step.
    // Return true if the velocities must be projected onto the constraint before the step
    // (the constraint just engaged against a velocity that violates it).
    virtual bool updateActive(const World& world, double dt) = 0;

    // After a solve: does the multiplier (dim() entries) have the wrong sign for an active
    // constraint, i.e. should it be released?
    virtual bool shouldRelease(const double* lambda) const = 0;

    // Switch off; dim() becomes 0.
    virtual void release() = 0;
};

}  // namespace ms
