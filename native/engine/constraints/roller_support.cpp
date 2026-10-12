// roller_support.cpp - "Loslager": frictionless sliding along a surface line.
#include "roller_support.hpp"

#include <cmath>

#include "../core/world.hpp"
#include "support_spec.hpp"

namespace ms {

Vec2 RollerSupport::normal() const { return {-std::sin(angle), std::cos(angle)}; }

void RollerSupport::initialize(const World& world) {
    groundPoint = world.bodies[body].toWorld(localPoint);
    reaction = {0.0, 0.0};
}

// docs/formulation.md, Loslager, with n the surface normal:
//   C = n . (x + r - p0),  Cdot = n . (v + omega perp(r)),  Cddot = n . (a + alpha perp(r) - omega^2 r)
//   =>  G = [n_x, n_y, n . perp(r)],  gamma_0 = omega^2 n . r.
void RollerSupport::fill(const World& world, double* G, int cols, double* gamma) const {
    const Body& B = world.bodies[body];
    const Vec2 r = B.rotated(localPoint);
    const Vec2 n = normal();
    const int c = 3 * body;

    G[c + 0] = n.x;
    G[c + 1] = n.y;
    G[c + 2] = dot(n, perp(r));
    (void)cols;  // single row

    const double C = dot(n, B.pos + r - groundPoint);
    const double Cdot = dot(n, B.vel + B.omega * perp(r));
    const double alpha = world.solver.baumgarte_alpha;
    const double beta = world.solver.baumgarte_beta;
    gamma[0] = B.omega * B.omega * dot(n, r) - 2.0 * alpha * Cdot - beta * beta * C;
}

// G^T lambda is the force on the body, so the reaction is lambda * n (no friction).
void RollerSupport::setMultipliers(const double* lambda) { reaction = lambda[0] * normal(); }

void RollerSupport::writeFrame(const World& /*world*/, nlohmann::json& out) const {
    out["position"] = {groundPoint.x, groundPoint.y};
    out["reaction"] = {reaction.x, reaction.y};
}

std::unique_ptr<Constraint> makeRollerSupport(const nlohmann::json& spec, const World& world) {
    const SupportSpec s = parseSupportSpec("roller_support", spec, world);
    auto c = std::make_unique<RollerSupport>();
    c->id = s.id;
    c->body = s.body;
    c->localPoint = s.localPoint;
    c->angle = s.angle;
    return c;
}

}  // namespace ms
