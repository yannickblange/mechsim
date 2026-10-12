// link.cpp - rope and rod.
#include "link.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

#include "../core/world.hpp"
#include "anchor_spec.hpp"

namespace ms {

namespace {

constexpr double kTol = 1e-9;

struct Geometry {
    Vec2 pa, pb, u;  // anchor positions, unit vector a -> b
    double dist;
    Vec2 vrel;       // velocity of anchor b relative to anchor a
};

Geometry geometry(const World& w, const Anchor& a, const Anchor& b) {
    Geometry g;
    g.pa = w.anchorWorld(a);
    g.pb = w.anchorWorld(b);
    const Vec2 d = g.pb - g.pa;
    g.dist = length(d);
    g.u = g.dist > 1e-12 ? d / g.dist : Vec2{1.0, 0.0};  // no defined direction when coincident
    g.vrel = w.anchorVelocity(b) - w.anchorVelocity(a);
    return g;
}

}  // namespace

void Link::initialize(const World& world) {
    force = 0.0;
    const Geometry g = geometry(world, a, b);
    active = kind == Kind::Rod || g.dist >= length - kTol;
    pending_ = active;  // project the initial velocities once
}

// docs/formulation.md, Stab / Seil. With u = (pb - pa)/|pb - pa| and the anchor points' velocity
// vr = vb - va:  C = L - |d|,  Cdot = -u . vr,
//   Cddot = -u . (a_b - a_a) - (|vr|^2 - (u . vr)^2) / |d|,   a_p = a_i + alpha perp(r) - omega^2 r.
// => G a = gamma_0 with the rows below, gamma = gamma_0 - 2 alpha Cdot - beta^2 C.
void Link::fill(const World& world, double* G, int cols, double* gamma) const {
    if (!active) return;
    (void)cols;  // single row
    const Geometry g = geometry(world, a, b);

    // Rows: body a gets +u, body b gets -u (so that G^T lambda pulls both ends together).
    double wa2r = 0.0, wb2r = 0.0;  // u . (omega^2 r) of the two ends
    if (a.body != GROUND) {
        const Body& B = world.bodies[a.body];
        const Vec2 r = B.rotated(a.point);
        G[3 * a.body + 0] += g.u.x;
        G[3 * a.body + 1] += g.u.y;
        G[3 * a.body + 2] += dot(g.u, perp(r));
        wa2r = B.omega * B.omega * dot(g.u, r);
    }
    if (b.body != GROUND) {
        const Body& B = world.bodies[b.body];
        const Vec2 r = B.rotated(b.point);
        G[3 * b.body + 0] -= g.u.x;
        G[3 * b.body + 1] -= g.u.y;
        G[3 * b.body + 2] -= dot(g.u, perp(r));
        wb2r = B.omega * B.omega * dot(g.u, r);
    }

    const double vu = dot(g.u, g.vrel);
    const double gamma0 = -(wb2r - wa2r) + (dot(g.vrel, g.vrel) - vu * vu) / std::max(g.dist, 1e-12);
    const double C = length - g.dist;
    const double Cdot = -vu;
    const double alpha = world.solver.baumgarte_alpha;
    const double beta = world.solver.baumgarte_beta;
    gamma[0] = gamma0 - 2.0 * alpha * Cdot - beta * beta * C;
}

void Link::setMultipliers(const double* lambda) { force = active ? lambda[0] : 0.0; }

void Link::writeFrame(const World& world, nlohmann::json& out) const {
    const Geometry g = geometry(world, a, b);
    out["position"] = {g.pa.x, g.pa.y};
    // Force on end b: towards a for tension.
    out["reaction"] = {-force * g.u.x, -force * g.u.y};
    out["p1"] = {g.pa.x, g.pa.y};
    out["p2"] = {g.pb.x, g.pb.y};
    out["force"] = force;
    out["length"] = length;
    out["taut"] = active;
}

bool Link::updateActive(const World& world, double dt) {
    const bool wasPending = pending_;
    pending_ = false;
    if (kind == Kind::Rod) return wasPending;

    const Geometry g = geometry(world, a, b);
    const double vu = dot(g.u, g.vrel);  // > 0: the ends move apart
    const bool wasActive = active;
    // Engage when the rope is taut, or will be within this step. If it stays slack the
    // active-set loop in the integrator releases it again (negative multiplier).
    if (!active && g.dist + std::max(0.0, vu) * dt >= length - kTol) active = true;
    // Only a rope that is being pulled apart needs its velocity corrected; an inward-moving one
    // is released again by the active-set loop (and a projection would push, not pull).
    const bool engaged = active && (!wasActive || wasPending) && vu > 0.0;
    return engaged;
}

bool Link::shouldRelease(const double* lambda) const {
    return kind == Kind::Rope && active && lambda[0] < -kTol;
}

namespace {

std::unique_ptr<Constraint> make(Link::Kind kind, const nlohmann::json& spec, const World& world) {
    const char* typeName = kind == Link::Kind::Rope ? "rope" : "rod";
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        const std::string what = std::string(typeName) + " '" + id + "'";
        auto l = std::make_unique<Link>();
        l->id = id;
        l->kind = kind;
        l->a = parseAnchorSpec(what, spec.at("a"), world, true);
        l->b = parseAnchorSpec(what, spec.at("b"), world, true);
        if (l->a.body == GROUND && l->b.body == GROUND) {
            throw std::runtime_error(what + ": at least one end must be on a mass");
        }
        if (l->a.body == l->b.body) {
            throw std::runtime_error(what + ": both ends are on the same mass");
        }

        const double d = length(world.anchorWorld(l->b) - world.anchorWorld(l->a));
        if (d < 1e-6) throw std::runtime_error(what + ": the ends coincide");
        l->length = d;
        if (kind == Link::Kind::Rope && spec.contains("params") && spec["params"].contains("length")) {
            const nlohmann::json& len = spec["params"]["length"];
            if (!len.is_number() || !(len.get<double>() > 0.0)) {
                throw std::runtime_error(what + ": 'length' must be a number > 0");
            }
            l->length = len.get<double>();
            if (d > l->length + 1e-6) {
                throw std::runtime_error(what + ": the ends are " + std::to_string(d) +
                                         " m apart but the rope is only " +
                                         std::to_string(l->length) + " m long");
            }
        }
        return l;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error(std::string(typeName) + " '" + id + "': " + e.what());
    }
}

}  // namespace

std::unique_ptr<Constraint> makeRope(const nlohmann::json& spec, const World& world) {
    return make(Link::Kind::Rope, spec, world);
}

std::unique_ptr<Constraint> makeRod(const nlohmann::json& spec, const World& world) {
    return make(Link::Kind::Rod, spec, world);
}

}  // namespace ms
