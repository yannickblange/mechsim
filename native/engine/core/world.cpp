// world.cpp - container for bodies, elements and constraints.
#include "world.hpp"

#include <stdexcept>

#include "../solver/integrators.hpp"

namespace ms {

BodyIndex World::findBody(const std::string& id) const {
    for (std::size_t i = 0; i < bodies.size(); ++i) {
        if (bodies[i].id == id) return static_cast<BodyIndex>(i);
    }
    return GROUND;
}

// contracts/units.md: a ground anchor's point is in world coordinates.
Vec2 World::anchorWorld(const Anchor& a) const {
    return a.body == GROUND ? a.point : bodies[a.body].toWorld(a.point);
}

Vec2 World::anchorVelocity(const Anchor& a) const {
    return a.body == GROUND ? Vec2{0.0, 0.0} : bodies[a.body].velocityAt(a.point);
}

int World::constraintRows() const {
    int rows = 0;
    for (const auto& c : constraints) rows += c->dim();
    return rows;
}

void World::initialize() {
    for (auto& b : bodies) b.saveInitialState();
    for (auto& c : constraints) c->initialize(*this);
}

void World::step(double dt) {
    if (solver.integrator == "semi_implicit_euler") {
        stepSemiImplicitEuler(*this, dt);  // advances `time`
        return;
    }
    throw std::runtime_error("unknown integrator '" + solver.integrator + "'");
}

void World::reset() {
    for (auto& b : bodies) b.restoreInitialState();
    time = 0.0;
    for (auto& c : constraints) c->initialize(*this);
}

double World::kineticEnergy() const {
    double t = 0.0;
    for (const auto& b : bodies) t += b.kineticEnergy();
    return t;
}

// Gravity potential V = -m g . pos (contracts/units.md) plus the elements' stored energy.
double World::potentialEnergy() const {
    double v = 0.0;
    for (const auto& b : bodies) v += -b.mass * dot(gravity, b.pos);
    for (const auto& e : elements) v += e->potentialEnergy(*this);
    return v;
}

nlohmann::json World::frame() const {
    using nlohmann::json;
    json bodiesJson = json::array();
    for (const auto& b : bodies) {
        bodiesJson.push_back({{"id", b.id},
                              {"x", b.pos.x},
                              {"y", b.pos.y},
                              {"phi", b.phi},
                              {"vx", b.vel.x},
                              {"vy", b.vel.y},
                              {"omega", b.omega}});
    }
    json elementsJson = json::array();
    for (const auto& e : elements) {
        json o = {{"id", e->id}, {"type", e->type()}};
        e->writeFrame(*this, o);
        elementsJson.push_back(std::move(o));
    }
    json constraintsJson = json::array();
    for (const auto& c : constraints) {
        json o = {{"id", c->id}, {"type", c->type()}};
        c->writeFrame(*this, o);
        constraintsJson.push_back(std::move(o));
    }
    return {{"t", time},
            {"bodies", std::move(bodiesJson)},
            {"elements", std::move(elementsJson)},
            {"constraints", std::move(constraintsJson)},
            {"energy", {{"kinetic", kineticEnergy()}, {"potential", potentialEnergy()}}}};
}

}  // namespace ms
