// support_spec.hpp - shared parsing of the "body / point / params.angle" fields that the
// v0.2 supports (fixed_support, roller_support) have in common.
#pragma once

#include <string>

#include <nlohmann/json.hpp>

#include "../core/types.hpp"

namespace ms {

class World;

struct SupportSpec {
    std::string id;
    BodyIndex body = GROUND;
    Vec2 localPoint;     // on the body
    double angle = 0.0;  // params.angle: direction of the supporting surface, rad CCW from +x
};

// Parses {"id", "body", "point", "params": {"angle"?}}. `type` is only used in messages.
// Throws std::runtime_error naming the support id on any problem.
SupportSpec parseSupportSpec(const char* type, const nlohmann::json& spec, const World& world);

}  // namespace ms
