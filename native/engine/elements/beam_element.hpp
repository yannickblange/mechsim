// beam_element.hpp - finite elements of a bendable beam and of an elastic Stab (v0.4, v0.4b).
//
// A chain of corotational Euler-Bernoulli elements. The nodes of a chain are bodies (x, y, phi), or -
// at the two ends of an elastic Stab - anchors (a point of a body or of the ground) that are hinged: the
// end rotation is not a variable of the system but is condensed out (the end carries no moment).
#pragma once

#include <vector>

#include "../core/element.hpp"
#include "../core/section.hpp"
#include "../core/types.hpp"

namespace ms {

class BeamElement : public Element {
public:
    enum class Kind { Beam, Bar };

    // One end of a segment: a node body (local = [0, 0]) or an anchor. A hinge has no rotation of its own.
    struct End {
        BodyIndex body = GROUND;
        Vec2 local;  // body-local point (world point for the ground)
        bool hinge = false;
    };

    struct Segment {
        End a, b;
        double L0 = 0;      // undeformed length, m
        Vec2 u0;            // undeformed chord direction
        double phi0_a = 0;  // undeformed section rotations (node ends)
        double phi0_b = 0;
    };

    Kind kind = Kind::Beam;
    std::vector<Segment> segments;
    Section section;
    double EA = 0;                 // N
    double EI = 0;                 // N m^2
    double endWeight = 0;          // kg, bar: half of the mass of the end segments hangs on the anchors
    double installedLength = 0;    // m, bar: distance between the anchors as installed (for the Euler load)

    const char* type() const override { return kind == Kind::Bar ? "bar" : "beam_fe"; }
    bool hidden() const override { return kind == Kind::Beam; }
    void applyForces(World& world, double t) override;
    double potentialEnergy(const World& world) const override;
    // Beam: merged into the frame entry of the beam body: "nodes" ([x, y, phi] per node), "moments" (bending
    // moment at every node, sagging positive), "axial" (normal force per segment), "stress" (largest normal
    // stress, Pa), "A", "I", "EA", "EI". Bar: "p1", "p2", "force" (the normal force of the segment that carries the most, tension positive),
    // "stress", "nodes", "pcr" (Euler load pi^2 E I / L^2 of the pinned bar).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    // State of one segment: elongation (with the bowing of the curve), chord, end rotations against the
    // chord (a hinge's is solved), and the normal force and end moments of the elastic part.
    struct Strain {
        double elongation = 0;  // e_ax = (L - L0) + bow
        double theta_a = 0, theta_b = 0;
        Vec2 u;
        double L = 0;
        double N = 0, Ma = 0, Mb = 0;
    };
    Strain strain(const World& world, const Segment& s) const;

    Vec2 endPoint(const World& world, const End& e) const;
};

}  // namespace ms
