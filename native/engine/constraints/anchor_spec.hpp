// anchor_spec.hpp - parsing of {"body": id | null, "point": [x, y]} for links and joints (v0.3).
#pragma once

#include <string>

#include <nlohmann/json.hpp>

#include "../core/types.hpp"

namespace ms {

class World;

// `what` names the object in messages ("rope 'r1'"). If allowGround is false a null body is an
// error. Throws std::runtime_error.
Anchor parseAnchorSpec(const std::string& what, const nlohmann::json& j, const World& world,
                       bool allowGround);

}  // namespace ms
