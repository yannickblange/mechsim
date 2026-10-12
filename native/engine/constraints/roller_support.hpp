// roller_support.hpp - "Loslager": a body point may only slide along the supporting surface.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"

namespace ms {

class RollerSupport : public Constraint {
public:
    BodyIndex body = GROUND;
    Vec2 localPoint;     // on the body
    Vec2 groundPoint;    // world position on the surface line, captured in initialize()
    double angle = 0.0;  // direction of the surface line, rad CCW from +x
    Vec2 reaction;       // force of the support on the body (always along the surface normal)

    const char* type() const override { return "roller_support"; }
    int dim() const override { return 1; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (current world position of the body point, it slides) and "reaction" ([Fx, Fy]).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    // Unit normal of the surface: (-sin angle, cos angle).
    Vec2 normal() const;
};

// spec: {"id", "type": "roller_support", "body": id, "point": [x, y], "params": {"angle"}}
// angle is the direction of the surface line (the body slides along it); default 0 (horizontal).
std::unique_ptr<Constraint> makeRollerSupport(const nlohmann::json& spec, const World& world);

}  // namespace ms
