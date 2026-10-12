// node.hpp - Knoten: a point mass where Stabs meet (v0.4, Fachwerk).
#pragma once

#include <nlohmann/json.hpp>

#include "../core/body.hpp"

namespace ms {

// A node is a body without extent: Stabs, supports and loads attach at its centre. Its rotation is
// irrelevant; its inertia is that of a small disc (radius kNodeRadius) so the rotational degree of
// freedom stays regular.
constexpr double kNodeRadius = 0.05;  // m

// params: {"mass": m}. Sets body.type = "node", mass and inertia m r^2 / 2.
void initNode(Body& body, const nlohmann::json& params);

}  // namespace ms
