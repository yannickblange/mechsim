// support_spec.cpp - shared parsing for fixed_support and roller_support.
#include "support_spec.hpp"

#include <stdexcept>

#include "../core/world.hpp"

namespace ms {

SupportSpec parseSupportSpec(const char* type, const nlohmann::json& spec, const World& world) {
    SupportSpec out;
    out.id = "?";
    const std::string prefix = std::string(type) + " '";
    try {
        out.id = spec.at("id").get<std::string>();
        const std::string bodyId = spec.at("body").get<std::string>();
        out.body = world.findBody(bodyId);
        if (out.body == GROUND) {
            throw std::runtime_error(prefix + out.id + "': unknown body '" + bodyId + "'");
        }
        const nlohmann::json& p = spec.at("point");
        if (!p.is_array() || p.size() != 2 || !p[0].is_number() || !p[1].is_number()) {
            throw std::runtime_error(prefix + out.id + "': 'point' must be [x, y]");
        }
        out.localPoint = {p[0].get<double>(), p[1].get<double>()};
        if (spec.contains("params") && spec["params"].contains("angle")) {
            const nlohmann::json& a = spec["params"]["angle"];
            if (!a.is_number()) {
                throw std::runtime_error(prefix + out.id + "': 'angle' must be a number (rad)");
            }
            out.angle = a.get<double>();
        }
        return out;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error(prefix + out.id + "': " + e.what());
    }
}

}  // namespace ms
