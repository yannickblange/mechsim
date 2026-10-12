// node.cpp - Knoten (point mass).
#include "node.hpp"

#include <stdexcept>

namespace ms {

void initNode(Body& body, const nlohmann::json& params) {
    if (!params.is_object() || !params.contains("mass") || !params["mass"].is_number() ||
        !(params["mass"].get<double>() > 0.0)) {
        throw std::runtime_error("node: 'mass' must be a number > 0");
    }
    body.type = "node";
    body.mass = params["mass"].get<double>();
    body.inertia = 0.5 * body.mass * kNodeRadius * kNodeRadius;
}

}  // namespace ms
