// spring.hpp - linear translational spring ("Feder"). Interface frozen for v0.1.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/element.hpp"
#include "../core/types.hpp"

namespace ms {

class Spring : public Element {
public:
    Anchor a;
    Anchor b;
    double k = 0.0;            // N/m
    double restLength = 0.0;   // m

    const char* type() const override { return "spring"; }
    void applyForces(World& world, double t) override;
    double potentialEnergy(const World& world) const override;
    // Adds "p1", "p2" (world positions of a and b) and "force".
    void writeFrame(const World& world, nlohmann::json& out) const override;

    // Current length |p_b - p_a|.
    double currentLength(const World& world) const;
    // Axial force k (L - L0), positive = tension.
    double axialForce(const World& world) const;
};

// spec: {"id", "type": "spring", "a": anchor, "b": anchor, "params": {"k", "rest_length"?}}
// anchor: {"body": id | null, "point": [x, y]}. If rest_length is missing, use the initial length.
std::unique_ptr<Element> makeSpring(const nlohmann::json& spec, const World& world);

}  // namespace ms
