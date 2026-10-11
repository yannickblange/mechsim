// world.cpp - TICKET A5 implements this file.
#include "world.hpp"

#include <stdexcept>

namespace ms {

BodyIndex World::findBody(const std::string& id) const { throw std::logic_error("TODO(A5)"); }
Vec2 World::anchorWorld(const Anchor& a) const { throw std::logic_error("TODO(A5)"); }
Vec2 World::anchorVelocity(const Anchor& a) const { throw std::logic_error("TODO(A5)"); }
int World::constraintRows() const { throw std::logic_error("TODO(A5)"); }
void World::initialize() { throw std::logic_error("TODO(A5)"); }
void World::step(double dt) { throw std::logic_error("TODO(A5)"); }
void World::reset() { throw std::logic_error("TODO(A5)"); }
double World::kineticEnergy() const { throw std::logic_error("TODO(A5)"); }
double World::potentialEnergy() const { throw std::logic_error("TODO(A5)"); }
nlohmann::json World::frame() const { throw std::logic_error("TODO(A5)"); }

}  // namespace ms
