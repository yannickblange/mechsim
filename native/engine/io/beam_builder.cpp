// beam_builder.cpp - beam -> node bodies + finite elements.
#include "beam_builder.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "../constraints/anchor_spec.hpp"
#include "../core/material.hpp"
#include "../core/section.hpp"
#include "../elements/beam_element.hpp"

namespace ms {

namespace {

using nlohmann::json;

constexpr double kPi = 3.14159265358979323846;

constexpr int kDefaultSegments = 8;
constexpr int kMaxSegments = 64;
// An attachment closer than this fraction of a segment to a node is moved onto it (with a lever).
constexpr double kSnapFraction = 0.2;

Vec2 parseVec(const json& j, const std::string& what) {
    if (!j.is_array() || j.size() != 2 || !j[0].is_number() || !j[1].is_number()) {
        throw std::runtime_error(what + " must be [x, y]");
    }
    return {j[0].get<double>(), j[1].get<double>()};
}

// Reports the local x of every anchor that sits on a beam: visit(beamId, x).
template <typename Fn>
void forEachBeamAnchor(const json& scene, const BeamPlans& beams, Fn visit) {
    auto anchor = [&](const json& a) {
        if (!a.is_object() || !a.contains("body") || !a["body"].is_string() || !a.contains("point")) return;
        const std::string id = a["body"].get<std::string>();
        if (beams.count(id) == 0) return;
        const Vec2 p = parseVec(a["point"], "beam '" + id + "': anchor 'point'");
        visit(id, p.x);
    };
    for (const char* list : {"elements", "constraints"}) {
        if (!scene.contains(list)) continue;
        for (const json& spec : scene[list]) {
            if (spec.contains("a")) anchor(spec["a"]);
            if (spec.contains("b")) anchor(spec["b"]);
            anchor(spec);  // loads and supports carry "body" and "point" themselves
        }
    }
}

std::size_t nearestNode(const std::vector<double>& xs, double x) {
    std::size_t best = 0;
    for (std::size_t k = 1; k < xs.size(); ++k) {
        if (std::abs(xs[k] - x) < std::abs(xs[best] - x)) best = k;
    }
    return best;
}

std::string nodeId(const std::string& beam, std::size_t k) { return beam + "#" + std::to_string(k); }

}  // namespace

BeamPlans planBeams(const json& scene) {
    BeamPlans plans;
    for (const json& spec : scene.at("bodies")) {
        if (spec.at("type").get<std::string>() != "beam") continue;
        BeamPlan plan;
        plan.id = spec.at("id").get<std::string>();
        const json& params = spec.at("params");
        const std::string what = "beam '" + plan.id + "'";
        if (!params.contains("length") || !params["length"].is_number() || !(params["length"].get<double>() > 0.0)) {
            throw std::runtime_error(what + ": 'length' must be a number > 0");
        }
        plan.length = params["length"].get<double>();
        int segments = kDefaultSegments;
        if (params.contains("segments")) {
            if (!params["segments"].is_number_integer()) throw std::runtime_error(what + ": 'segments' must be an integer");
            segments = params["segments"].get<int>();
            if (segments < 2 || segments > kMaxSegments) {
                throw std::runtime_error(what + ": 'segments' must be between 2 and " + std::to_string(kMaxSegments));
            }
        }
        if (segments % 2 != 0) ++segments;  // an even number puts a node at the middle
        for (int k = 0; k <= segments; ++k) plan.xs.push_back(-plan.length / 2.0 + plan.length * k / segments);
        plan.xs[segments / 2] = 0.0;
        plans[plan.id] = plan;
    }

    // One node at every attachment that is not close to a node already there.
    forEachBeamAnchor(scene, plans, [&](const std::string& id, double x) {
        BeamPlan& plan = plans[id];
        const double h = plan.length / (static_cast<double>(plan.xs.size() - 1));
        if (std::abs(x) > plan.length / 2.0 + 1e-6) {
            throw std::runtime_error("beam '" + id + "': an attachment at x = " + std::to_string(x) +
                                     " m lies outside the beam (length " + std::to_string(plan.length) + " m)");
        }
        const std::size_t k = nearestNode(plan.xs, x);
        if (std::abs(plan.xs[k] - x) <= kSnapFraction * h) return;
        plan.xs.push_back(std::clamp(x, -plan.length / 2.0, plan.length / 2.0));
        std::sort(plan.xs.begin(), plan.xs.end());
    });
    for (auto& [id, plan] : plans) plan.centre = static_cast<int>(nearestNode(plan.xs, 0.0));
    return plans;
}

void addBeam(const json& spec, const BeamPlan& plan, World& world) {
    const std::string what = "beam '" + plan.id + "'";
    const json& params = spec.at("params");
    const Section section = parseSection(params.at("section"), what);
    double damping = 0.0;
    if (params.contains("damping")) {
        if (!params["damping"].is_number() || params["damping"].get<double>() < 0.0) {
            throw std::runtime_error(what + ": 'damping' must be a number >= 0");
        }
        damping = params["damping"].get<double>();
    }

    double mass = kDensity * section.area * plan.length;
    if (params.contains("mass")) {
        if (!params["mass"].is_number() || !(params["mass"].get<double>() > 0.0)) {
            throw std::runtime_error(what + ": 'mass' must be a number > 0");
        }
        mass = params["mass"].get<double>();
    }

    const Vec2 centre = parseVec(spec.at("position"), what + ": 'position'");
    const double angle = spec.value("angle", 0.0);
    Vec2 v0{0.0, 0.0};
    if (spec.contains("velocity")) v0 = parseVec(spec["velocity"], what + ": 'velocity'");
    const double omega = spec.value("omega", 0.0);

    const int group = static_cast<int>(world.beams.size());
    const std::size_t n = plan.xs.size();
    BeamGroup g;
    g.id = plan.id;
    for (std::size_t k = 0; k < n; ++k) {
        // The slice of beam that belongs to the node: half a segment on either side.
        const double left = k > 0 ? plan.xs[k] - plan.xs[k - 1] : 0.0;
        const double right = k + 1 < n ? plan.xs[k + 1] - plan.xs[k] : 0.0;
        const double trib = 0.5 * (left + right);
        Body b;
        b.id = nodeId(plan.id, k);
        b.type = "beam_node";
        b.beam = group;
        b.damping = damping;
        b.mass = mass * trib / plan.length;
        // A slice of length trib and height depth about its centre: m (trib^2 + depth^2) / 12; the
        // end nodes carry half a slice that hangs on one side of the node: m (trib^2 / 3 + depth^2 / 12).
        const bool end = k == 0 || k + 1 == n;
        b.inertia = b.mass * ((end ? trib * trib / 3.0 : trib * trib / 12.0) + section.depth() * section.depth() / 12.0);
        const Vec2 r = rotate({plan.xs[k], 0.0}, angle);
        b.pos = centre + r;
        b.phi = angle;
        b.vel = v0 + cross(omega, r);
        b.omega = omega;
        g.nodes.push_back(static_cast<int>(world.bodies.size()));
        world.bodies.push_back(std::move(b));
    }
    g.centre = g.nodes[plan.centre];

    auto fe = std::make_unique<BeamElement>();
    fe->id = plan.id + "#fe";
    fe->section = section;
    fe->EA = kYoungModulus * section.area;
    fe->EI = kYoungModulus * section.inertia;
    const Vec2 axis = rotate({1.0, 0.0}, angle);
    for (std::size_t k = 0; k + 1 < n; ++k) {
        BeamElement::Segment s;
        s.a = {g.nodes[k], {0.0, 0.0}, false};
        s.b = {g.nodes[k + 1], {0.0, 0.0}, false};
        s.L0 = plan.xs[k + 1] - plan.xs[k];
        s.u0 = axis;
        s.phi0_a = s.phi0_b = angle;
        fe->segments.push_back(s);
    }
    g.fe = fe.get();
    world.elements.push_back(std::move(fe));
    world.beams.push_back(std::move(g));
}

void addBar(const json& spec, World& world) {
    const std::string id = spec.at("id").get<std::string>();
    const std::string what = "bar '" + id + "'";
    const Anchor a = parseAnchorSpec(what, spec.at("a"), world, true);
    const Anchor b = parseAnchorSpec(what, spec.at("b"), world, true);
    if (a.body == GROUND && b.body == GROUND) throw std::runtime_error(what + ": at least one end must be on a mass");
    if (a.body == b.body) throw std::runtime_error(what + ": both ends are on the same mass");
    const Vec2 pA = world.anchorWorld(a), pB = world.anchorWorld(b);
    const double L0 = length(pB - pA);
    if (L0 < 1e-6) throw std::runtime_error(what + ": the ends coincide");

    const json& params = spec.at("params");
    if (!params.contains("section")) throw std::runtime_error(what + ": 'section' is required");
    const Section section = parseSection(params.at("section"), what);
    int segments = 4;
    if (params.contains("segments")) {
        if (!params["segments"].is_number_integer() || params["segments"].get<int>() < 1 || params["segments"].get<int>() > 16) {
            throw std::runtime_error(what + ": 'segments' must be an integer from 1 to 16");
        }
        segments = params["segments"].get<int>();
    }
    double mass = kDensity * section.area * L0;
    if (params.contains("mass")) {
        if (!params["mass"].is_number() || !(params["mass"].get<double>() > 0.0)) {
            throw std::runtime_error(what + ": 'mass' must be a number > 0");
        }
        mass = params["mass"].get<double>();
    }
    auto nonNegative = [&](const char* key, double fallback) {
        if (!params.contains(key)) return fallback;
        if (!params[key].is_number() || params[key].get<double>() < 0.0) {
            throw std::runtime_error(what + ": '" + key + "' must be a number >= 0");
        }
        return params[key].get<double>();
    };
    const double damping = nonNegative("damping", 0.0);
    const double imperfection = nonNegative("imperfection", 0.00001);

    auto fe = std::make_unique<BeamElement>();
    fe->id = id;
    fe->kind = BeamElement::Kind::Bar;
    fe->section = section;
    fe->EA = kYoungModulus * section.area;
    fe->EI = kYoungModulus * section.inertia;
    fe->installedLength = L0;

    const Vec2 u = (pB - pA) / L0;
    const Vec2 nrm = perp(u);
    const double chordAngle = std::atan2(u.y, u.x);
    const double bow = imperfection * L0;
    const Vec2 vA = world.anchorVelocity(a), vB = world.anchorVelocity(b);

    // internal nodes: along the chord with a half sine of amplitude `bow` (the stress-free initial shape)
    std::vector<int> inner;
    std::vector<Vec2> points = {pA};
    std::vector<double> angles = {0.0};
    const double ell = L0 / segments;
    for (int k = 1; k < segments; ++k) {
        const double s = static_cast<double>(k) / segments;
        Body body;
        body.id = id + "#" + std::to_string(k);
        body.type = "bar_node";
        body.hidden = true;
        body.damping = damping;
        body.mass = mass * ell / L0;
        body.inertia = body.mass * (ell * ell + section.depth() * section.depth()) / 12.0;
        body.pos = pA + s * L0 * u + bow * std::sin(kPi * s) * nrm;
        body.phi = chordAngle + std::atan2(bow * kPi * std::cos(kPi * s), L0);
        body.vel = vA + s * (vB - vA);
        inner.push_back(static_cast<int>(world.bodies.size()));
        points.push_back(body.pos);
        angles.push_back(body.phi);
        world.bodies.push_back(std::move(body));
    }
    points.push_back(pB);
    angles.push_back(0.0);
    if (segments > 1) fe->endWeight = mass / (2.0 * segments);  // the end halves hang on the anchors

    for (int k = 0; k < segments; ++k) {
        BeamElement::Segment seg;
        if (k == 0) seg.a = {a.body, a.point, true};
        else seg.a = {inner[k - 1], {0.0, 0.0}, false};
        if (k == segments - 1) seg.b = {b.body, b.point, true};
        else seg.b = {inner[k], {0.0, 0.0}, false};
        const Vec2 d = points[k + 1] - points[k];
        seg.L0 = length(d);
        seg.u0 = d / seg.L0;
        seg.phi0_a = angles[k];
        seg.phi0_b = angles[k + 1];
        fe->segments.push_back(seg);
    }
    world.elements.push_back(std::move(fe));
}

json remapBeamAnchors(const json& spec, const BeamPlans& plans) {
    if (plans.empty()) return spec;
    json out = spec;
    auto remap = [&](json& a) {
        if (!a.is_object() || !a.contains("body") || !a["body"].is_string() || !a.contains("point")) return;
        const auto it = plans.find(a["body"].get<std::string>());
        if (it == plans.end()) return;
        const BeamPlan& plan = it->second;
        const Vec2 p = parseVec(a["point"], "beam '" + plan.id + "': anchor 'point'");
        const std::size_t k = nearestNode(plan.xs, p.x);
        a["body"] = nodeId(plan.id, k);
        a["point"] = {p.x - plan.xs[k], p.y};  // the lever from the node, in the frame of the node
    };
    if (out.contains("a")) remap(out["a"]);
    if (out.contains("b")) remap(out["b"]);
    remap(out);
    return out;
}

}  // namespace ms
