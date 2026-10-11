// body.cpp - planar rigid body (3 DOF). Implemented in ticket A2.
#include "body.hpp"

namespace ms {

Vec2 Body::rotated(Vec2 local) const { return rotate(local, phi); }

Vec2 Body::toWorld(Vec2 local) const { return pos + rotated(local); }

// v = v_cm + omega x r, r = R(phi) * local.
Vec2 Body::velocityAt(Vec2 local) const { return vel + cross(omega, rotated(local)); }

// tau = r x f (z-component), r = R(phi) * local.
void Body::applyForceAt(Vec2 f, Vec2 local) {
    force += f;
    torque += cross(rotated(local), f);
}

void Body::applyForce(Vec2 f) { force += f; }

void Body::clearForces() {
    force = {0.0, 0.0};
    torque = 0.0;
}

double Body::kineticEnergy() const {
    return 0.5 * mass * dot(vel, vel) + 0.5 * inertia * omega * omega;
}

void Body::saveInitialState() {
    pos0_ = pos;
    phi0_ = phi;
    vel0_ = vel;
    omega0_ = omega;
}

void Body::restoreInitialState() {
    pos = pos0_;
    phi = phi0_;
    vel = vel0_;
    omega = omega0_;
    clearForces();
}

}  // namespace ms
