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

// A bendable beam (v0.4): hidden node bodies, ordered along the beam, and the element that holds
// them together. Reported in frames as one body with the id of the beam.
struct BeamGroup {
    std::string id;
    std::vector<int> nodes;      // body indices, from the start to the end of the beam
    int centre = 0;              // body index of the node at the middle of the beam (local x = 0)
    const Element* fe = nullptr; // its BeamElement (owned by World::elements)
};

class World {
public:
    Vec2 gravity{0.0, -9.81};
    SolverSettings solver;
    double time = 0.0;
    // Size of the (sub)step being taken, for elements whose damping must stay stable (v0.4b). 0 outside step().
    double substepDt = 0.0;

    std::vector<Body> bodies;
    std::vector<std::unique_ptr<Element>> elements;
    std::vector<std::unique_ptr<Constraint>> constraints;
    std::vector<BeamGroup> beams;

    // Index of the body with this id, or GROUND (-1) if not found.
    BodyIndex findBody(const std::string& id) const;
    // Index into `beams` of the beam with this id, or -1.
    int findBeam(const std::string& id) const;

    // World position / velocity of an anchor (handles GROUND).
    Vec2 anchorWorld(const Anchor& a) const;
    Vec2 anchorVelocity(const Anchor& a) const;

    // Total number of constraint rows (sum of dim()).
    int constraintRows() const;

    // Call once after loading: saves every body's initial state, calls Constraint::initialize().
    void initialize();

    // Advance by one step of size dt using solver.integrator. Advances `time`. A step is split into
    // substeps when dt * maxOmega() is large (stiff bars and beams): the semi-implicit Euler scheme is
    // stable for omega * dt < 2, the substeps keep it below 0.25.
    void step(double dt);

    // Restore initial body states, time = 0, re-run Constraint::initialize().
    void reset();

    double kineticEnergy() const;
    // Gravity potential (-m g . pos for each body) + sum of Element::potentialEnergy().
    double potentialEnergy() const;

    // Build the frame JSON (contracts/state.schema.json).
    nlohmann::json frame() const;

    // The bodies as the outside world sees them, in scene order: a beam is one body (its midpoint).
    // Each entry: x, y, phi, vx, vy, omega.
    struct BodyState {
        std::string id;
        double q[6];
    };
    std::vector<BodyState> sceneBodies() const;

    // Highest natural frequency (rad/s) the force elements can produce, estimated at initialize().
    // step() splits a step into substeps so that the explicit scheme stays stable (see step()).
    double maxOmega() const { return maxOmega_; }
    // Number of substeps step(dt) uses.
    int substepsFor(double dt) const;

private:
    double maxOmega_ = 0.0;
};

}  // namespace ms
