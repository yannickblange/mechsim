// spring.cpp - linear translational spring ("Feder").
#include "spring.hpp"

#include <stdexcept>
#include <string>

#include "../core/world.hpp"

namespace ms {

double Spring::currentLength(const World& world) const {
    return length(world.anchorWorld(b) - world.anchorWorld(a));
}

// F = k (L - L0), tension positive (docs/formulation.md).
double Spring::axialForce(const World& world) const {
    return k * (currentLength(world) - restLength);
}

// d = pb - pa, u = d / L. Tension pulls a towards b (+F u) and b towards a (-F u).
void Spring::applyForces(World& world, double /*t*/) {
    const Vec2 d = world.anchorWorld(b) - world.anchorWorld(a);
    const double L = length(d);
    if (L < 1e-12) return;  // no defined direction
    const Vec2 u = d / L;
    const double F = k * (L - restLength);
    if (a.body != GROUND) world.bodies[a.body].applyForceAt(F * u, a.point);
    if (b.body != GROUND) world.bodies[b.body].applyForceAt(-F * u, b.point);
}

double Spring::potentialEnergy(const World& world) const {
    const double s = currentLength(world) - restLength;
    return 0.5 * k * s * s;
}

void Spring::writeFrame(const World& world, nlohmann::json& out) const {
    const Vec2 pa = world.anchorWorld(a);
    const Vec2 pb = world.anchorWorld(b);
    out["p1"] = {pa.x, pa.y};
    out["p2"] = {pb.x, pb.y};
    out["force"] = axialForce(world);
}

namespace {

Anchor parseAnchor(const nlohmann::json& j, const World& world, const std::string& id) {
    Anchor a;
    const nlohmann::json& body = j.at("body");
    if (!body.is_null()) {
        const std::string bodyId = body.get<std::string>();
        a.body = world.findBody(bodyId);
        if (a.body == GROUND) {
            throw std::runtime_error("spring '" + id + "': unknown body '" + bodyId + "'");
        }
    }
    const nlohmann::json& p = j.at("point");
    if (!p.is_array() || p.size() != 2) {
        throw std::runtime_error("spring '" + id + "': 'point' must be [x, y]");
    }
    a.point = {p[0].get<double>(), p[1].get<double>()};
    return a;
}

}  // namespace

std::unique_ptr<Element> makeSpring(const nlohmann::json& spec, const World& world) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        auto s = std::make_unique<Spring>();
        s->id = id;
        s->a = parseAnchor(spec.at("a"), world, id);
        s->b = parseAnchor(spec.at("b"), world, id);

        const nlohmann::json& params = spec.at("params");
        const nlohmann::json& k = params.at("k");
        if (!k.is_number() || k.get<double>() < 0.0) {
            throw std::runtime_error("spring '" + id + "': 'k' must be a number >= 0");
        }
        s->k = k.get<double>();

        if (params.contains("rest_length")) {
            const nlohmann::json& l0 = params["rest_length"];
            if (!l0.is_number() || l0.get<double>() < 0.0) {
                throw std::runtime_error("spring '" + id + "': 'rest_length' must be a number >= 0");
            }
            s->restLength = l0.get<double>();
        } else {
            s->restLength = s->currentLength(world);
        }
        return s;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("spring '" + id + "': " + e.what());
    }
}

}  // namespace ms
