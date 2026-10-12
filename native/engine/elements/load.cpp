// load.cpp - external force + moment ("Kraft und Moment") at a body point.
#include "load.hpp"

#include <cmath>
#include <stdexcept>
#include <string>

#include "../core/world.hpp"

namespace ms {

Vec2 Load::worldPoint(const World& world) const { return world.bodies[body].toWorld(localPoint); }

double Load::factor(double t) const {
    return mode == Mode::Harmonic ? std::sin(2.0 * 3.14159265358979323846 * frequency * t + phase) : 1.0;
}

// A force F at local point p adds F to the force and cross(R p, F) to the torque
// (Body::applyForceAt); the moment is a pure couple, so it adds the same torque at any point.
// A harmonic load is the same with F sin(2 pi f t + phase): the excitation of a forced vibration.
void Load::applyForces(World& world, double t) {
    if (mode == Mode::Impulse) return;
    const double s = factor(t);
    Body& b = world.bodies[body];
    b.applyForceAt(s * force, localPoint);
    b.torque += s * moment;
}

// Impulse J = integral of F dt: velocity jump J / m, angular jump (cross(r, J) + L) / I.
void Load::addImpulse(const World& world, std::vector<double>& J) const {
    if (mode != Mode::Impulse) return;
    const Vec2 r = world.bodies[body].rotated(localPoint);
    J[3 * body + 0] += force.x;
    J[3 * body + 1] += force.y;
    J[3 * body + 2] += cross(r, force) + moment;
}

// A constant world-frame force and couple are conservative: V = -F . p - M phi
// (the generalised forces -dV/dq are F, cross(r, F) and M). A harmonic load depends on time: it
// does work on the system and has no potential.
double Load::potentialEnergy(const World& world) const {
    if (mode != Mode::Constant) return 0.0;
    const Body& b = world.bodies[body];
    return -dot(force, b.toWorld(localPoint)) - moment * b.phi;
}

void Load::writeFrame(const World& world, nlohmann::json& out) const {
    const Vec2 p = worldPoint(world);
    out["p1"] = {p.x, p.y};
    out["p2"] = {p.x, p.y};
    const double s = factor(world.time);
    out["force"] = length(force);
    out["vector"] = {s * force.x, s * force.y};
    out["moment"] = s * moment;
    out["mode"] = mode == Mode::Constant ? "constant" : mode == Mode::Impulse ? "impulse" : "harmonic";
    out["active"] = mode != Mode::Impulse || world.time <= 0.0;
}

std::unique_ptr<Element> makeLoad(const nlohmann::json& spec, const World& world) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        auto l = std::make_unique<Load>();
        l->id = id;

        const std::string bodyId = spec.at("body").get<std::string>();
        l->body = world.findBody(bodyId);
        if (l->body == GROUND) {
            throw std::runtime_error("load '" + id + "': unknown body '" + bodyId + "'");
        }
        const nlohmann::json& p = spec.at("point");
        if (!p.is_array() || p.size() != 2 || !p[0].is_number() || !p[1].is_number()) {
            throw std::runtime_error("load '" + id + "': 'point' must be [x, y]");
        }
        l->localPoint = {p[0].get<double>(), p[1].get<double>()};

        const nlohmann::json params = spec.contains("params") && spec["params"].is_object()
                                          ? spec["params"]
                                          : nlohmann::json::object();
        if (params.contains("force")) {
            const nlohmann::json& f = params["force"];
            if (!f.is_array() || f.size() != 2 || !f[0].is_number() || !f[1].is_number()) {
                throw std::runtime_error("load '" + id + "': 'force' must be [Fx, Fy]");
            }
            l->force = {f[0].get<double>(), f[1].get<double>()};
        }
        if (params.contains("moment")) {
            if (!params["moment"].is_number()) {
                throw std::runtime_error("load '" + id + "': 'moment' must be a number");
            }
            l->moment = params["moment"].get<double>();
        }
        const std::string mode = params.value("mode", std::string("constant"));
        if (mode == "constant") {
            l->mode = Load::Mode::Constant;
        } else if (mode == "impulse") {
            l->mode = Load::Mode::Impulse;
        } else if (mode == "harmonic") {
            l->mode = Load::Mode::Harmonic;
            if (!params.contains("frequency") || !params["frequency"].is_number() ||
                !(params["frequency"].get<double>() > 0.0)) {
                throw std::runtime_error("load '" + id + "': a harmonic load needs a 'frequency' (Hz) > 0");
            }
            l->frequency = params["frequency"].get<double>();
            if (params.contains("phase")) {
                if (!params["phase"].is_number()) throw std::runtime_error("load '" + id + "': 'phase' must be a number");
                l->phase = params["phase"].get<double>();
            }
        } else {
            throw std::runtime_error("load '" + id + "': 'mode' must be \"constant\", \"impulse\" or \"harmonic\"");
        }
        return l;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("load '" + id + "': " + e.what());
    }
}

}  // namespace ms
