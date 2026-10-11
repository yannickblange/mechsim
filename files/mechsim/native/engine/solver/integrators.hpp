// integrators.hpp - time integration schemes. Interface frozen for v0.1.
#pragma once

namespace ms {

class World;

// One semi-implicit (symplectic) Euler step:
//   assemble at world.time -> solve -> pass lambda to constraints (setMultipliers)
//   v += a dt;  q += v_new dt;  world.time += dt
// Throws std::runtime_error if the constraint system is singular.
void stepSemiImplicitEuler(World& world, double dt);

}  // namespace ms
