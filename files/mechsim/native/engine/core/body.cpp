// body.cpp - TICKET A2 implements this file.
#include "body.hpp"

#include <stdexcept>

namespace ms {

Vec2 Body::rotated(Vec2 local) const { throw std::logic_error("TODO(A2): Body::rotated"); }
Vec2 Body::toWorld(Vec2 local) const { throw std::logic_error("TODO(A2): Body::toWorld"); }
Vec2 Body::velocityAt(Vec2 local) const { throw std::logic_error("TODO(A2): Body::velocityAt"); }
void Body::applyForceAt(Vec2 f, Vec2 local) { throw std::logic_error("TODO(A2): applyForceAt"); }
void Body::applyForce(Vec2 f) { throw std::logic_error("TODO(A2): Body::applyForce"); }
void Body::clearForces() { throw std::logic_error("TODO(A2): Body::clearForces"); }
double Body::kineticEnergy() const { throw std::logic_error("TODO(A2): Body::kineticEnergy"); }
void Body::saveInitialState() { throw std::logic_error("TODO(A2): Body::saveInitialState"); }
void Body::restoreInitialState() { throw std::logic_error("TODO(A2): restoreInitialState"); }

}  // namespace ms
