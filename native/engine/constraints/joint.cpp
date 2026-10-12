// joint.cpp - pin joint and fixed joint between two bodies.
#include "joint.hpp"

#include <stdexcept>
#include <string>

#include "../core/world.hpp"
#include "anchor_spec.hpp"

namespace ms {

void Joint::initialize(const World& world) {
    relAngle0 = world.bodies[a.body].phi - world.bodies[b.body].phi;
    reaction = {0.0, 0.0};
    moment = 0.0;
}

// docs/formulation.md, Gelenk. C = (x_a + r_a) - (x_b + r_b); with Cdot = v_a + w_a perp(r_a) - (...)
//   Cddot = (a_a + al_a perp(r_a) - w_a^2 r_a) - (a_b + al_b perp(r_b) - w_b^2 r_b)
// => rows [I, perp(r_a)] on a, [-I, -perp(r_b)] on b;  gamma_0 = w_a^2 r_a - w_b^2 r_b.
// Fixed joint: third row phi_a - phi_b - relAngle0: [0 0 1] on a, [0 0 -1] on b.
void Joint::fill(const World& world, double* G, int cols, double* gamma) const {
    const Body& A = world.bodies[a.body];
    const Body& B = world.bodies[b.body];
    const Vec2 ra = A.rotated(a.point);
    const Vec2 rb = B.rotated(b.point);
    const int ca = 3 * a.body;
    const int cb = 3 * b.body;

    G[0 * cols + ca + 0] += 1.0;
    G[0 * cols + ca + 2] += -ra.y;
    G[1 * cols + ca + 1] += 1.0;
    G[1 * cols + ca + 2] += ra.x;
    G[0 * cols + cb + 0] -= 1.0;
    G[0 * cols + cb + 2] -= -rb.y;
    G[1 * cols + cb + 1] -= 1.0;
    G[1 * cols + cb + 2] -= rb.x;

    const Vec2 C = (A.pos + ra) - (B.pos + rb);
    const Vec2 Cdot = (A.vel + A.omega * perp(ra)) - (B.vel + B.omega * perp(rb));
    const double alpha = world.solver.baumgarte_alpha;
    const double beta = world.solver.baumgarte_beta;
    const Vec2 g = A.omega * A.omega * ra - B.omega * B.omega * rb - 2.0 * alpha * Cdot - beta * beta * C;
    gamma[0] = g.x;
    gamma[1] = g.y;

    if (fixed) {
        G[2 * cols + ca + 2] += 1.0;
        G[2 * cols + cb + 2] -= 1.0;
        const double Cphi = A.phi - B.phi - relAngle0;
        gamma[2] = -2.0 * alpha * (A.omega - B.omega) - beta * beta * Cphi;
    }
}

void Joint::setMultipliers(const double* lambda) {
    reaction = {lambda[0], lambda[1]};
    moment = fixed ? lambda[2] : 0.0;
}

void Joint::writeFrame(const World& world, nlohmann::json& out) const {
    const Vec2 p = world.bodies[a.body].toWorld(a.point);
    out["position"] = {p.x, p.y};
    if (fixed) {
        out["reaction"] = {reaction.x, reaction.y, moment};
    } else {
        out["reaction"] = {reaction.x, reaction.y};
    }
}

namespace {

std::unique_ptr<Constraint> make(bool fixed, const nlohmann::json& spec, const World& world) {
    const char* typeName = fixed ? "fixed_joint" : "pin_joint";
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        const std::string what = std::string(typeName) + " '" + id + "'";
        auto j = std::make_unique<Joint>();
        j->id = id;
        j->fixed = fixed;
        j->a = parseAnchorSpec(what, spec.at("a"), world, false);
        j->b = parseAnchorSpec(what, spec.at("b"), world, false);
        if (j->a.body == j->b.body) {
            throw std::runtime_error(what + ": a joint needs two different masses");
        }
        return j;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error(std::string(typeName) + " '" + id + "': " + e.what());
    }
}

}  // namespace

std::unique_ptr<Constraint> makePinJoint(const nlohmann::json& spec, const World& world) {
    return make(false, spec, world);
}

std::unique_ptr<Constraint> makeFixedJoint(const nlohmann::json& spec, const World& world) {
    return make(true, spec, world);
}

}  // namespace ms
