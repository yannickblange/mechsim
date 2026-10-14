// scene_loader.cpp - scene JSON (contracts/scene.schema.json) -> initialized World.
#include "scene_loader.hpp"

#include <algorithm>
#include <iterator>
#include <set>
#include <stdexcept>
#include <string>

#include "../core/registry.hpp"
#include "beam_builder.hpp"

namespace ms {

namespace {

using nlohmann::json;

Vec2 parseVec2(const json& j, const std::string& what) {
    if (!j.is_array() || j.size() != 2 || !j[0].is_number() || !j[1].is_number()) {
        throw std::runtime_error(what + " must be [x, y]");
    }
    return {j[0].get<double>(), j[1].get<double>()};
}

void claimId(std::set<std::string>& ids, const std::string& id) {
    if (!ids.insert(id).second) throw std::runtime_error("duplicate id '" + id + "'");
}

void loadSolver(const json& scene, World& world) {
    if (!scene.contains("solver")) return;
    const json& s = scene["solver"];
    SolverSettings& out = world.solver;
    out.dt = s.value("dt", out.dt);
    out.integrator = s.value("integrator", out.integrator);
    out.baumgarte_alpha = s.value("baumgarte_alpha", out.baumgarte_alpha);
    out.baumgarte_beta = s.value("baumgarte_beta", out.baumgarte_beta);
    if (!(out.dt > 0.0)) throw std::runtime_error("solver: 'dt' must be > 0");
}

// v0.8: the fixed surfaces. A surface is the segment p1 -> p2, or the polyline `points` (a curve: spline, arc) whose ends are p1 and p2.
void loadSurface(const json& spec, World& world) {
    Surface s;
    s.id = spec.at("id").get<std::string>();
    const std::string what = "surface '" + s.id + "'";
    if (spec.contains("points")) {
        if (!spec["points"].is_array() || spec["points"].size() < 2) throw std::runtime_error(what + ": 'points' needs at least two points");
        for (const json& p : spec["points"]) s.points.push_back(parseVec2(p, what + ": a point of 'points'"));
    } else {
        s.points = {parseVec2(spec.at("p1"), what + ": 'p1'"), parseVec2(spec.at("p2"), what + ": 'p2'")};
    }
    if (spec.contains("friction")) {
        if (!spec["friction"].is_number() || spec["friction"].get<double>() < 0.0) throw std::runtime_error(what + ": 'friction' must be a number >= 0");
        s.friction = spec["friction"].get<double>();
    }
    if (spec.contains("restitution")) {
        const json& e = spec["restitution"];
        if (!e.is_number() || e.get<double>() < 0.0 || e.get<double>() > 1.0) throw std::runtime_error(what + ": 'restitution' must be a number in [0, 1]");
        s.restitution = e.get<double>();
    }
    world.surfaces.push_back(std::move(s));
}

void loadBody(const json& spec, World& world, std::set<std::string>& ids) {
    const std::string id = spec.at("id").get<std::string>();
    claimId(ids, id);
    const std::string type = spec.at("type").get<std::string>();
    BodyInitFn init = findBodyType(type);
    if (!init) throw std::runtime_error("body '" + id + "': unknown type '" + type + "'");

    Body b;
    b.id = id;
    b.pos = parseVec2(spec.at("position"), "body '" + id + "': 'position'");
    b.phi = spec.value("angle", 0.0);
    if (spec.contains("velocity")) b.vel = parseVec2(spec["velocity"], "body '" + id + "': 'velocity'");
    b.omega = spec.value("omega", 0.0);
    try {
        init(b, spec.at("params"));
    } catch (const std::exception& e) {
        throw std::runtime_error(id + ": " + e.what());
    }
    world.bodies.push_back(std::move(b));
}

// Runs a factory and prefixes failures with the object id.
template <typename Fn>
auto callFactory(Fn fn, const json& spec, const World& world, const std::string& id) {
    try {
        return fn(spec, world);
    } catch (const std::exception& e) {
        throw std::runtime_error(id + ": " + e.what());
    }
}

void loadElement(const json& rawSpec, const BeamPlans& beams, const std::set<std::string>& clampedNodes, World& world,
                 std::set<std::string>& ids) {
    const json spec = remapBeamAnchors(rawSpec, beams);  // attachments on a beam go to its nodes
    const std::string id = spec.at("id").get<std::string>();
    claimId(ids, id);
    const std::string type = spec.at("type").get<std::string>();
    if (type == "bar") {  // v0.4b: an elastic Stab is a chain of beam elements and hidden nodes
        try {
            addBar(spec, world, clampedNodes);
        } catch (const std::exception& e) {
            throw std::runtime_error(id + ": " + e.what());
        }
        return;
    }
    ElementFactoryFn make = findElementType(type);
    if (!make) throw std::runtime_error("element '" + id + "': unknown type '" + type + "'");
    world.elements.push_back(callFactory(make, spec, world, id));
}

void loadConstraint(const json& rawSpec, const BeamPlans& beams, const std::set<std::string>& clampedNodes, World& world,
                    std::set<std::string>& ids) {
    json spec = remapBeamAnchors(rawSpec, beams);
    if (spec.value("type", "") == "rod") {  // v0.7c: a rigid Stab is clamped at a node that has an Einspannung (like the elastic one)
        for (const char* side : {"a", "b"}) {
            const json& end = spec.at(side);
            if (end.contains("body") && end["body"].is_string() && clampedNodes.count(end["body"].get<std::string>()) > 0) {
                if (!spec.contains("params")) spec["params"] = json::object();
                spec["params"][std::string("node_clamped_") + side] = true;
            }
        }
    }
    const std::string id = spec.at("id").get<std::string>();
    claimId(ids, id);
    const std::string type = spec.at("type").get<std::string>();
    ConstraintFactoryFn make = findConstraintType(type);
    if (!make) throw std::runtime_error("constraint '" + id + "': unknown type '" + type + "'");
    world.constraints.push_back(callFactory(make, spec, world, id));
}

std::unique_ptr<World> build(const json& scene) {
    if (!scene.is_object()) throw std::runtime_error("scene must be a JSON object");
    static const char* const kVersions[] = {"0.1", "0.2", "0.3", "0.4"};
    if (!scene.contains("version") || !scene["version"].is_string() ||
        std::none_of(std::begin(kVersions), std::end(kVersions), [&](const char* v) { return scene["version"] == v; })) {
        throw std::runtime_error("unsupported scene version (expected \"0.1\" to \"0.4\")");
    }

    auto world = std::make_unique<World>();
    if (scene.contains("gravity")) world->gravity = parseVec2(scene["gravity"], "'gravity'");
    loadSolver(scene, *world);

    std::set<std::string> ids;
    if (scene.contains("surfaces")) {
        for (const json& spec : scene["surfaces"]) loadSurface(spec, *world);
    }
    const BeamPlans beams = planBeams(scene);  // v0.4: bendable beams become chains of node bodies
    for (const json& spec : scene.at("bodies")) {
        if (spec.at("type").get<std::string>() == "beam") {
            const std::string id = spec.at("id").get<std::string>();
            claimId(ids, id);
            try {
                addBeam(spec, beams.at(id), *world);
            } catch (const std::exception& e) {
                throw std::runtime_error(id + ": " + e.what());
            }
        } else {
            loadBody(spec, *world, ids);
        }
    }
    // v0.7: an Einspannung (fixed_support) on a node clamps the Stabs that end there: the elastic ones (they hinge otherwise) and,
    // since v0.7c, the rigid ones (a rigid arm of the node)
    std::set<std::string> nodeIds, clampedNodes;
    for (const json& spec : scene.at("bodies")) {
        if (spec.at("type").get<std::string>() == "node") nodeIds.insert(spec.at("id").get<std::string>());
    }
    if (scene.contains("constraints")) {
        for (const json& spec : scene["constraints"]) {
            if (spec.value("type", "") == "fixed_support" && spec.contains("body") && spec["body"].is_string() &&
                nodeIds.count(spec["body"].get<std::string>()) > 0) {
                clampedNodes.insert(spec["body"].get<std::string>());
            }
        }
    }
    if (scene.contains("elements")) {
        for (const json& spec : scene["elements"]) loadElement(spec, beams, clampedNodes, *world, ids);
    }
    if (scene.contains("constraints")) {
        for (const json& spec : scene["constraints"]) loadConstraint(spec, beams, clampedNodes, *world, ids);
        // v0.8: a mass that a support (Festlager, Loslager, Einspannung) attaches to a surface does not also collide with that surface: the
        // support is the connection there (a pendulum hung from a ceiling swings under it; two rows for one point would be redundant)
        for (const json& spec : scene["constraints"]) {
            const std::string type = spec.value("type", "");
            if ((type != "pin_support" && type != "roller_support" && type != "fixed_support") || !spec.contains("surface") ||
                !spec["surface"].is_string() || !spec.contains("body") || !spec["body"].is_string()) continue;
            const BodyIndex body = world->findBody(spec["body"].get<std::string>());
            for (std::size_t si = 0; si < world->surfaces.size(); ++si) {
                if (body != GROUND && world->surfaces[si].id == spec["surface"].get<std::string>()) {
                    world->noContact.emplace_back(body, static_cast<int>(si));
                }
            }
        }
    }
    // "surfaces" (v0.2) are drawing/editor geometry for the supports (they carry their own angle); since v0.8 blocks
    // and discs also collide with them (solver/contact.cpp).
    world->initialize();
    return world;
}

}  // namespace

std::unique_ptr<World> loadScene(const std::string& jsonText) {
    json scene;
    try {
        scene = json::parse(jsonText);
    } catch (const json::parse_error& e) {
        throw std::runtime_error(std::string("invalid JSON: ") + e.what());
    }
    try {
        return build(scene);
    } catch (const json::exception& e) {
        throw std::runtime_error(std::string("invalid scene: ") + e.what());
    }
}

}  // namespace ms
