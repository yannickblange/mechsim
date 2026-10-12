// disc.hpp - circular mass ("Masse / Scheibe"), v0.2.
#pragma once

#include <nlohmann/json.hpp>

#include "../core/body.hpp"

namespace ms {

// params: {"mass": m, "radius": r}
// Sets body.type = "disc", body.mass = m, body.inertia = m r^2 / 2.
// Throws std::runtime_error if a field is missing or not > 0.
void initDisc(Body& body, const nlohmann::json& params);

// Inertia of a solid disc about its centre: m r^2 / 2.
double discInertia(double mass, double radius);

}  // namespace ms
