// fixed_support.hpp - "Einspannung" / fixed Lager: locks x, y and rotation of a body point.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"

namespace ms {

class FixedSupport : public Constraint {
public:
    BodyIndex body = GROUND;
    Vec2 localPoint;    // on the body
    Vec2 groundPoint;   // world position, captured in initialize()
    double phi0 = 0.0;  // body angle, captured in initialize()
    Vec2 reaction;      // force of the support on the body
    double moment = 0.0;  // moment of the support on the body (CCW positive)

    const char* type() const override { return "fixed_support"; }
    int dim() const override { return 3; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (groundPoint) and "reaction" ([Fx, Fy, M]).
    void writeFrame(const World& world, nlohmann::json& out) const override;
};

// spec: {"id", "type": "fixed_support", "body": id, "point": [x, y], "params": {"angle"?}}
std::unique_ptr<Constraint> makeFixedSupport(const nlohmann::json& spec, const World& world);

}  // namespace ms
