// block.hpp - rectangular mass ("Masse / Block"). Interface frozen for v0.1.
#pragma once

#include <nlohmann/json.hpp>

#include "../core/body.hpp"

namespace ms {

// params: {"mass": m, "width": w, "height": h}
// Sets body.type = "block", body.mass = m, body.inertia = m * (w^2 + h^2) / 12.
// Throws std::runtime_error if a field is missing or not > 0.
void initBlock(Body& body, const nlohmann::json& params);

// Inertia of a solid rectangle about its centre: m (w^2 + h^2) / 12.
double blockInertia(double mass, double width, double height);

}  // namespace ms
