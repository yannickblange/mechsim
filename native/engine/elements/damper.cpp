// damper.cpp - viscous damper.
#include "damper.hpp"

#include <stdexcept>
#include <string>

#include "../constraints/anchor_spec.hpp"
#include "../core/world.hpp"

namespace ms {

// F = c u . (v_b - v_a). The velocities are those at the start of the step (explicit damping), so
// the scheme is stable while c dt / m_effective < 2; at dt = 1 ms that is c / m < 2000 1/s.
double Damper::axialForce(const World& world) const {
    const Vec2 d = world.anchorWorld(b) - world.anchorWorld(a);
    const double L = length(d);
    if (L < 1e-12) return 0.0;  // no defined direction
    const Vec2 u = d / L;
    return c * dot(u, world.anchorVelocity(b) - world.anchorVelocity(a));
}

void Damper::applyForces(World& world, double /*t*/) {
    const Vec2 d = world.anchorWorld(b) - world.anchorWorld(a);
    const double L = length(d);
    if (L < 1e-12) return;
    const Vec2 u = d / L;
    const double F = axialForce(world);
    if (a.body != GROUND) world.bodies[a.body].applyForceAt(F * u, a.point);
    if (b.body != GROUND) world.bodies[b.body].applyForceAt(-F * u, b.point);
}

void Damper::writeFrame(const World& world, nlohmann::json& out) const {
    const Vec2 pa = world.anchorWorld(a);
    const Vec2 pb = world.anchorWorld(b);
    out["p1"] = {pa.x, pa.y};
    out["p2"] = {pb.x, pb.y};
    out["force"] = axialForce(world);
}

std::unique_ptr<Element> makeDamper(const nlohmann::json& spec, const World& world) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        const std::string what = "damper '" + id + "'";
        auto d = std::make_unique<Damper>();
        d->id = id;
        d->a = parseAnchorSpec(what, spec.at("a"), world, true);
        d->b = parseAnchorSpec(what, spec.at("b"), world, true);
        if (d->a.body == GROUND && d->b.body == GROUND) {
            throw std::runtime_error(what + ": at least one end must be on a mass");
        }
        if (d->a.body == d->b.body) {
            throw std::runtime_error(what + ": both ends are on the same mass");
        }
        const nlohmann::json& c = spec.at("params").at("c");
        if (!c.is_number() || c.get<double>() < 0.0) {
            throw std::runtime_error(what + ": 'c' must be a number >= 0");
        }
        d->c = c.get<double>();
        return d;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("damper '" + id + "': " + e.what());
    }
}

}  // namespace ms
