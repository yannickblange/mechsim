// disc.cpp - circular mass ("Masse / Scheibe").
#include "disc.hpp"

#include <stdexcept>
#include <string>

namespace ms {

namespace {

// Reads params[field], which must be a number > 0.
double positiveNumber(const nlohmann::json& params, const char* field) {
    if (!params.is_object() || !params.contains(field) || !params[field].is_number() ||
        !(params[field].get<double>() > 0.0)) {
        throw std::runtime_error(std::string("disc: '") + field + "' must be a number > 0");
    }
    return params[field].get<double>();
}

}  // namespace

void initDisc(Body& body, const nlohmann::json& params) {
    const double m = positiveNumber(params, "mass");
    const double r = positiveNumber(params, "radius");
    body.type = "disc";
    body.mass = m;
    body.inertia = discInertia(m, r);
    body.shape = Body::Shape::Disc;
    body.radius = r;
}

// J = m r^2 / 2 for a solid disc about its centre.
double discInertia(double mass, double radius) { return 0.5 * mass * radius * radius; }

}  // namespace ms
