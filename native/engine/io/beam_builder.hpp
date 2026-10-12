// beam_builder.hpp - turns a bendable beam of the scene into node bodies and finite elements (v0.4).
//
// Scene body: {"id", "type": "beam", "position", "angle", "velocity", "omega",
//              "params": {"length", "section": {...}, "mass"?, "segments"?}}
// The beam lies along its local x axis; the axis is the line of the section centroids and
// "position" is the point of that line at the middle. Every other object may attach to it with a
// body-local point like on a block; the loader gives the beam a node at the x of each such point
// (or snaps the point to a node nearby and keeps the small offset as a rigid lever), so every
// attachment sits on a node.
#pragma once

#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "../core/world.hpp"

namespace ms {

struct BeamPlan {
    std::string id;
    double length = 0.0;
    std::vector<double> xs;  // node positions along the beam axis, from -length/2 to +length/2
    int centre = 0;          // index of the node at x = 0
};

using BeamPlans = std::map<std::string, BeamPlan>;

// Reads the beams and every anchor on them. Throws std::runtime_error naming the beam id.
BeamPlans planBeams(const nlohmann::json& scene);

// Adds the node bodies, the BeamElement and the BeamGroup of one beam to the world.
void addBeam(const nlohmann::json& spec, const BeamPlan& plan, World& world);

// Copy of an element / constraint spec in which every anchor on a beam is replaced by an anchor on
// the node of that beam (body id "<beam>#<k>", offset from the node as the local point).
nlohmann::json remapBeamAnchors(const nlohmann::json& spec, const BeamPlans& plans);

}  // namespace ms
