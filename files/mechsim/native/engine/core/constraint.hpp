// constraint.hpp - abstract bilateral constraint (supports, joints). Complete, frozen for v0.1.
//
// Formulation (see docs/formulation.md):
//   M qdd = f + G^T lambda        (equations of motion)
//   G qdd = gamma                 (acceleration-level constraint)
//   gamma = gamma_0 - 2 alpha Cdot - beta^2 C   (Baumgarte stabilisation)
// lambda is the constraint force exerted ON the bodies.
#pragma once

#include <string>

#include <nlohmann/json.hpp>

namespace ms {

class World;

class Constraint {
public:
    std::string id;

    virtual ~Constraint() = default;

    // Type name as used in the scene JSON, e.g. "pin_support".
    virtual const char* type() const = 0;

    // Number of scalar constraint equations (rows in G).
    virtual int dim() const = 0;

    // Called once by World::initialize() after all bodies are set to their initial state,
    // e.g. to capture the world position of a support.
    virtual void initialize(const World& world) { (void)world; }

    // Fill this constraint's rows of the global system.
    //   G:     dim() rows x cols, row-major, ALREADY ZEROED; cols == 3 * number of bodies.
    //          Body i owns columns 3i (x), 3i+1 (y), 3i+2 (phi).
    //   gamma: dim() entries, including Baumgarte terms (world.solver.baumgarte_alpha/beta).
    virtual void fill(const World& world, double* G, int cols, double* gamma) const = 0;

    // Receive this constraint's dim() Lagrange multipliers after each solve (for reactions).
    virtual void setMultipliers(const double* lambda) = 0;

    // Fill the frame entry. World::frame() has already set "id" and "type"; add the rest
    // ("position", "reaction") as required by contracts/state.schema.json.
    virtual void writeFrame(const World& world, nlohmann::json& out) const = 0;
};

}  // namespace ms
