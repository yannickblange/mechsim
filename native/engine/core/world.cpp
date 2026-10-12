// world.cpp - container for bodies, elements and constraints.
#include "world.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "../solver/impulse.hpp"
#include "../solver/integrators.hpp"
#include "../solver/stiffness.hpp"

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

int World::findBeam(const std::string& id) const {
    for (std::size_t i = 0; i < beams.size(); ++i) {
        if (beams[i].id == id) return static_cast<int>(i);
    }
    return -1;
}

int World::constraintRows() const {
    int rows = 0;
    for (const auto& c : constraints) rows += c->dim();
    return rows;
}

void World::initialize() {
    for (auto& b : bodies) b.saveInitialState();
    for (auto& c : constraints) c->initialize(*this);
    applyInitialImpulses(*this);  // v0.2: impulsive loads act at t = 0, on top of the saved state
    maxOmega_ = estimateMaxOmega(*this);
}

constexpr double kOmegaDtLimit = 0.5;  // omega * dt of a substep (the scheme is stable below 2)
constexpr int kMaxSubsteps = 2000;

int World::substepsFor(double dt) const {
    const double x = maxOmega_ * dt / kOmegaDtLimit;
    if (!(x > 1.0)) return 1;
    return std::min(kMaxSubsteps, static_cast<int>(std::ceil(x)));
}

void World::step(double dt) {
    if (solver.integrator == "semi_implicit_euler") {
        const int n = substepsFor(dt);
        for (int i = 0; i < n; ++i) stepSemiImplicitEuler(*this, dt / n);  // advances `time`
        return;
    }
    throw std::runtime_error("unknown integrator '" + solver.integrator + "'");
}

void World::reset() {
    for (auto& b : bodies) b.restoreInitialState();
    time = 0.0;
    for (auto& c : constraints) c->initialize(*this);
    applyInitialImpulses(*this);
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

std::vector<World::BodyState> World::sceneBodies() const {
    std::vector<BodyState> out;
    auto state = [](const std::string& id, const Body& b) {
        return BodyState{id, {b.pos.x, b.pos.y, b.phi, b.vel.x, b.vel.y, b.omega}};
    };
    for (std::size_t i = 0; i < bodies.size(); ++i) {
        const Body& b = bodies[i];
        if (b.beam < 0) {
            out.push_back(state(b.id, b));
        } else if (static_cast<int>(i) == beams[b.beam].nodes.front()) {
            out.push_back(state(beams[b.beam].id, bodies[beams[b.beam].centre]));  // a beam is its midpoint
        }
    }
    return out;
}

nlohmann::json World::frame() const {
    using nlohmann::json;
    json bodiesJson = json::array();
    for (const auto& b : sceneBodies()) {
        json o = {{"id", b.id}, {"x", b.q[0]}, {"y", b.q[1]}, {"phi", b.q[2]},
                  {"vx", b.q[3]}, {"vy", b.q[4]}, {"omega", b.q[5]}};
        const int beam = findBeam(b.id);
        if (beam >= 0) {
            json extra = json::object();
            beams[beam].fe->writeFrame(*this, extra);  // nodes, moments, stress ...
            o.update(extra);
        }
        bodiesJson.push_back(std::move(o));
    }
    json elementsJson = json::array();
    for (const auto& e : elements) {
        if (e->hidden()) continue;
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
