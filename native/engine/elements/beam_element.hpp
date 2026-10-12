// beam_element.hpp - the finite elements of a bendable beam (v0.4).
//
// A beam is a chain of node bodies (x, y, phi); every pair of neighbours is joined by a corotational
// Euler-Bernoulli beam element. The element is hidden: frames report it through the beam.
#pragma once

#include <vector>

#include "../core/element.hpp"
#include "../core/section.hpp"
#include "../core/types.hpp"

namespace ms {

class BeamElement : public Element {
public:
    struct Segment {
        int i = 0, j = 0;     // body indices of the two nodes
        double L0 = 0;        // undeformed length, m
        Vec2 u0;              // undeformed chord direction
        double phi0_i = 0;    // undeformed section rotations
        double phi0_j = 0;
    };

    std::vector<Segment> segments;
    Section section;
    double EA = 0;  // N
    double EI = 0;  // N m^2

    const char* type() const override { return "beam_fe"; }
    bool hidden() const override { return true; }
    void applyForces(World& world, double t) override;
    double potentialEnergy(const World& world) const override;
    // Beam data merged into the frame entry of the beam body: "nodes" ([x, y, phi] per node),
    // "moments" (bending moment at every node, sagging positive), "axial" (normal force per
    // segment, tension positive), "stress" (largest normal stress, Pa), "A", "I", "EA", "EI".
    void writeFrame(const World& world, nlohmann::json& out) const override;

    // Deformation of one segment relative to its chord: axial elongation and end rotations.
    struct Strain {
        double elongation;
        double theta_i, theta_j;
        Vec2 u;       // current chord direction
        double L;     // current length
    };
    Strain strain(const World& world, const Segment& s) const;
};

}  // namespace ms
