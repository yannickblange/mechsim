// element.hpp - abstract force element (spring, damper, load, ...). Complete, frozen for v0.1.
#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace ms {

class World;

class Element {
public:
    std::string id;

    virtual ~Element() = default;

    // Type name as used in the scene JSON, e.g. "spring".
    virtual const char* type() const = 0;

    // Add this element's forces/torques to the bodies' accumulators (Body::applyForceAt).
    virtual void applyForces(World& world, double t) = 0;

    // Stored potential energy (0 for non-conservative elements).
    virtual double potentialEnergy(const World& world) const { (void)world; return 0.0; }

    // v0.4: an element that is part of something else (the finite elements of a beam) and has no
    // entry of its own in frames.
    virtual bool hidden() const { return false; }

    // Fill the frame entry for this element. World::frame() has already set "id" and "type";
    // the element must add every other field required by contracts/state.schema.json.
    virtual void writeFrame(const World& world, nlohmann::json& out) const = 0;
};

}  // namespace ms
