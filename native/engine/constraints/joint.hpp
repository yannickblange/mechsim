// joint.hpp - Gelenk (pin_joint) and rigid connection (fixed_joint) between two masses (v0.3).
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"

namespace ms {

// pin_joint: the two anchor points coincide (2 equations), the bodies may rotate against each other.
// fixed_joint: additionally the relative angle is fixed (3 equations).
// lambda = force (and moment) the joint exerts on body a; body b gets the opposite.
class Joint : public Constraint {
public:
    Anchor a;  // both anchors are on bodies
    Anchor b;
    bool fixed = false;
    double relAngle0 = 0.0;  // phi_a - phi_b at the start (fixed joint)
    Vec2 reaction;           // force on a
    double moment = 0.0;     // moment on a (fixed joint)

    const char* type() const override { return fixed ? "fixed_joint" : "pin_joint"; }
    int dim() const override { return fixed ? 3 : 2; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (world point on a), "reaction" ([Fx, Fy] or [Fx, Fy, M], on body a).
    void writeFrame(const World& world, nlohmann::json& out) const override;
};

// spec: {"id", "type": "pin_joint" | "fixed_joint", "a": anchor, "b": anchor}  (bodies, not ground)
std::unique_ptr<Constraint> makePinJoint(const nlohmann::json& spec, const World& world);
std::unique_ptr<Constraint> makeFixedJoint(const nlohmann::json& spec, const World& world);

}  // namespace ms
