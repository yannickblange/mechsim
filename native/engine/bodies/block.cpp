// block.cpp - rectangular mass ("Masse / Block").
#include "block.hpp"

#include <stdexcept>
#include <string>

namespace ms {

namespace {

// Reads params[field], which must be a number > 0.
double positiveNumber(const nlohmann::json& params, const char* field) {
    if (!params.is_object() || !params.contains(field) || !params[field].is_number() ||
        !(params[field].get<double>() > 0.0)) {
        throw std::runtime_error(std::string("block: '") + field + "' must be a number > 0");
    }
    return params[field].get<double>();
}

}  // namespace

void initBlock(Body& body, const nlohmann::json& params) {
    const double m = positiveNumber(params, "mass");
    const double w = positiveNumber(params, "width");
    const double h = positiveNumber(params, "height");
    body.type = "block";
    body.mass = m;
    body.inertia = blockInertia(m, w, h);
}

// J = m (w^2 + h^2) / 12 for a solid rectangle about its centre (docs/formulation.md).
double blockInertia(double mass, double width, double height) {
    return mass * (width * width + height * height) / 12.0;
}

}  // namespace ms
