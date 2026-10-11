// registry.hpp - maps JSON type names to factories. Owned by the integration ticket only.
#pragma once

#include <memory>
#include <string>

#include <nlohmann/json.hpp>

#include "body.hpp"
#include "constraint.hpp"
#include "element.hpp"

namespace ms {

class World;

// Sets mass, inertia and type on an already created Body from the body's "params" object.
using BodyInitFn = void (*)(Body& body, const nlohmann::json& params);

// Build an element / constraint from its full JSON spec (id, type, anchors, params).
// The world already contains all bodies (use World::findBody to resolve ids).
// Throw std::runtime_error with a clear message on invalid input.
using ElementFactoryFn = std::unique_ptr<Element> (*)(const nlohmann::json& spec, const World& world);
using ConstraintFactoryFn = std::unique_ptr<Constraint> (*)(const nlohmann::json& spec,
                                                            const World& world);

// Return nullptr for unknown type names.
BodyInitFn findBodyType(const std::string& type);
ElementFactoryFn findElementType(const std::string& type);
ConstraintFactoryFn findConstraintType(const std::string& type);

}  // namespace ms
