// spring.cpp - TICKET A3 implements this file.
#include "spring.hpp"

#include <stdexcept>

#include "../core/world.hpp"

namespace ms {

void Spring::applyForces(World& world, double t) { throw std::logic_error("TODO(A3)"); }
double Spring::potentialEnergy(const World& world) const { throw std::logic_error("TODO(A3)"); }
void Spring::writeFrame(const World& world, nlohmann::json& out) const {
    throw std::logic_error("TODO(A3)");
}
double Spring::currentLength(const World& world) const { throw std::logic_error("TODO(A3)"); }
double Spring::axialForce(const World& world) const { throw std::logic_error("TODO(A3)"); }

std::unique_ptr<Element> makeSpring(const nlohmann::json& spec, const World& world) {
    throw std::logic_error("TODO(A3): makeSpring");
}

}  // namespace ms
