// bar.hpp - elastic Stab (v0.4): an axial member with a cross section, k = E A / L.
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/section.hpp"
#include "spring.hpp"

namespace ms {

// A Stab that is not infinitely stiff: a pin-ended two-force member with axial stiffness E A / L0
// (L0 the installed length, so it starts unstressed). Statically indeterminate trusses have a
// unique solution with these (rigid Stabs would make the constraint system singular). Bending and
// buckling are not modelled.
class Bar : public Spring {
public:
    Section section;
    const char* type() const override { return "bar"; }
    // Spring's p1, p2, force plus "stress" (force / A, Pa, tension positive).
    void writeFrame(const World& world, nlohmann::json& out) const override;
};

// spec: {"id", "type": "bar", "a": anchor, "b": anchor, "params": {"section": {...}}}
std::unique_ptr<Element> makeBar(const nlohmann::json& spec, const World& world);

}  // namespace ms
