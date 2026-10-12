// node.cpp - Knoten (point mass).
#include "node.hpp"

#include <stdexcept>

namespace ms {

void initNode(Body& body, const nlohmann::json& params) {
    if (!params.is_object() || !params.contains("mass") || !params["mass"].is_number() ||
        !(params["mass"].get<double>() > 0.0)) {
        throw std::runtime_error("node: 'mass' must be a number > 0");
    }
    if (params.contains("damping")) {
        if (!params["damping"].is_number() || params["damping"].get<double>() < 0.0) {
            throw std::runtime_error("node: 'damping' must be a number >= 0");
        }
        body.damping = params["damping"].get<double>();
    }
    body.type = "node";
    body.mass = params["mass"].get<double>();
    body.inertia = 0.5 * body.mass * kNodeRadius * kNodeRadius;
}

}  // namespace ms
