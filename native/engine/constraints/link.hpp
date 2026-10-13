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
//
// A rod whose end sits on a block or a disc, or on a node that has an Einspannung (v0.7c), is clamped there (v0.7b, an Einspannung: the Stab keeps its angle to the
// mass; `params.hinged_a` / `hinged_b` = true keep the end pinned). The rod is then a rigid arm of that mass, and its
// other end sticks to the arm's tip: the two equations of a pin joint between that end and the point of the mass the
// tip started at (rod clamped at both ends: a weld, 3 equations). Its force is the part of the joint force along the rod.
class Link : public Constraint, public Unilateral {
public:
    enum class Kind { Rope, Rod };

    Kind kind = Kind::Rod;
    Anchor a;
    Anchor b;
    double length = 0.0;   // m
    bool active = true;    // rods are always active
    double force = 0.0;    // axial force of the last solve, tension positive
    bool clampA = false;   // rod: the end a / b is clamped to its mass (set by makeRod)
    bool clampB = false;

    const char* type() const override { return kind == Kind::Rope ? "rope" : "rod"; }
    int dim() const override { return !active ? 0 : weld_ ? 3 : arm_ ? 2 : 1; }
    void initialize(const World& world) override;
    void fill(const World& world, double* G, int cols, double* gamma) const override;
    void setMultipliers(const double* lambda) override;
    // Adds "position" (= p1), "reaction" (force on b), "p1", "p2" (world anchors), "force",
    // "length" and "taut" (rope: active, rod: true).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    bool updateActive(const World& world, double dt) override;
    bool shouldRelease(const double* lambda) const override;
    void release() override { active = false; force = 0.0; }

    // clamped rod (set by makeRod): the arm body M (a clamped end), the point it carries (`lever`, in the frame of M, where the far
    // end was at the start) and the far anchor; a weld additionally keeps the angle of the far body to M.
    bool arm_ = false, weld_ = false;
    bool armIsA_ = true;
    Anchor far_;
    Vec2 lever_;
    double relAngle0_ = 0.0;
    double moment_ = 0.0;
    Vec2 armForce_;  // joint force on M
    BodyIndex armBody() const { return armIsA_ ? a.body : b.body; }

private:
    bool pending_ = false;  // velocities still have to be projected (first step)
    void fillArm(const World& world, double* G, int cols, double* gamma) const;
};

// spec: {"id", "type": "rope" | "rod", "a": anchor, "b": anchor, "params": {"length"?}}
// Rope: length defaults to the initial distance (taut); it must not be shorter than that.
// Rod: its length is the initial distance.
std::unique_ptr<Constraint> makeRope(const nlohmann::json& spec, const World& world);
std::unique_ptr<Constraint> makeRod(const nlohmann::json& spec, const World& world);

}  // namespace ms
