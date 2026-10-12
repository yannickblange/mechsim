// ground_pin.hpp - Festlager in free space (v0.3): a pin at a world point, not on any mass.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"

namespace ms {

// Exerts no constraint (dim() = 0). It marks a fixed point that rope, Stab and spring ends can be
// attached to (as ground anchors at the same world point). Reported as type "pin_support".
class GroundPin : public Constraint {
public:
    Vec2 point;  // world

    const char* type() const override { return "pin_support"; }
    int dim() const override { return 0; }
    void fill(const World&, double*, int, double*) const override {}
    void setMultipliers(const double*) override {}
    // Adds "position" and "reaction" ([0, 0]: the forces of attached links are not summed up).
    void writeFrame(const World& world, nlohmann::json& out) const override;
};

// spec: {"id", "type": "pin_support", "body": null, "point": [x, y] (world)}
std::unique_ptr<Constraint> makeGroundPin(const nlohmann::json& spec, const World& world);

}  // namespace ms
