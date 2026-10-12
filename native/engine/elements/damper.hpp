// damper.hpp - viscous damper ("Dämpfer") between two anchors (v0.3c).
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/element.hpp"
#include "../core/types.hpp"

namespace ms {

// Force along the axis proportional to the rate of change of the length:
//   F = c * dL/dt = c * u . (v_b - v_a),  u = (p_b - p_a) / |p_b - p_a|
// positive (tension) while the ends move apart: it always resists the motion. Force on a: +F u,
// on b: -F u. It stores no energy (potentialEnergy 0) and dissipates c (dL/dt)^2.
class Damper : public Element {
public:
    Anchor a;
    Anchor b;
    double c = 0.0;  // N s / m

    const char* type() const override { return "damper"; }
    void applyForces(World& world, double t) override;
    // Adds "p1", "p2" (world positions of a and b) and "force" (tension positive).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    double axialForce(const World& world) const;
};

// spec: {"id", "type": "damper", "a": anchor, "b": anchor, "params": {"c"}}
// At least one end must be on a mass and the ends must be on different masses.
std::unique_ptr<Element> makeDamper(const nlohmann::json& spec, const World& world);

}  // namespace ms
