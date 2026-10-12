// load.hpp - external force and moment at a body point, constant or impulsive (v0.2).
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
    enum class Mode { Constant, Impulse };

    BodyIndex body = GROUND;
    Vec2 localPoint;      // on the body
    Vec2 force;           // N (constant) or N s (impulse), world frame, does not rotate with the body
    double moment = 0.0;  // N m (constant) or N m s (impulse), CCW positive
    Mode mode = Mode::Constant;

    const char* type() const override { return "load"; }
    void applyForces(World& world, double t) override;
    void addImpulse(const World& world, std::vector<double>& J) const override;
    double potentialEnergy(const World& world) const override;
    // Adds "p1" = "p2" (world application point), "force" (|F|), "vector" ([Fx, Fy]), "moment",
    // "mode" and "active" (constant loads always, impulses only at t = 0).
    void writeFrame(const World& world, nlohmann::json& out) const override;

    Vec2 worldPoint(const World& world) const;
};

// spec: {"id", "type": "load", "body": id, "point": [x, y],
//        "params": {"force": [Fx, Fy]?, "moment": M?, "mode": "constant" | "impulse"?}}
std::unique_ptr<Element> makeLoad(const nlohmann::json& spec, const World& world);

}  // namespace ms
