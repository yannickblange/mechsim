// fixed_support.cpp - "Einspannung": pins a body point to a world point and fixes the angle.
#include "fixed_support.hpp"

#include "../core/world.hpp"
#include "support_spec.hpp"

namespace ms {

void FixedSupport::initialize(const World& world) {
    const Body& B = world.bodies[body];
    groundPoint = B.toWorld(localPoint);
    phi0 = B.phi;
    reaction = {0.0, 0.0};
    moment = 0.0;
}

// docs/formulation.md, Einspannung. Rows 0-1 are the Festlager rows; row 2 fixes the angle:
//   C3 = phi - phi0, C3dot = omega, C3ddot = alpha  =>  G3 a = -2 alpha_b omega - beta^2 C3.
void FixedSupport::fill(const World& world, double* G, int cols, double* gamma) const {
    const Body& B = world.bodies[body];
    const Vec2 r = B.rotated(localPoint);
    const int c = 3 * body;

    G[0 * cols + c + 0] = 1.0;
    G[0 * cols + c + 2] = -r.y;
    G[1 * cols + c + 1] = 1.0;
    G[1 * cols + c + 2] = r.x;
    G[2 * cols + c + 2] = 1.0;

    const Vec2 C = B.pos + r - groundPoint;
    const Vec2 Cdot = B.vel + B.omega * perp(r);
    const double alpha = world.solver.baumgarte_alpha;
    const double beta = world.solver.baumgarte_beta;
    const Vec2 g = B.omega * B.omega * r - 2.0 * alpha * Cdot - beta * beta * C;
    gamma[0] = g.x;
    gamma[1] = g.y;
    gamma[2] = -2.0 * alpha * B.omega - beta * beta * (B.phi - phi0);
}

// lambda = [Fx, Fy, M]: the force and moment the support exerts on the body.
void FixedSupport::setMultipliers(const double* lambda) {
    reaction = {lambda[0], lambda[1]};
    moment = lambda[2];
}

void FixedSupport::writeFrame(const World& /*world*/, nlohmann::json& out) const {
    out["position"] = {groundPoint.x, groundPoint.y};
    out["reaction"] = {reaction.x, reaction.y, moment};
}

std::unique_ptr<Constraint> makeFixedSupport(const nlohmann::json& spec, const World& world) {
    const SupportSpec s = parseSupportSpec("fixed_support", spec, world);
    auto c = std::make_unique<FixedSupport>();
    c->id = s.id;
    c->body = s.body;
    c->localPoint = s.localPoint;
    return c;
}

}  // namespace ms
