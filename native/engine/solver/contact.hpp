// contact.hpp - blocks and discs against fixed surfaces (v0.8): non-penetration, Coulomb friction, restitution.
//
// A surface is a polyline whose free side is the left of its direction of travel (docs/formulation.md, "Kontakt mit Flaechen").
// Every step the possible contacts ("features") between a mass and a surface are found from the current pose; each has
//   gap g (distance, < 0 penetrating), unit normal n (from the surface into the body: the direction of the normal force),
//   lever r (from the centre of mass to the contact point on the body),
// and the rows J_n = [n, cross(r, n)], J_t = [t, cross(r, t)] with t = perp(n), which give the normal and tangential velocity of the
// contact point: v_n = J_n v, v_t = J_t v. The step is semi-implicit Euler as before, so the unilateral condition is stated for the new
// velocity: g + dt J_n v+ >= 0  (the mass may arrive at the surface, not cross it), or, on an impact, J_n v+ >= -e J_n v (Newton).
// With v+ = v + dt a this is a condition on the acceleration a, solved together with the bilateral constraints (Lagrange multipliers)
// by an active-set iteration like the ropes': rows of the active contacts join G, and the multiplier lambda_n >= 0 is the normal force.
// Friction is Coulomb's: a sticking contact has a tangential row (v_t+ = 0) and needs |lambda_t| <= mu lambda_n; a sliding contact
// adds the force -s mu lambda_n t to the column of its normal row (so the matrix H of the forces differs from the matrix G of the rows).
#pragma once

#include <vector>

#include "../core/types.hpp"
#include "assembler.hpp"

namespace ms {

class World;

enum class ContactKind {
    Corner,       // a corner of a block on the inside of a segment
    Vertex,       // a vertex of the surface against an edge of a block
    DiscSegment,  // a disc on the inside of a segment
    DiscVertex,   // a disc against a vertex of the surface
};

struct Contact {
    int body = 0;
    int surface = 0;
    ContactKind kind = ContactKind::Corner;
    int vertex = 0;  // index into Surface::points (Vertex, DiscVertex), else the segment index
    int local = 0;   // Corner: the corner of the block; Vertex: the edge of the block (counter-clockwise from the corner of that number)

    double gap = 0.0;
    Vec2 n;                  // surface -> body
    Vec2 r;                  // centre of mass -> contact point on the body, world frame
    double Jn[3] = {0, 0, 0};
    double Jt[3] = {0, 0, 0};
    double vn = 0.0, vt = 0.0;  // J_n v, J_t v at the start of the step
    double kappa = 0.0;         // d^2 gap / dt^2 at constant velocity (the curvature term: a mass leaves a flat tangent, or presses into a hollow)
    double bound = 0.0;         // the unilateral row: J_n a >= bound
    double mu = 0.0, restitution = 0.0;

    // solver state
    bool active = false;
    int friction = 0;  // 0 = sticking, +1 = sliding towards +t, -1 = sliding towards -t (only if mu > 0)
    int flips = 0;     // changes of state so far (bounded: stops cycling)
    double lambdaN = 0.0;  // N, >= 0
    double lambdaT = 0.0;  // N, along +t, on the body
};

// The contacts a step may have, from the current poses of the masses; empty if nothing is near a surface.
std::vector<Contact> detectContacts(const World& world, double dt);

// Solve M a = f + H^T lambda, G a = gamma for the bilateral system `sys` and the contacts (their active set is found by iteration and
// left in `contacts`). `lambda` holds the multipliers of sys's rows first, then those of the contact rows. Returns 0, or -1 if the
// constraint system is singular.
int solveContacts(const System& sys, std::vector<Contact>& contacts, double dt, std::vector<double>& acc, std::vector<double>& lambda);

// The active contacts as the frame reports them (World::contacts).
void reportContacts(World& world, const std::vector<Contact>& contacts);

}  // namespace ms
