// pin_support.cpp - "Festlager": pins a body point to a fixed world point.
#include "pin_support.hpp"

#include <stdexcept>
#include <string>

#include "../core/world.hpp"
#include "ground_pin.hpp"

namespace ms {

void PinSupport::initialize(const World& world) {
    groundPoint = world.bodies[body].toWorld(localPoint);
    reaction = {0.0, 0.0};
}

// docs/formulation.md, Festlager: C = x + r - p0, Cdot = v + omega perp(r),
// Cddot = a + alpha perp(r) - omega^2 r  =>  G a = omega^2 r (plus Baumgarte terms).
void PinSupport::fill(const World& world, double* G, int cols, double* gamma) const {
    const Body& B = world.bodies[body];
    const Vec2 r = B.rotated(localPoint);
    const int c = 3 * body;

    G[0 * cols + c + 0] = 1.0;
    G[0 * cols + c + 2] = -r.y;
    G[1 * cols + c + 1] = 1.0;
    G[1 * cols + c + 2] = r.x;

    const Vec2 C = B.pos + r - groundPoint;
    const Vec2 Cdot = B.vel + B.omega * perp(r);
    const double alpha = world.solver.baumgarte_alpha;
    const double beta = world.solver.baumgarte_beta;
    const Vec2 g = B.omega * B.omega * r - 2.0 * alpha * Cdot - beta * beta * C;
    gamma[0] = g.x;
    gamma[1] = g.y;
}

// lambda is the force the support exerts on the body (docs/formulation.md).
void PinSupport::setMultipliers(const double* lambda) { reaction = {lambda[0], lambda[1]}; }

void PinSupport::writeFrame(const World& /*world*/, nlohmann::json& out) const {
    out["position"] = {groundPoint.x, groundPoint.y};
    out["reaction"] = {reaction.x, reaction.y};
}

std::unique_ptr<Constraint> makePinSupport(const nlohmann::json& spec, const World& world) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        if (spec.at("body").is_null()) return makeGroundPin(spec, world);  // v0.3: free-space Festlager
        const std::string bodyId = spec.at("body").get<std::string>();
        auto c = std::make_unique<PinSupport>();
        c->id = id;
        c->body = world.findBody(bodyId);
        if (c->body == GROUND) {
            throw std::runtime_error("pin_support '" + id + "': unknown body '" + bodyId + "'");
        }
        const nlohmann::json& p = spec.at("point");
        if (!p.is_array() || p.size() != 2) {
            throw std::runtime_error("pin_support '" + id + "': 'point' must be [x, y]");
        }
        c->localPoint = {p[0].get<double>(), p[1].get<double>()};
        return c;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("pin_support '" + id + "': " + e.what());
    }
}

}  // namespace ms
