// ground_pin.cpp - Festlager in free space.
#include "ground_pin.hpp"

#include <stdexcept>
#include <string>

namespace ms {

void GroundPin::writeFrame(const World& /*world*/, nlohmann::json& out) const {
    out["position"] = {point.x, point.y};
    out["reaction"] = {0.0, 0.0};
}

std::unique_ptr<Constraint> makeGroundPin(const nlohmann::json& spec, const World& /*world*/) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        const nlohmann::json& p = spec.at("point");
        if (!p.is_array() || p.size() != 2 || !p[0].is_number() || !p[1].is_number()) {
            throw std::runtime_error("pin_support '" + id + "': 'point' must be [x, y]");
        }
        auto c = std::make_unique<GroundPin>();
        c->id = id;
        c->point = {p[0].get<double>(), p[1].get<double>()};
        return c;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("pin_support '" + id + "': " + e.what());
    }
}

}  // namespace ms
