// link.hpp - rope and Stab (rod): a fixed maximum / exact distance between two anchors (v0.3).
#pragma once

#include <memory>

#include <nlohmann/json.hpp>

#include "../core/constraint.hpp"
#include "../core/types.hpp"
#include "unilateral.hpp"

namespace ms {

// Rod ("Stab"): massless two-force member, |pb - pa| = L, carries tension and compression.
// Rope ("Seil"): |pb - pa| <= L, tension only. Infinitely strong: it never stretches. When it
// becomes taut the outward velocity is removed (inelastic).
// Both: C = L - |pb - pa|, so the multiplier is the axial force, tension positive.
class Link : public Constraint, public Unilateral {
public:
    enum class Kind { Rope, Rod };

    Kind kind = Kind::Rod;
    Anchor a;
    Anchor b;
    double length = 0.0;   // m
    bool active = true;    // rods are always active
    double force = 0.0;    // axial force of the last solve, tension positive

    const char* type() const override { return kind == Kind::Rope ? "rope" : "rod"; }
    int dim() const override { return active ? 1 : 0; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (= p1), "reaction" (force on b), "p1", "p2" (world anchors), "force",
    // "length" and "taut" (rope: active, rod: true).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    bool updateActive(const World& world, double dt) override;
    bool shouldRelease(const double* lambda) const override;
    void release() override { active = false; force = 0.0; }

private:
    bool pending_ = false;  // velocities still have to be projected (first step)
};

// spec: {"id", "type": "rope" | "rod", "a": anchor, "b": anchor, "params": {"length"?}}
// Rope: length defaults to the initial distance (taut); it must not be shorter than that.
// Rod: its length is the initial distance.
std::unique_ptr<Constraint> makeRope(const nlohmann::json& spec, const World& world);
std::unique_ptr<Constraint> makeRod(const nlohmann::json& spec, const World& world);

}  // namespace ms
