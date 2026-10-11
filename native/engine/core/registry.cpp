// registry.cpp - the one place where new types are registered (integration tickets only).
#include "registry.hpp"

#include <map>

#include "../bodies/block.hpp"
#include "../constraints/pin_support.hpp"
#include "../elements/spring.hpp"

namespace ms {

BodyInitFn findBodyType(const std::string& type) {
    static const std::map<std::string, BodyInitFn> table = {
        {"block", &initBlock},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

ElementFactoryFn findElementType(const std::string& type) {
    static const std::map<std::string, ElementFactoryFn> table = {
        {"spring", &makeSpring},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

ConstraintFactoryFn findConstraintType(const std::string& type) {
    static const std::map<std::string, ConstraintFactoryFn> table = {
        {"pin_support", &makePinSupport},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

}  // namespace ms
