// scene_loader.hpp - scene JSON -> World. Interface frozen for v0.1.
#pragma once

#include <memory>
#include <string>

#include "../core/world.hpp"

namespace ms {

// Parse a scene (contracts/scene.schema.json) and return an initialized World
// (World::initialize() already called). Throws std::runtime_error with a message that names
// the offending object id on any error (bad JSON, unknown type, unknown body id, duplicate id).
std::unique_ptr<World> loadScene(const std::string& jsonText);

}  // namespace ms
