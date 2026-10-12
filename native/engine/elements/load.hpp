// load.hpp - external force and moment at a body point: constant, impulsive (v0.2) or harmonic (v0.4).
#pragma once

#include <memory>
#include <vector>

#include <nlohmann/json.hpp>

#include "../core/element.hpp"
#include "../core/types.hpp"
#include "impulse_source.hpp"

namespace ms {

class Load : public Element, public ImpulseSource {
public:
    enum class Mode { Constant, Impulse, Harmonic };

    BodyIndex body = GROUND;
    Vec2 localPoint;      // on the body
    Vec2 force;           // N (constant) or N s (impulse), world frame, does not rotate with the body
    double moment = 0.0;  // N m (constant) or N m s (impulse), CCW positive
    Mode mode = Mode::Constant;
    double frequency = 0.0;  // Hz, harmonic loads: force(t) = force * sin(2 pi f t + phase)
    double phase = 0.0;      // rad

    // Factor applied to force and moment at time t: 1 (constant), sin(2 pi f t + phase) (harmonic).
    double factor(double t) const;

    const char* type() const override { return "load"; }
    void applyForces(World& world, double t) override;
    void addImpulse(const World& world, std::vector<double>& J) const override;
    double potentialEnergy(const World& world) const override;
    // Adds "p1" = "p2" (world application point), "force" (|F|), "vector" ([Fx, Fy]), "moment",
    // "mode" and "active" (constant and harmonic loads always, impulses only at t = 0). For a harmonic
    // load "vector" and "moment" are the instantaneous values, "force" the amplitude.
    void writeFrame(const World& world, nlohmann::json& out) const override;

    Vec2 worldPoint(const World& world) const;
};

// spec: {"id", "type": "load", "body": id, "point": [x, y],
//        "params": {"force": [Fx, Fy]?, "moment": M?, "mode": "constant" | "impulse" | "harmonic"?,
//                   "frequency": Hz (harmonic, > 0), "phase": rad?}}
std::unique_ptr<Element> makeLoad(const nlohmann::json& spec, const World& world);

}  // namespace ms
