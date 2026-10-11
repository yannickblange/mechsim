// pin_support.hpp - "Festlager": pins a body point to the ground (locks x and y). Frozen for v0.1.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"

namespace ms {

class PinSupport : public Constraint {
public:
    BodyIndex body = GROUND;
    Vec2 localPoint;    // on the body
    Vec2 groundPoint;   // world position, captured in initialize()
    Vec2 reaction;      // last multipliers = force of the support on the body

    const char* type() const override { return "pin_support"; }
    int dim() const override { return 2; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (groundPoint) and "reaction" ([Fx, Fy]).
    void writeFrame(const World& world, nlohmann::json& out) const override;
};

// spec: {"id", "type": "pin_support", "body": id, "point": [x, y], "params": {}}
std::unique_ptr<Constraint> makePinSupport(const nlohmann::json& spec, const World& world);

}  // namespace ms
