// scene_loader.cpp - scene JSON (contracts/scene.schema.json) -> initialized World.
#include "scene_loader.hpp"

#include <set>
#include <stdexcept>
#include <string>

#include "../core/registry.hpp"

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

void loadElement(const json& spec, World& world, std::set<std::string>& ids) {
    const std::string id = spec.at("id").get<std::string>();
    claimId(ids, id);
    const std::string type = spec.at("type").get<std::string>();
    ElementFactoryFn make = findElementType(type);
    if (!make) throw std::runtime_error("element '" + id + "': unknown type '" + type + "'");
    world.elements.push_back(callFactory(make, spec, world, id));
}

void loadConstraint(const json& spec, World& world, std::set<std::string>& ids) {
    const std::string id = spec.at("id").get<std::string>();
    claimId(ids, id);
    const std::string type = spec.at("type").get<std::string>();
    ConstraintFactoryFn make = findConstraintType(type);
    if (!make) throw std::runtime_error("constraint '" + id + "': unknown type '" + type + "'");
    world.constraints.push_back(callFactory(make, spec, world, id));
}

std::unique_ptr<World> build(const json& scene) {
    if (!scene.is_object()) throw std::runtime_error("scene must be a JSON object");
    if (!scene.contains("version") || (scene["version"] != "0.1" && scene["version"] != "0.2")) {
        throw std::runtime_error("unsupported scene version (expected \"0.1\" or \"0.2\")");
    }

    auto world = std::make_unique<World>();
    if (scene.contains("gravity")) world->gravity = parseVec2(scene["gravity"], "'gravity'");
    loadSolver(scene, *world);

    std::set<std::string> ids;
    for (const json& spec : scene.at("bodies")) loadBody(spec, *world, ids);
    if (scene.contains("elements")) {
        for (const json& spec : scene["elements"]) loadElement(spec, *world, ids);
    }
    if (scene.contains("constraints")) {
        for (const json& spec : scene["constraints"]) loadConstraint(spec, *world, ids);
    }
    // "surfaces" (v0.2) are drawing/editor geometry: supports carry their own angle, so the
    // engine ignores them.
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
