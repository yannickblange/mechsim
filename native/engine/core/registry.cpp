// registry.cpp - the one place where new types are registered (integration tickets only).
#include "registry.hpp"

#include <map>

#include "../bodies/block.hpp"
#include "../bodies/disc.hpp"
#include "../bodies/node.hpp"
#include "../constraints/fixed_support.hpp"
#include "../constraints/joint.hpp"
#include "../constraints/link.hpp"
#include "../constraints/pin_support.hpp"
#include "../constraints/roller_support.hpp"
#include "../elements/damper.hpp"
#include "../elements/load.hpp"
#include "../elements/spring.hpp"

namespace ms {

BodyInitFn findBodyType(const std::string& type) {
    static const std::map<std::string, BodyInitFn> table = {
        {"block", &initBlock},
        {"disc", &initDisc},
        {"node", &initNode},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

ElementFactoryFn findElementType(const std::string& type) {
    static const std::map<std::string, ElementFactoryFn> table = {
        {"spring", &makeSpring},
        {"load", &makeLoad},
        {"damper", &makeDamper},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

ConstraintFactoryFn findConstraintType(const std::string& type) {
    static const std::map<std::string, ConstraintFactoryFn> table = {
        {"pin_support", &makePinSupport},
        {"fixed_support", &makeFixedSupport},
        {"roller_support", &makeRollerSupport},
        {"rope", &makeRope},
        {"rod", &makeRod},
        {"pin_joint", &makePinJoint},
        {"fixed_joint", &makeFixedJoint},
    };
    auto it = table.find(type);
    return it == table.end() ? nullptr : it->second;
}

}  // namespace ms
