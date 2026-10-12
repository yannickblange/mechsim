// anchor_spec.cpp - shared anchor parsing for link and joint constraints.
#include "anchor_spec.hpp"

#include <stdexcept>

#include "../core/world.hpp"

namespace ms {

Anchor parseAnchorSpec(const std::string& what, const nlohmann::json& j, const World& world,
                       bool allowGround) {
    if (!j.is_object() || !j.contains("body") || !j.contains("point")) {
        throw std::runtime_error(what + ": anchor must be {\"body\", \"point\"}");
    }
    Anchor a;
    const nlohmann::json& body = j["body"];
    if (body.is_null()) {
        if (!allowGround) throw std::runtime_error(what + ": both ends must be on masses");
    } else if (body.is_string()) {
        a.body = world.findBody(body.get<std::string>());
        if (a.body == GROUND) {
            throw std::runtime_error(what + ": unknown body '" + body.get<std::string>() + "'");
        }
    } else {
        throw std::runtime_error(what + ": 'body' must be an id or null");
    }
    const nlohmann::json& p = j["point"];
    if (!p.is_array() || p.size() != 2 || !p[0].is_number() || !p[1].is_number()) {
        throw std::runtime_error(what + ": 'point' must be [x, y]");
    }
    a.point = {p[0].get<double>(), p[1].get<double>()};
    return a;
}

}  // namespace ms
