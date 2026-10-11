// world.hpp - container for bodies, elements and constraints. Interface frozen for v0.1.
#pragma once

#include <memory>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "body.hpp"
#include "constraint.hpp"
#include "element.hpp"
#include "types.hpp"

namespace ms {

struct SolverSettings {
    double dt = 1e-3;
    std::string integrator = "semi_implicit_euler";
    double baumgarte_alpha = 5.0;
    double baumgarte_beta = 5.0;
};

class World {
public:
    Vec2 gravity{0.0, -9.81};
    SolverSettings solver;
    double time = 0.0;

    std::vector<Body> bodies;
    std::vector<std::unique_ptr<Element>> elements;
    std::vector<std::unique_ptr<Constraint>> constraints;

    // Index of the body with this id, or GROUND (-1) if not found.
    BodyIndex findBody(const std::string& id) const;

    // World position / velocity of an anchor (handles GROUND).
    Vec2 anchorWorld(const Anchor& a) const;
    Vec2 anchorVelocity(const Anchor& a) const;

    // Total number of constraint rows (sum of dim()).
    int constraintRows() const;

    // Call once after loading: saves every body's initial state, calls Constraint::initialize().
    void initialize();

    // Advance by one step of size dt using solver.integrator. Advances `time`.
    void step(double dt);

    // Restore initial body states, time = 0, re-run Constraint::initialize().
    void reset();

    double kineticEnergy() const;
    // Gravity potential (-m g . pos for each body) + sum of Element::potentialEnergy().
    double potentialEnergy() const;

    // Build the frame JSON (contracts/state.schema.json).
    nlohmann::json frame() const;
};

}  // namespace ms
