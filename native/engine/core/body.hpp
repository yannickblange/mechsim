// body.hpp - planar rigid body with 3 DOF (x, y, phi). Interface frozen for v0.1.
#pragma once

#include <string>

#include "types.hpp"

namespace ms {

class Body {
public:
    std::string id;
    std::string type;  // "block" in v0.1

    // v0.4: >= 0 for a hidden node of a bendable beam (index into World::beams); such nodes are
    // reported through their beam, not as bodies of their own.
    int beam = -1;
    // v0.4b: an internal node of an elastic Stab: not reported as a body of its own.
    bool hidden = false;
    // v0.4b: viscous damping rate alpha (1 / s): force -alpha m v and torque -alpha J omega. Every mode of
    // the system then decays like exp(-alpha t / 2), whatever its frequency. 0 = none (the default).
    double damping = 0.0;

    double mass = 1.0;     // kg
    double inertia = 1.0;  // kg m^2 about the centre of mass

    // v0.8: shape for the contact with surfaces. Only blocks and discs collide; everything else is None.
    enum class Shape { None, Block, Disc };
    Shape shape = Shape::None;
    double halfWidth = 0.0, halfHeight = 0.0;  // Block: half the extent along the local x / y axis, m
    double radius = 0.0;                       // Disc, m

    // State
    Vec2 pos;            // centre of mass, world
    double phi = 0.0;    // rad, CCW positive
    Vec2 vel;            // m/s
    double omega = 0.0;  // rad/s

    // Force accumulators (world frame, about the centre of mass)
    Vec2 force;
    double torque = 0.0;

    // R(phi) * local
    Vec2 rotated(Vec2 local) const;
    // pos + R(phi) * local
    Vec2 toWorld(Vec2 local) const;
    // vel + omega x (R(phi) * local)
    Vec2 velocityAt(Vec2 local) const;

    // Add force f (world frame) acting at body-local point `local`:
    // force += f; torque += cross(R(phi) * local, f).
    void applyForceAt(Vec2 f, Vec2 local);
    // Add force f at the centre of mass (no torque).
    void applyForce(Vec2 f);
    void clearForces();

    // 0.5 m |v|^2 + 0.5 J omega^2
    double kineticEnergy() const;

    // Store / restore pos, phi, vel, omega for World::reset().
    void saveInitialState();
    void restoreInitialState();

private:
    Vec2 pos0_;
    double phi0_ = 0.0;
    Vec2 vel0_;
    double omega0_ = 0.0;
};

}  // namespace ms
